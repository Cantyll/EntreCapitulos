#!/usr/bin/env bash
# Pré-verificação das credenciais do backup. Uso: preflight.sh <escopo>  (ou a variável PREFLIGHT_SCOPE).
# Escopos (lib.mjs, SCOPES): backup, drill, check-backup, check-restore e selftest (só o CI, contra um S3 local).
#
# TODAS as verificações rodam, mesmo que uma falhe; o passo só falha no fim (se houver qualquer FALHOU).
# Cada resultado é um registro de texto FIXO em $PREFLIGHT_DIR/results.jsonl (item, resultado, razão); o
# resumo do job (preflight-summary.sh, `if: always()`) e as anotações saem desses registros.
#
# REGRAS (testadas em tests/backup/):
#  - nada de valor, prefixo, sufixo, hash nem tamanho de segredo, e nenhum stdout/stderr bruto de aws,
#    supabase, gpg ou psql: a saída de cada ferramenta vai para um arquivo em $RUNNER_TEMP e é apagada;
#  - a classificação dos erros é de lib.mjs (`classify`): só sai texto fixo (e, num erro desconhecido, o
#    identificador permitido);
#  - versões aparadas (sem espaço nas pontas) dos segredos passam por ::add-mask:: antes de qualquer uso;
#  - a escrita no R2 só roda nos escopos backup, check-backup e selftest, e só em _preflight/: nunca em
#    daily/ nem weekly/, e nunca no escopo restore (que é só leitura).
. "$(dirname "$0")/common.sh"

SCOPE="${1:-${PREFLIGHT_SCOPE:-}}"
if ! ITEMS="$($BACKUP_CLI pf-items "$SCOPE" 2>/dev/null)"; then
  echo "::error::Escopo da pré-verificação desconhecido." >&2
  exit 2
fi
if [ "$SCOPE" = "selftest" ] && [ -z "${R2_ENDPOINT:-}" ]; then
  echo "::error::O escopo selftest exige R2_ENDPOINT (S3 local)." >&2
  exit 2
fi
PF_DIR="${PREFLIGHT_DIR:-${RUNNER_TEMP:?RUNNER_TEMP não definida}/preflight}"
export PREFLIGHT_DIR="$PF_DIR" PREFLIGHT_SCOPE="$SCOPE"
rm -rf "$PF_DIR"
mkdir -p "$PF_DIR"
: >"$PF_DIR/results.jsonl"

CURRENT_STEP=setup
PF_DONE=0
PF_OUT=""
PF_CODE=0

pf_wipe_tmp() {
  if command -v shred >/dev/null 2>&1; then
    find "$PF_DIR" -type f ! -name results.jsonl -exec shred -u {} + 2>/dev/null || true
  fi
  find "$PF_DIR" -type f ! -name results.jsonl -delete 2>/dev/null || true
}
# Falha inesperada da própria pré-verificação: registra só o passo e o código de saída.
on_exit() {
  local code=$?
  if [ "$PF_DONE" != 1 ] && [ "$code" -ne 0 ]; then
    $BACKUP_CLI pf-internal "$CURRENT_STEP" "$code" 2>/dev/null || true
  fi
  pf_wipe_tmp
}
trap on_exit EXIT

has_item() { grep -qx "$1" <<<"$ITEMS"; }
pf_skip() { $BACKUP_CLI pf-record "$1" PULADO "$2"; }
# Roda uma ferramenta guardando stdout e stderr num arquivo (nunca na tela); o código fica em PF_CODE.
pf_run() {
  local step="$1"
  shift
  CURRENT_STEP="$step"
  PF_OUT="$PF_DIR/$step.out"
  PF_CODE=0
  "$@" >"$PF_OUT" 2>&1 || PF_CODE=$?
}
# Classifica o resultado do passo (texto fixo) e apaga a saída da ferramenta.
pf_done() {
  $BACKUP_CLI pf-classify "$1" "$PF_CODE" "$PF_OUT"
  rm -f "$PF_OUT"
}
rotated_enabled() {
  [ "${PREFLIGHT_PASSPHRASE_ROTATED:-false}" = "true" ] && [ "${GITHUB_EVENT_NAME:-}" = "workflow_dispatch" ]
}

# --- Valores aparados dos segredos (V_NOME) ----------------------------------------------------
trim() {
  local value="$1"
  value="${value#"${value%%[![:space:]]*}"}"
  value="${value%"${value##*[![:space:]]}"}"
  printf '%s' "$value"
}
# Só valores DERIVADOS (aparados) que diferem do segredo: o GitHub já mascara o segredo inteiro.
mask_value() {
  local line
  while IFS= read -r line; do
    [ -z "$line" ] || printf '::add-mask::%s\n' "$line"
  done <<<"$1"
}
for name in $($BACKUP_CLI pf-secret-names); do
  raw="${!name-}"
  trimmed="$(trim "$raw")"
  if [ -n "$trimmed" ] && [ "$trimmed" != "$raw" ]; then mask_value "$trimmed"; fi
  printf -v "V_$name" '%s' "$trimmed"
done
have() {
  local var="V_$1"
  [ -n "${!var:-}" ]
}

# Restore sem os segredos do destino ainda criados: o bloco do Supabase inteiro é pulado (normal).
TARGET_PENDING=0
if [ "$SCOPE" = "check-restore" ] && [ -z "${RESTORE_TARGET_PROJECT_REF:-}" ] && [ -z "${RESTORE_TARGET_DB_PASSWORD:-}" ]; then
  TARGET_PENDING=1
fi
is_target_item() {
  case "$1" in
    fmt.SUPABASE_ACCESS_TOKEN | fmt.RESTORE_TARGET_* | sb_token | sb_project | sb_db) return 0 ;;
    *) return 1 ;;
  esac
}

# --- 1. Presença e formato (sem mostrar valores) -----------------------------------------------
for item in $ITEMS; do
  case "$item" in
    fmt.*)
      if [ "$TARGET_PENDING" = 1 ] && is_target_item "$item"; then
        pf_skip "$item" target_not_created
      else
        CURRENT_STEP=format
        $BACKUP_CLI pf-format "${item#fmt.}"
      fi
      ;;
  esac
done

PF_PREFIX="$(cfg '.preflight.prefix')"

# --- 2. R2: listagem e (só onde permitido) escrita de teste ------------------------------------
pf_r2_ready() {
  have R2_ACCESS_KEY_ID && have R2_SECRET_ACCESS_KEY && have R2_BUCKET && { [ -n "${R2_ENDPOINT:-}" ] || have R2_ACCOUNT_ID; }
}
if pf_r2_ready; then
  R2_ENDPOINT="${R2_ENDPOINT:-https://${V_R2_ACCOUNT_ID}.r2.cloudflarestorage.com}"
  export AWS_ACCESS_KEY_ID="$V_R2_ACCESS_KEY_ID" AWS_SECRET_ACCESS_KEY="$V_R2_SECRET_ACCESS_KEY"
  export AWS_DEFAULT_REGION=auto AWS_REQUEST_CHECKSUM_CALCULATION=when_required
  export AWS_RESPONSE_CHECKSUM_VALIDATION=when_required AWS_PAGER=""
  unset AWS_SESSION_TOKEN AWS_PROFILE
fi
# Limites de tempo para uma rede que não responde (o aws tenta por minutos se ninguém o impedir).
pf_aws() { aws --endpoint-url "$R2_ENDPOINT" --cli-connect-timeout 20 --cli-read-timeout 120 s3api "$@"; }

R2_LIST_OK=0
if has_item r2_list; then
  if pf_r2_ready; then
    pf_run r2_list pf_aws list-objects-v2 --bucket "$V_R2_BUCKET" --prefix "$PF_PREFIX" --max-keys 1
    [ "$PF_CODE" -ne 0 ] || R2_LIST_OK=1
    pf_done r2_list
  else
    pf_skip r2_list skipped_dependency
  fi
fi

if has_item r2_write; then
  if [ "$R2_LIST_OK" = 1 ]; then
    # Chave única por execução (o backup e o drill podem rodar ao mesmo tempo), sempre sob _preflight/.
    run_id="${GITHUB_RUN_ID:-0}"
    attempt="${GITHUB_RUN_ATTEMPT:-1}"
    key="${PF_PREFIX}${run_id//[^0-9]/}-${attempt//[^0-9]/}.txt"
    printf 'preflight\n' >"$PF_DIR/probe.txt"
    pf_run r2_put pf_aws put-object --bucket "$V_R2_BUCKET" --key "$key" --body "$PF_DIR/probe.txt"
    if [ "$PF_CODE" -ne 0 ]; then
      pf_done r2_put
    else
      rm -f "$PF_OUT"
      pf_run r2_delete pf_aws delete-object --bucket "$V_R2_BUCKET" --key "$key"
      pf_done r2_delete
    fi
  else
    pf_skip r2_write skipped_dependency
  fi
fi

# --- 3. Supabase: token, projeto, senha (na ordem do backup) -----------------------------------
if [ "$SCOPE" = "check-restore" ]; then
  SB_REF_NAME=RESTORE_TARGET_PROJECT_REF
  SB_PW_NAME=RESTORE_TARGET_DB_PASSWORD
else
  SB_REF_NAME=SUPABASE_PROJECT_REF
  SB_PW_NAME=SUPABASE_DB_PASSWORD
fi
sb_ref_var="V_$SB_REF_NAME"
sb_pw_var="V_$SB_PW_NAME"

# Restore: a mesma conexão do db-restore.yml (endereço do pooler que a CLI grava no link).
pf_psql_check() {
  local file="supabase/.temp/pooler-url" url
  [ -s "$file" ] || return 1
  url="$(tr -d '\n' <"$file")"
  case "$url" in
    *sslmode=*) ;;
    *\?*) url="$url&sslmode=require" ;;
    *) url="$url?sslmode=require" ;;
  esac
  psql "$url" -X -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never -c 'select 1'
}

SB_TOKEN_OK=0
SB_PROJECT_OK=0
if has_item sb_token; then
  if [ "$TARGET_PENDING" = 1 ]; then
    pf_skip sb_token target_not_created
  elif have SUPABASE_ACCESS_TOKEN; then
    export SUPABASE_ACCESS_TOKEN="$V_SUPABASE_ACCESS_TOKEN"
    pf_run sb_token supabase_cmd projects list
    [ "$PF_CODE" -ne 0 ] || SB_TOKEN_OK=1
    pf_done sb_token
  else
    pf_skip sb_token skipped_dependency
  fi
fi
if has_item sb_project; then
  if [ "$TARGET_PENDING" = 1 ]; then
    pf_skip sb_project target_not_created
  elif [ "$SB_TOKEN_OK" = 1 ] && [ -n "${!sb_ref_var:-}" ]; then
    pf_run sb_project supabase_cmd link --project-ref "${!sb_ref_var}"
    [ "$PF_CODE" -ne 0 ] || SB_PROJECT_OK=1
    pf_done sb_project
  else
    pf_skip sb_project skipped_dependency
  fi
fi
if has_item sb_db; then
  if [ "$TARGET_PENDING" = 1 ]; then
    pf_skip sb_db target_not_created
  elif [ "$SB_PROJECT_OK" = 1 ] && [ -n "${!sb_pw_var:-}" ]; then
    export SUPABASE_DB_PASSWORD="${!sb_pw_var}" PGPASSWORD="${!sb_pw_var}"
    if [ "$SCOPE" = "check-restore" ]; then
      pf_run sb_db pf_psql_check
    else
      # O mesmo primeiro comando do dump real (pg_dump no Docker, pelo pooler), para um arquivo
      # descartado: só roles, nenhum dado das leitoras, e nada é impresso.
      pf_run sb_db supabase_cmd db dump --linked --role-only -f "$PF_DIR/roles.sql"
    fi
    pf_done sb_db
    rm -f "$PF_DIR/roles.sql"
  else
    pf_skip sb_db skipped_dependency
  fi
fi

# --- 4. Frase-senha: ciclo no gpg e abertura do backup anterior --------------------------------
pf_gpg_cycle() {
  printf '%s\n' 'Entre Capitulos: texto fixo e inofensivo para testar a criptografia.' >"$PF_DIR/plain.txt"
  printf %s "$V_BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
    --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
    --output "$PF_DIR/cycle.gpg" "$PF_DIR/plain.txt" &&
    printf %s "$V_BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
      --decrypt --output "$PF_DIR/cycle.out" "$PF_DIR/cycle.gpg" &&
    cmp -s "$PF_DIR/plain.txt" "$PF_DIR/cycle.out"
}
GPG_OK=0
if has_item gpg_cycle; then
  if have BACKUP_PASSPHRASE; then
    pf_run gpg_cycle pf_gpg_cycle
    [ "$PF_CODE" -ne 0 ] || GPG_OK=1
    pf_done gpg_cycle
  else
    pf_skip gpg_cycle skipped_dependency
  fi
fi

# Abre o backup mais recente de um prefixo com a frase atual. A saída do gpg vai para /dev/null: o texto
# puro nunca existe no disco.
pf_previous() {
  local kind="$1" item="prev_$1" prefix entry key
  if rotated_enabled; then
    pf_skip "$item" skipped_rotated
    return 0
  fi
  if [ "$GPG_OK" != 1 ] || [ "$R2_LIST_OK" != 1 ]; then
    pf_skip "$item" skipped_dependency
    return 0
  fi
  prefix="$(cfg ".prefixes.$kind")"
  CURRENT_STEP="prev_${kind}_list"
  PF_OUT="$PF_DIR/prev_${kind}_list.out"
  PF_CODE=0
  pf_aws list-objects-v2 --bucket "$V_R2_BUCKET" --prefix "$prefix" \
    --query 'Contents[].{key:Key,size:Size,lastModified:LastModified}' --output json \
    >"$PF_DIR/prev.json" 2>"$PF_OUT" || PF_CODE=$?
  if [ "$PF_CODE" -ne 0 ]; then
    pf_done "prev_${kind}_list"
    return 0
  fi
  rm -f "$PF_OUT"
  # Só objetos com nome de backup (PREFIXO + AAAA-MM-DD.tar.gpg); qualquer outro objeto é ignorado.
  entry="$(jq -c --arg p "$prefix" '[.[]? | select((.key | startswith($p)) and (.key | ltrimstr($p) | test("^[0-9]{4}-[0-9]{2}-[0-9]{2}\\.tar\\.gpg$")))]' "$PF_DIR/prev.json" | $BACKUP_CLI latest)"
  if [ -z "$entry" ]; then
    $BACKUP_CLI pf-record "$item" OK prev_none
    return 0
  fi
  key="${entry%% *}"
  pf_run "prev_${kind}_get" pf_aws get-object --bucket "$V_R2_BUCKET" --key "$key" "$PF_DIR/prev.gpg"
  if [ "$PF_CODE" -ne 0 ]; then
    pf_done "prev_${kind}_get"
    return 0
  fi
  rm -f "$PF_OUT"
  CURRENT_STEP="prev_${kind}_open"
  PF_OUT="$PF_DIR/prev_${kind}_open.out"
  PF_CODE=0
  printf %s "$V_BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
    --decrypt "$PF_DIR/prev.gpg" >/dev/null 2>"$PF_OUT" || PF_CODE=$?
  rm -f "$PF_DIR/prev.gpg"
  pf_done "prev_${kind}_open"
}
has_item prev_daily && pf_previous daily
has_item prev_weekly && pf_previous weekly

# --- Fim: anotações e resultado (o passo falha aqui, se houver qualquer FALHOU) ----------------
PF_DONE=1
$BACKUP_CLI pf-finish "$SCOPE"
