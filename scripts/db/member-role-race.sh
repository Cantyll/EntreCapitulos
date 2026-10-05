#!/usr/bin/env bash
# Corrida entre administradores (etapa 8f), com CONEXÕES REAIS. O pgTAP roda numa transação só e não consegue
# provar isto. Roda contra o Supabase LOCAL (CI, job do banco, e sessões de nuvem): recusa qualquer outro banco.
#
#   1. Dois administradores se rebaixando AO MESMO TEMPO terminam com exatamente um administrador: o segundo
#      espera a trava, vê o resultado confirmado do primeiro e recebe `not_admin:`.
#   2. CONTROLE: a mesma função sem a trava termina SEM administrador. Prova que este teste enxerga o erro.
#   3. Quem não é administrador NUNCA espera a trava (recebe `not_admin:` na hora); o administrador espera.
#   4. Promover e suspender (ou excluir) a mesma pessoa ao mesmo tempo nunca deixa a equipe com suspensão
#      nem exclui uma pessoa que acabou de entrar para a equipe.
#   5. Em REPEATABLE READ ou SERIALIZABLE a função recusa (`unsupported_isolation:`).
#
# O script cria contas de teste fixas (ids terminados em f0001…f0005), tira o cargo das contas de
# administração que já existem no banco local (o seed) enquanto roda, e SEMPRE restaura tudo ao sair.
set -euo pipefail

DB_URL="${DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
export PGPASSWORD="${PGPASSWORD:-postgres}"
case "$DB_URL" in
  *@127.0.0.1:* | *@localhost:* | *@\[::1\]:*) ;;
  *) echo "Recusado: este teste só roda contra o banco local." >&2; exit 2 ;;
esac

WORK="$(mktemp -d)"
[ -n "$WORK" ] && [ -d "$WORK" ] || { echo "Não foi possível criar a pasta temporária." >&2; exit 2; }
PSQL=(psql "$DB_URL" -X -q -A -t -v ON_ERROR_STOP=1)
LOCK_KEY="entre-capitulos:member-management"
HOLD=3 # segundos que a primeira transação segura a trava

X=00000000-0000-4000-8000-0000000f0001 # administração
Y=00000000-0000-4000-8000-0000000f0002 # administração
T=00000000-0000-4000-8000-0000000f0003 # alvo (membro)
M=00000000-0000-4000-8000-0000000f0004 # membro que chama
N=00000000-0000-4000-8000-0000000f0005 # moderação que chama
FIXTURES="'$X','$Y','$T','$M','$N'"

q() { "${PSQL[@]}" -c "$1"; }
fail() { echo "FALHOU: $*" >&2; exit 1; }
ok() { echo "ok - $*"; }
clear_rc() { rm -f "${WORK:?}"/*.rc; }

cleanup() {
  set +e
  "${PSQL[@]}" -c "drop function if exists public.zz_race_control(uuid, text, text);" >/dev/null 2>&1
  "${PSQL[@]}" -c "delete from public.member_audit where actor_id in ($FIXTURES) or target_id in ($FIXTURES);" >/dev/null 2>&1
  "${PSQL[@]}" -c "delete from auth.users where id in ($FIXTURES);" >/dev/null 2>&1
  if [ -f "$WORK/original-admins" ]; then
    while read -r id; do
      [ -n "$id" ] && "${PSQL[@]}" -c "update public.profiles set role = 'admin' where id = '$id';" >/dev/null 2>&1
    done <"$WORK/original-admins"
  fi
  rm -rf "${WORK:?}"
}
trap cleanup EXIT

# ---------------------------------------------------------------------------------------------
# Preparação (confirmada de verdade: as outras conexões precisam enxergar)
# ---------------------------------------------------------------------------------------------
q "delete from auth.users where id in ($FIXTURES);" >/dev/null
q "select id from public.profiles where role = 'admin'" >"$WORK/original-admins"
q "insert into auth.users (id, email) values
   ('$X', 'race-x@teste.local'), ('$Y', 'race-y@teste.local'), ('$T', 'race-t@teste.local'),
   ('$M', 'race-m@teste.local'), ('$N', 'race-n@teste.local');" >/dev/null
q "update public.profiles set display_name_confirmed_at = now() where id in ($FIXTURES);" >/dev/null
q "update public.profiles set role = 'member' where role = 'admin' and id not in ($FIXTURES);" >/dev/null

reset_world() {
  q "delete from public.member_suspensions where user_id in ($FIXTURES);
     update public.profiles set role = 'admin' where id in ('$X', '$Y');
     update public.profiles set role = 'member' where id in ('$T', '$M');
     update public.profiles set role = 'moderator' where id = '$N';" >/dev/null
}
admins() { q "select count(*) from public.profiles where role = 'admin'"; }

# Uma sessão: abre transação, entra como `uid`, roda `stmt`, segura a trava por `hold` s e confirma.
# Saída em $WORK/<nome>.out e código de saída em $WORK/<nome>.rc.
session() {
  local name="$1" uid="$2" stmt="$3" hold="${4:-0}"
  cat >"$WORK/$name.sql" <<SQL
begin;
set local role authenticated;
select set_config('request.jwt.claims', '{"sub": "$uid", "role": "authenticated"}', true);
$stmt
select pg_sleep($hold);
commit;
SQL
  (
    set +e
    "${PSQL[@]}" -f "$WORK/$name.sql" >"$WORK/$name.out" 2>&1
    echo $? >"$WORK/$name.rc"
  ) &
}
await_rc() { while [ ! -f "$WORK/$1.rc" ]; do sleep 0.1; done; cat "$WORK/$1.rc"; }
wait_until() { # descrição, consulta que deve dar >= 1
  local tries=0
  until [ "$(q "$2")" -ge 1 ]; do
    tries=$((tries + 1)); [ "$tries" -lt 150 ] || fail "tempo esgotado esperando: $1"; sleep 0.1
  done
}
lock_held="select count(*) from pg_locks where locktype = 'advisory' and granted"
lock_waited="select count(*) from pg_stat_activity where wait_event_type = 'Lock' and wait_event = 'advisory'"

# ---------------------------------------------------------------------------------------------
# 1. Dois administradores se rebaixando ao mesmo tempo
# ---------------------------------------------------------------------------------------------
reset_world
[ "$(admins)" = "2" ] || fail "preparação: esperava 2 administradores, há $(admins)"
session a "$X" "select public.set_member_role('$Y', 'member');" "$HOLD"
wait_until "a primeira transação segurar a trava" "$lock_held"
session b "$Y" "select public.set_member_role('$X', 'member');"
wait_until "a segunda transação esperar a trava" "$lock_waited"
ok "a segunda chamada ficou ESPERANDO a trava enquanto a primeira não confirmou"
rc_a="$(await_rc a)"; rc_b="$(await_rc b)"
[ "$rc_a" = "0" ] || fail "a primeira chamada deveria funcionar (código $rc_a)"
[ "$rc_b" != "0" ] || fail "a segunda chamada deveria ser recusada"
grep -q "not_admin:" "$WORK/b.out" || fail "a segunda chamada deveria receber not_admin: depois da trava"
[ "$(admins)" = "1" ] || fail "esperava exatamente 1 administrador, há $(admins)"
[ "$(q "select role from public.profiles where id = '$X'")" = "admin" ] || fail "quem chegou primeiro deveria continuar administrador"
[ "$(q "select role from public.profiles where id = '$Y'")" = "member" ] || fail "quem foi rebaixado deveria ser membro"
[ "$(q "select count(*) from public.member_audit where action = 'role_change' and actor_id = '$X' and target_id = '$Y'")" = "1" ] \
  || fail "a mudança deveria ter exatamente uma linha de auditoria"
[ "$(q "select count(*) from public.member_audit where actor_id = '$Y'")" = "0" ] || fail "a chamada recusada não pode auditar"
ok "dois administradores se rebaixando juntos terminam com exatamente um administrador"
clear_rc

# ---------------------------------------------------------------------------------------------
# 2. Controle: a MESMA função sem a trava (o `perform pg_advisory_xact_lock` vira `perform 1`)
# ---------------------------------------------------------------------------------------------
control_sql="$(q "select pg_get_functiondef('public.set_member_role(uuid, text, text)'::regprocedure)" \
  | sed -E 's/public\.set_member_role\(/public.zz_race_control(/; s/perform pg_advisory_xact_lock\(.*\);/perform 1;/I')"
printf '%s' "$control_sql" | grep -q "zz_race_control" || fail "controle: não consegui renomear a cópia"
if printf '%s' "$control_sql" | grep -qi "pg_advisory_xact_lock"; then fail "controle: a trava continua na cópia"; fi
q "$control_sql" >/dev/null
q "grant execute on function public.zz_race_control(uuid, text, text) to authenticated;" >/dev/null
reset_world
session a "$X" "select public.zz_race_control('$Y', 'member');" "$HOLD"
sleep 1 # a chamada de A já terminou; A segue com a transação aberta (sem confirmar), como no cenário 1
session b "$Y" "select public.zz_race_control('$X', 'member');"
await_rc a >/dev/null; await_rc b >/dev/null
[ "$(admins)" = "0" ] || fail "controle: sem a trava esta corrida deveria deixar 0 administradores (há $(admins)); o teste não está enxergando o erro"
ok "controle: sem a trava os dois se rebaixam e ficam 0 administradores (o teste enxerga a corrida)"
q "drop function public.zz_race_control(uuid, text, text);" >/dev/null
clear_rc

# ---------------------------------------------------------------------------------------------
# 3. Quem não é administrador nunca espera a trava; o administrador espera
# ---------------------------------------------------------------------------------------------
reset_world
cat >"$WORK/holder.sql" <<SQL
begin;
select pg_advisory_xact_lock(hashtextextended('$LOCK_KEY', 0));
select pg_sleep(6);
commit;
SQL
("${PSQL[@]}" -f "$WORK/holder.sql" >"$WORK/holder.out" 2>&1; echo $? >"$WORK/holder.rc") &
wait_until "a trava ficar presa" "$lock_held"

call_as() { # uid, instrução -> imprime "milissegundos|saída"
  local start end out
  start="$(date +%s%N)"
  out="$("${PSQL[@]}" -c "set statement_timeout = '2s'; set role authenticated; select set_config('request.jwt.claims', '{\"sub\": \"$1\", \"role\": \"authenticated\"}', false); $2" 2>&1 || true)"
  end="$(date +%s%N)"
  echo "$(((end - start) / 1000000))|$out"
}
for who in "$M:um membro" "$N:a moderação"; do
  uid="${who%%:*}"; label="${who#*:}"
  res="$(call_as "$uid" "select public.set_member_role('$T', 'moderator');")"
  ms="${res%%|*}"; out="${res#*|}"
  echo "$out" | grep -q "not_admin:" || fail "$label deveria receber not_admin: (saída: $out)"
  [ "$ms" -lt 1500 ] || fail "$label esperou ${ms} ms: quem não é administrador não pode esperar a trava"
  ok "$label recebeu not_admin: em ${ms} ms, com a trava presa por outra conexão"
done
res="$(call_as "$X" "select public.set_member_role('$T', 'moderator');")"
echo "${res#*|}" | grep -qi "statement timeout" || fail "o administrador deveria ESPERAR a trava e estourar o tempo (saída: ${res#*|})"
ok "o administrador esperou a trava (estourou o limite de 2 s, nada mudou)"
[ "$(q "select role from public.profiles where id = '$T'")" = "member" ] || fail "nada deveria ter mudado"
await_rc holder >/dev/null
clear_rc

# ---------------------------------------------------------------------------------------------
# 4. Promover x suspender / excluir a mesma pessoa
# ---------------------------------------------------------------------------------------------
# 4a. promoção primeiro, suspensão depois -> staff_target
reset_world
session a "$X" "select public.set_member_role('$T', 'moderator');" "$HOLD"
wait_until "a promoção segurar a trava" "$lock_held"
session b "$Y" "select public.set_member_suspension('$T', true);"
wait_until "a suspensão esperar a trava" "$lock_waited"
await_rc a >/dev/null; rc_b="$(await_rc b)"
{ [ "$rc_b" != "0" ] && grep -q "staff_target:" "$WORK/b.out"; } || fail "4a: a suspensão deveria receber staff_target: (saída: $(cat "$WORK/b.out"))"
[ "$(q "select count(*) from public.member_suspensions where user_id = '$T'")" = "0" ] || fail "4a: a equipe não pode ficar suspensa"
ok "promover primeiro e suspender depois: a suspensão é recusada (staff_target:)"
clear_rc

# 4b. suspensão primeiro, promoção depois -> member_suspended
reset_world
session a "$X" "select public.set_member_suspension('$T', true);" "$HOLD"
wait_until "a suspensão segurar a trava" "$lock_held"
session b "$Y" "select public.set_member_role('$T', 'moderator');"
wait_until "a promoção esperar a trava" "$lock_waited"
await_rc a >/dev/null; rc_b="$(await_rc b)"
{ [ "$rc_b" != "0" ] && grep -q "member_suspended:" "$WORK/b.out"; } || fail "4b: a promoção deveria receber member_suspended: (saída: $(cat "$WORK/b.out"))"
[ "$(q "select role from public.profiles where id = '$T'")" = "member" ] || fail "4b: a pessoa suspensa não pode virar equipe"
ok "suspender primeiro e promover depois: a promoção é recusada (member_suspended:)"
clear_rc

# 4c. promoção primeiro, exclusão depois -> staff_cannot_delete
reset_world
session a "$X" "select public.set_member_role('$T', 'moderator');" "$HOLD"
wait_until "a promoção segurar a trava" "$lock_held"
session b "$Y" "select public.admin_delete_member('$T');"
wait_until "a exclusão esperar a trava" "$lock_waited"
await_rc a >/dev/null; rc_b="$(await_rc b)"
{ [ "$rc_b" != "0" ] && grep -q "staff_cannot_delete:" "$WORK/b.out"; } || fail "4c: a exclusão deveria receber staff_cannot_delete: (saída: $(cat "$WORK/b.out"))"
[ "$(q "select count(*) from auth.users where id = '$T'")" = "1" ] || fail "4c: a pessoa promovida não pode ter sido excluída"
ok "promover primeiro e excluir depois: a exclusão é recusada (staff_cannot_delete:)"
clear_rc

# ---------------------------------------------------------------------------------------------
# 5. REPEATABLE READ e SERIALIZABLE são recusados
# ---------------------------------------------------------------------------------------------
reset_world
for level in "repeatable read" "serializable"; do
  out="$("${PSQL[@]}" -c "begin isolation level $level; select 1; set local role authenticated; select set_config('request.jwt.claims', '{\"sub\": \"$X\", \"role\": \"authenticated\"}', true); select public.set_member_role('$T', 'moderator'); commit;" 2>&1 || true)"
  echo "$out" | grep -q "unsupported_isolation:" || fail "em $level a função deveria recusar (saída: $out)"
  ok "em $level a função recusa (unsupported_isolation:)"
done
[ "$(q "select role from public.profiles where id = '$T'")" = "member" ] || fail "a recusa por isolamento não pode mudar nada"

echo "Corrida entre administradores: tudo certo."
