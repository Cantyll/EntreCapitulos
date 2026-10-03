#!/usr/bin/env bash
# Envia $BACKUP_WORKDIR/backup.tar.gpg ao R2 (daily/AAAA-MM-DD.tar.gpg; aos domingos, também weekly/),
# confere tamanho e SHA-256 do objeto e compara com o backup anterior.
# Entrada: R2_* (ou R2_ENDPOINT nos testes), BACKUP_WORKDIR, ACCEPT_SMALLER (true/false).
. "$(dirname "$0")/common.sh"
BACKUP_TITLE="Backup do banco"
need BACKUP_WORKDIR
r2_setup

file="$BACKUP_WORKDIR/backup.tar.gpg"
[ -s "$file" ] || fail "Não há arquivo de backup para enviar."

date_utc="$(date -u +%F)"
key="$(cfg '.prefixes.daily')${date_utc}.tar.gpg"
size="$(stat -c %s "$file")"
hash="$(sha256sum "$file" | cut -d' ' -f1)"

# Backup anterior (o mais recente que não seja o de hoje).
listing="$(r2_list "$(cfg '.prefixes.daily')")"
previous="$(printf %s "$listing" | $BACKUP_CLI previous "$key" || true)"
previous_size="-"
if [ -n "$previous" ]; then previous_size="$(echo "$previous" | cut -d' ' -f2)"; fi

$BACKUP_CLI check-size "$size" "$previous_size" "${ACCEPT_SMALLER:-false}" || fail "O tamanho do backup não passou na conferência (mensagem acima)."

r2api put-object --bucket "$R2_BUCKET" --key "$key" --body "$file" --metadata "sha256=$hash" >/dev/null ||
  fail "Falhou o envio do backup ao R2."

check_object() {
  local object_key="$1" info remote_size remote_hash
  info="$(r2api head-object --bucket "$R2_BUCKET" --key "$object_key" \
    --query '[ContentLength, Metadata.sha256]' --output text)" || fail "O objeto enviado não foi encontrado no R2."
  remote_size="$(echo "$info" | cut -f1)"
  remote_hash="$(echo "$info" | cut -f2)"
  [ "$remote_size" = "$size" ] || fail "O tamanho do objeto no R2 não bate com o do arquivo enviado."
  [ "$remote_hash" = "$hash" ] || fail "O SHA-256 do objeto no R2 não bate com o do arquivo enviado."
}
check_object "$key"

# Cópia semanal aos domingos (UTC), feita no próprio R2 (sem baixar nem recriptografar).
if [ "$(date -u +%u)" = "7" ] || [ "${BACKUP_FORCE_WEEKLY:-false}" = "true" ]; then
  weekly="$(cfg '.prefixes.weekly')${date_utc}.tar.gpg"
  r2api copy-object --bucket "$R2_BUCKET" --key "$weekly" --copy-source "$R2_BUCKET/$key" >/dev/null ||
    fail "Falhou a cópia semanal no R2."
  check_object "$weekly"
fi

{
  echo "### Backup do banco"
  echo "Resultado: **OK**"
  echo "Tamanho: ${size} bytes"
  echo "Data: ${date_utc} (UTC)"
} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "Backup enviado e conferido."
