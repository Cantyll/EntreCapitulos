# Funções comuns dos scripts de backup (etapa 8d). Use com `. scripts/backup/common.sh`.
#
# REGRAS (testadas em tests/backup/): sem `set -x`, nunca `echo` de segredo, nenhuma saída de
# ferramenta que possa carregar linha de dado vai para o log. A saída das ferramentas vai para um
# arquivo em $BACKUP_WORKDIR e só aparece, filtrada, com BACKUP_VERBOSE=true em workflow_dispatch.
set -euo pipefail
umask 077

BACKUP_CONFIG="${BACKUP_CONFIG:-.github/backup.config.json}"
BACKUP_CLI="node scripts/backup/cli.mjs"

cfg() { jq -r "$1" "$BACKUP_CONFIG"; }

# Mensagem de erro (anotação do GitHub) e linha no resumo do job. Nunca recebe segredo nem dado.
fail() {
  echo "::error::$1" >&2
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

verbose_enabled() {
  [ "${BACKUP_VERBOSE:-false}" = "true" ] && [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ]
}

# Mostra o log de uma ferramenta SÓ no modo detalhado e sempre filtrado (sem linhas de dado nem segredos).
show_log() {
  verbose_enabled || return 0
  $BACKUP_CLI scrub BACKUP_PASSPHRASE R2_ACCOUNT_ID R2_ACCESS_KEY_ID R2_SECRET_ACCESS_KEY R2_BUCKET \
    SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF PGPASSWORD <"$1" >&2 || true
}

# Roda um comando guardando a saída (stdout e stderr) num arquivo; em falha, só uma mensagem fixa.
quiet() {
  local label="$1"
  shift
  local log="${BACKUP_WORKDIR:?}/tool.log"
  if ! "$@" >"$log" 2>&1; then
    show_log "$log"
    rm -f "$log"
    fail "Falhou: $label. Rode de novo com a opção verbose (workflow_dispatch) para ver a saída filtrada."
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

# aws s3api contra o endpoint do R2 (ou do MinIO nos testes). stdout é o resultado; stderr fica em arquivo.
r2api() {
  local log="${BACKUP_WORKDIR:?}/aws.log"
  if ! aws --endpoint-url "$R2_ENDPOINT" s3api "$@" 2>"$log"; then
    show_log "$log"
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
