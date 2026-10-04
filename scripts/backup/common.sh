# Funções comuns dos scripts de backup (etapa 8d). Use com `. scripts/backup/common.sh`.
#
# REGRAS (testadas em tests/backup/): sem `set -x`, nunca `echo` de segredo e NENHUMA saída de
# ferramenta (stdout ou stderr de aws, supabase, gpg ou psql) vai para o log: ela vai para um arquivo em
# $BACKUP_WORKDIR e é apagada. Numa falha, só saem o texto fixo do script, o código de saída e o
# IDENTIFICADOR do erro (código do aws ou da CLI do Supabase, ou status HTTP), e só se passar pela lista
# estrita de lib.mjs (`ident`). Nunca a mensagem nem o resto da linha.
set -euo pipefail
umask 077

BACKUP_CONFIG="${BACKUP_CONFIG:-.github/backup.config.json}"
BACKUP_CLI="node scripts/backup/cli.mjs"

cfg() { jq -r "$1" "$BACKUP_CONFIG"; }

# Guarda o código de saída e o identificador do erro de uma ferramenta para o próximo `fail` anexar.
# Vai para um arquivo (e não para uma variável) porque `fail` pode rodar fora do subshell que chamou a
# ferramenta. $1 = arquivo com a saída da ferramenta; $2 = código de saída. Nada além disso é guardado.
note_error() {
  local file="$1" code="$2" ident detail
  [[ "$code" =~ ^[0-9]{1,3}$ ]] || code=1
  ident="$($BACKUP_CLI ident "$file" 2>/dev/null | head -n1 || true)"
  detail=" Código de saída ${code}."
  if [[ "$ident" =~ ^[A-Za-z][A-Za-z0-9_.]{0,63}$ || "$ident" =~ ^[0-9]{3}$ ]]; then
    detail+=" Identificador do erro: ${ident}."
  fi
  printf '%s' "$detail" >"${BACKUP_WORKDIR:?}/.last-error"
}

# Mensagem de erro (anotação do GitHub) e linha no resumo do job. Nunca recebe segredo nem dado.
fail() {
  local message="$1" detail=""
  if [ -n "${BACKUP_WORKDIR:-}" ] && [ -f "$BACKUP_WORKDIR/.last-error" ]; then
    detail="$(cat "$BACKUP_WORKDIR/.last-error")"
    rm -f "$BACKUP_WORKDIR/.last-error"
  fi
  echo "::error::${message}${detail}" >&2
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
    {
      echo "### ${BACKUP_TITLE:-Backup do banco}"
      echo "Resultado: **falha**"
    } >>"$GITHUB_STEP_SUMMARY"
  fi
  exit 1
}

# Exige variáveis de ambiente (secrets chegam como variáveis). Só o NOME aparece na mensagem.
need() {
  local name
  for name in "$@"; do
    if [ -z "${!name:-}" ]; then
      fail "Falta o segredo ou a variável $name (veja o passo a passo em docs/operacao.md, seção 15)."
    fi
  done
}

# Roda um comando guardando a saída (stdout e stderr) num arquivo; em falha, só uma mensagem fixa com o
# código de saída e o identificador do erro (ver `note_error`).
quiet() {
  local label="$1" code=0
  shift
  local log="${BACKUP_WORKDIR:?}/tool.log"
  "$@" >"$log" 2>&1 || code=$?
  if [ "$code" -ne 0 ]; then
    note_error "$log" "$code"
    rm -f "$log"
    fail "Falhou: $label."
  fi
  rm -f "$log"
}

r2_setup() {
  need R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET
  if [ -z "${R2_ENDPOINT:-}" ]; then
    need R2_ACCOUNT_ID
    R2_ENDPOINT="https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com"
  fi
  export R2_ENDPOINT
  export AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID"
  export AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=auto
  export AWS_REQUEST_CHECKSUM_CALCULATION=when_required
  export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required
  export AWS_PAGER=""
}

# aws s3api contra o endpoint do R2 (ou do S3 local nos testes). stdout é o resultado; stderr fica em
# arquivo, nunca no log (só o identificador do erro, via `note_error`).
r2api() {
  local log="${BACKUP_WORKDIR:?}/aws.log" code=0
  aws --endpoint-url "$R2_ENDPOINT" s3api "$@" 2>"$log" || code=$?
  if [ "$code" -ne 0 ]; then
    note_error "$log" "$code"
    rm -f "$log"
    return 1
  fi
  rm -f "$log"
}

# Lista os objetos de um prefixo como JSON [{key,size,lastModified}].
r2_list() {
  r2api list-objects-v2 --bucket "$R2_BUCKET" --prefix "$1" \
    --query 'Contents[].{key:Key,size:Size,lastModified:LastModified}' --output json ||
    fail "Não foi possível listar o bucket do R2."
}

supabase_cmd() {
  # SUPABASE_BIN="npx supabase" nos testes locais; "supabase" no CI.
  local -a bin
  read -ra bin <<<"${SUPABASE_BIN:-supabase}"
  "${bin[@]}" "$@"
}

# Apaga a pasta de trabalho (texto puro e criptografados temporários). `shred` quando existir.
wipe_dir() {
  local dir="$1"
  [ -n "$dir" ] && [ -d "$dir" ] || return 0
  if command -v shred >/dev/null 2>&1; then
    find "$dir" -type f -exec shred -u {} + 2>/dev/null || true
  fi
  rm -rf "$dir"
}
