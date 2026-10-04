#!/usr/bin/env bash
# Pré-verificação das credenciais (preflight.sh, escopo selftest) de PONTA A PONTA contra um S3 local COM
# autenticação (moto, com o IAM ligado): o aws e o gpg são os de verdade, e o preflight.sh é o real. Cobre chave
# de acesso inválida, chave secreta errada, bucket inexistente, token só de leitura, endpoint inalcançável, frase
# trocada e passphrase_rotated. Roda no CI (job do banco). NÃO usa R2, Supabase nem segredo de verdade: as
# credenciais são de um servidor S3 descartável deste teste e os valores são sintéticos.
# O que este teste NÃO cobre: os códigos de erro do R2 de verdade e o Supabase (ver o PR).
#
# Limite do moto: com o IAM ligado ele recusa (SignatureDoesNotMatch) qualquer listagem cujo prefixo tenha uma
# barra, porque calcula a assinatura sem a codificação %2F. Por isso este teste usa uma CÓPIA da configuração
# com prefixos sem barra (daily-, weekly-, preflight-). O código é o mesmo e não depende do formato do prefixo.
. "$(dirname "$0")/common.sh"

MOTO_SERVER="${MOTO_SERVER:-moto_server}"
PORT=19001
EP="http://127.0.0.1:$PORT"
PASSPHRASE="frase-sintetica-do-roundtrip-do-preflight"
OTHER_PASSPHRASE="outra-frase-sintetica-que-nao-abre-nada"
BUCKET=bucket-do-preflight
work="$(mktemp -d)"
export BACKUP_WORKDIR="$work"
CONFIG="$work/backup.config.json"
jq '.prefixes = {daily: "daily-", weekly: "weekly-"} | .preflight.prefix = "preflight-"' "$BACKUP_CONFIG" >"$CONFIG"
export AWS_PAGER="" AWS_DEFAULT_REGION=us-east-1

moto_pid=""
cleanup() {
  [ -z "$moto_pid" ] || kill "$moto_pid" 2>/dev/null || true
  wipe_dir "$work"
}
trap cleanup EXIT

die() {
  echo "::error::Preflight roundtrip: $1" >&2
  exit 1
}

# As 6 primeiras ações (criar os dois usuários, as políticas e as chaves) passam sem autenticação; depois o
# moto passa a exigir chave, assinatura e permissão em todo pedido.
INITIAL_NO_AUTH_ACTION_COUNT=6 "$MOTO_SERVER" -H 127.0.0.1 -p "$PORT" >/dev/null 2>&1 &
moto_pid=$!
until curl -fsS "$EP/moto-api/" >/dev/null 2>&1; do sleep 1; done

admin() { AWS_ACCESS_KEY_ID=admin AWS_SECRET_ACCESS_KEY=admin aws --endpoint-url "$EP" "$@"; }
new_user() { # nome, ações permitidas (JSON); imprime "chave segredo"
  admin iam create-user --user-name "$1" >/dev/null
  admin iam put-user-policy --user-name "$1" --policy-name p \
    --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Action\":$2,\"Resource\":\"*\"}]}" >/dev/null
  admin iam create-access-key --user-name "$1" --query '[AccessKey.AccessKeyId,AccessKey.SecretAccessKey]' --output text
}
read -r RW_KEY RW_SECRET < <(new_user leitura-e-escrita '"s3:*"')
read -r RO_KEY RO_SECRET < <(new_user so-leitura '["s3:ListBucket","s3:GetObject"]')

s3() { AWS_ACCESS_KEY_ID="$RW_KEY" AWS_SECRET_ACCESS_KEY="$RW_SECRET" aws --endpoint-url "$EP" s3api "$@"; }
# Confirma que o IAM está mesmo valendo (senão os cenários de erro passariam em falso).
if AWS_ACCESS_KEY_ID=nao-existe AWS_SECRET_ACCESS_KEY=x aws --endpoint-url "$EP" s3api list-buckets >/dev/null 2>&1; then
  die "o servidor S3 de teste não está exigindo credenciais."
fi
s3 create-bucket --bucket "$BUCKET" >/dev/null

# Um "backup anterior" de verdade: criptografado com a mesma receita do make-backup.sh.
printf 'conteudo sintetico do backup anterior\n' >"$work/plain.txt"
printf %s "$PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --output "$work/previous.tar.gpg" "$work/plain.txt"
s3 put-object --bucket "$BUCKET" --key daily-2026-10-03.tar.gpg --body "$work/previous.tar.gpg" >/dev/null
s3 put-object --bucket "$BUCKET" --key weekly-2026-09-27.tar.gpg --body "$work/previous.tar.gpg" >/dev/null

# pf <nome> <status esperado> <item> <resultado> <razão> [VAR=valor ...]: roda o preflight.sh real e confere o
# registro do item, que todas as 5 verificações apareceram e que nada dos valores sintéticos foi para o log.
pf() {
  local name="$1" expected="$2" item="$3" result="$4" reason="$5"
  shift 5
  local dir status=0
  dir="$(mktemp -d "$work/run.XXXXXX")"
  env -i PATH="$PATH" HOME="$HOME" RUNNER_TEMP="$dir" BACKUP_WORKDIR="$work" \
    R2_ENDPOINT="$EP" R2_ACCESS_KEY_ID="$RW_KEY" R2_SECRET_ACCESS_KEY="$RW_SECRET" R2_BUCKET="$BUCKET" \
    BACKUP_PASSPHRASE="$PASSPHRASE" GITHUB_RUN_ID=777 GITHUB_RUN_ATTEMPT=1 BACKUP_CONFIG="$CONFIG" \
    "$@" bash scripts/backup/preflight.sh selftest >"$dir/out.txt" 2>&1 || status=$?
  [ "$status" = "$expected" ] || { cat "$dir/out.txt" >&2; die "$name: código de saída $status (esperado $expected)."; }
  local results="$dir/preflight/results.jsonl"
  [ "$(wc -l <"$results")" = 5 ] || die "$name: nem todas as verificações rodaram."
  jq -e --arg i "$item" --arg r "$result" --arg c "$reason" 'select(.item == $i and .result == $r and .reason == $c)' "$results" >/dev/null ||
    die "$name: o item $item não ficou como $result ($reason)."
  local secret
  for secret in "$RW_KEY" "$RW_SECRET" "$RO_KEY" "$RO_SECRET" "$PASSPHRASE" "$OTHER_PASSPHRASE" "$BUCKET"; do
    if grep -qF -- "$secret" "$dir/out.txt"; then die "$name: um valor de teste apareceu no log."; fi
  done
  if grep -q 'An error occurred\|SignatureDoesNotMatch\|Could not connect' "$dir/out.txt"; then
    die "$name: saída bruta do aws apareceu no log."
  fi
  grep -q "Pré-verificação das credenciais" "$dir/out.txt" || [ "$expected" = 0 ] || die "$name: a mensagem final não apareceu."
  echo "ok: $name"
}

pf "tudo certo, abre o backup anterior" 0 prev_daily OK ok
pf "tudo certo, também o semanal" 0 prev_weekly OK ok
pf "chave de acesso inválida" 1 r2_list FALHOU r2_key_invalid R2_ACCESS_KEY_ID=chave-que-nao-existe-no-iam
pf "chave secreta incorreta" 1 r2_list FALHOU r2_signature R2_SECRET_ACCESS_KEY=segredo-incorreto-de-teste-0123456789abcdef
pf "bucket inexistente" 1 r2_list FALHOU r2_no_bucket R2_BUCKET=bucket-que-nao-existe
pf "bucket inexistente pula a escrita" 1 r2_write PULADO skipped_dependency R2_BUCKET=bucket-que-nao-existe
pf "endpoint inalcançável" 1 r2_list FALHOU r2_unreachable R2_ENDPOINT=http://127.0.0.1:1
pf "token só de leitura: lista e baixa, mas não grava" 1 r2_write FALHOU r2_write_denied R2_ACCESS_KEY_ID="$RO_KEY" R2_SECRET_ACCESS_KEY="$RO_SECRET"
pf "token só de leitura ainda abre o backup anterior" 1 prev_daily OK ok R2_ACCESS_KEY_ID="$RO_KEY" R2_SECRET_ACCESS_KEY="$RO_SECRET"
pf "frase trocada: não abre o backup anterior" 1 prev_daily FALHOU prev_wrong BACKUP_PASSPHRASE="$OTHER_PASSPHRASE"
pf "frase trocada de propósito: pula a comparação" 0 prev_daily PULADO skipped_rotated BACKUP_PASSPHRASE="$OTHER_PASSPHRASE" \
  GITHUB_EVENT_NAME=workflow_dispatch PREFLIGHT_PASSPHRASE_ROTATED=true

# O teste de escrita só deixou o que apagou: nada novo em _preflight/, e daily- e weekly- intactos.
[ "$(s3 list-objects-v2 --bucket "$BUCKET" --prefix preflight- --query 'length(Contents || `[]`)' --output text)" = 0 ] ||
  die "sobrou um objeto de teste em preflight-."
[ "$(s3 list-objects-v2 --bucket "$BUCKET" --query 'length(Contents)' --output text)" = 2 ] ||
  die "o preflight mexeu em objetos que não eram dele."
echo "Preflight roundtrip OK."
