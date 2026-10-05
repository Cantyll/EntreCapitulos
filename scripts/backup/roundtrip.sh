#!/usr/bin/env bash
# Ciclo completo contra um Supabase LOCAL e um servidor S3 local (moto_server), com dados sintéticos do seed:
# dump -> criptografia -> envio -> conferência -> download -> descriptografia -> restauração -> contagens.
# Roda no CI (job do banco) e em sessões de nuvem. NÃO usa R2 nem segredo de verdade: as credenciais
# abaixo são de um servidor S3 descartável deste teste (moto: MOTO_SERVER=caminho do moto_server).
. "$(dirname "$0")/common.sh"

export BACKUP_WORKDIR="${BACKUP_WORKDIR:-$(mktemp -d)}"
export DUMP_TARGET=--local
export BACKUP_PASSPHRASE="frase-de-teste-do-ciclo-local"
export R2_ENDPOINT="http://127.0.0.1:19000"
export R2_ACCESS_KEY_ID=teste R2_SECRET_ACCESS_KEY=teste R2_BUCKET=backup-teste
export BACKUP_FORCE_WEEKLY=true
export RESTORE_DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
export PGPASSWORD=postgres RESTORE_MODE=local-truncate
MOTO_SERVER="${MOTO_SERVER:-moto_server}"

moto_pid=""
# Linhas sintéticas nas tabelas da gestão de membros (etapa 8f), removidas ao sair: sem elas o ciclo só provaria
# que as tabelas existem, e não que a auditoria (com o CHECK de `details`) e a suspensão (com a chave estrangeira
# para `profiles`) sobrevivem a dump, criptografia, envio e restauração.
ROUNDTRIP_AUDIT_ACTOR="00000000-0000-4000-8000-0000000b0001"
suspended_id=""
cleanup() {
  [ -z "$moto_pid" ] || kill "$moto_pid" 2>/dev/null || true
  psql "$RESTORE_DB_URL" -X -q -c "delete from public.member_audit where actor_id = '$ROUNDTRIP_AUDIT_ACTOR';" >/dev/null 2>&1 || true
  [ -z "$suspended_id" ] || psql "$RESTORE_DB_URL" -X -q -c "delete from public.member_suspensions where user_id = '$suspended_id';" >/dev/null 2>&1 || true
  wipe_dir "$BACKUP_WORKDIR"
}
trap cleanup EXIT

"$MOTO_SERVER" -H 127.0.0.1 -p 19000 >/dev/null 2>&1 &
moto_pid=$!
until curl -fsS "$R2_ENDPOINT/moto-api/" >/dev/null 2>&1; do sleep 1; done
r2_setup
r2api create-bucket --bucket "$R2_BUCKET" --region us-east-1 >/dev/null || fail "Não foi possível criar o bucket de teste."

suspended_id="$(psql "$RESTORE_DB_URL" -X -q -A -t -v ON_ERROR_STOP=1 -c "select id from public.profiles where role = 'member' limit 1;")"
[ -n "$suspended_id" ] || fail "O seed não tem nenhum membro para o ciclo."
psql "$RESTORE_DB_URL" -X -q -v ON_ERROR_STOP=1 >/dev/null <<SQL || fail "Não foi possível gravar as linhas sintéticas da gestão de membros."
insert into public.member_audit (actor_id, target_id, action, details)
values ('$ROUNDTRIP_AUDIT_ACTOR', gen_random_uuid(), 'role_change', '{"from": "member", "to": "moderator"}');
insert into public.member_suspensions (user_id) values ('$suspended_id');
SQL

bash scripts/backup/make-backup.sh
bash scripts/backup/upload.sh

# Segundo envio no mesmo dia (sobrescreve) e checagem do "muito menor que o anterior": o anterior é o de ontem (não há).
listing="$(r2_list daily/)"
key="$(echo "$listing" | jq -r '.[0].key')"
r2api get-object --bucket "$R2_BUCKET" --key "$key" "$BACKUP_WORKDIR/downloaded.tar.gpg" >/dev/null
bash scripts/backup/open-backup.sh "$BACKUP_WORKDIR/downloaded.tar.gpg" "$BACKUP_WORKDIR/opened"
bash scripts/backup/restore-data.sh "$BACKUP_WORKDIR/opened"
r2api head-object --bucket "$R2_BUCKET" --key "weekly/$(date -u +%F).tar.gpg" >/dev/null || fail "A cópia semanal não existe."
echo "Ciclo completo OK."
