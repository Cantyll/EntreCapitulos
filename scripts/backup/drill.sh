#!/usr/bin/env bash
# Prova de restauração semanal. Uso: drill.sh freshness | drill.sh restore
#   freshness: confere a idade do backup diário mais recente (36 h) e do semanal (8 dias).
#   restore:   baixa o semanal mais recente, descriptografa e restaura num Supabase LOCAL efêmero
#              (já de pé), comparando as contagens com o manifesto. O texto puro nunca sai do runner.
. "$(dirname "$0")/common.sh"
BACKUP_TITLE="Prova de restauração do backup"
need BACKUP_WORKDIR
r2_setup
mkdir -p "$BACKUP_WORKDIR"

latest_of() { # $1 = prefixo; imprime "chave tamanho data" ou nada
  r2_list "$1" | $BACKUP_CLI latest
}

case "${1:-}" in
  freshness)
    daily="$(latest_of "$(cfg '.prefixes.daily')")"
    [ -n "$daily" ] || fail "Não há nenhum backup diário no R2."
    $BACKUP_CLI check-age daily "$(echo "$daily" | cut -d' ' -f3)" || fail "O backup diário está velho demais (mensagem acima)."
    weekly="$(latest_of "$(cfg '.prefixes.weekly')")"
    [ -n "$weekly" ] || fail "Não há nenhum backup semanal no R2. Eles são criados aos domingos pelo workflow Backup do banco."
    $BACKUP_CLI check-age weekly "$(echo "$weekly" | cut -d' ' -f3)" || fail "O backup semanal está velho demais (mensagem acima)."
    echo "Idades dos backups conferidas."
    ;;
  restore)
    need BACKUP_PASSPHRASE
    weekly="$(latest_of "$(cfg '.prefixes.weekly')")"
    [ -n "$weekly" ] || fail "Não há nenhum backup semanal no R2."
    key="$(echo "$weekly" | cut -d' ' -f1)"
    r2api get-object --bucket "$R2_BUCKET" --key "$key" "$BACKUP_WORKDIR/drill.tar.gpg" >/dev/null ||
      fail "Falhou o download do backup semanal."
    bash "$(dirname "$0")/open-backup.sh" "$BACKUP_WORKDIR/drill.tar.gpg" "$BACKUP_WORKDIR/opened"
    export RESTORE_DB_URL="${RESTORE_DB_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
    export PGPASSWORD="${PGPASSWORD:-postgres}" RESTORE_MODE=local-truncate
    bash "$(dirname "$0")/restore-data.sh" "$BACKUP_WORKDIR/opened"
    {
      echo "### Prova de restauração do backup"
      echo "Resultado: **OK**"
      echo "Backup restaurado: ${key} (contagens conferidas com o manifesto)"
    } >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
    echo "Prova de restauração OK."
    ;;
  *) fail "Uso: drill.sh freshness | restore" ;;
esac
