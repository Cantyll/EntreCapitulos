#!/usr/bin/env bash
# Restaura os DADOS (data.sql) num banco e confere as contagens com o manifesto.
# Uso: restore-data.sh <pasta do backup aberto>
# Entrada: RESTORE_DB_URL (sem senha; a senha vai em PGPASSWORD), RESTORE_MODE:
#   local-truncate = banco LOCAL efêmero: esvazia as tabelas do backup antes (recusa se o host não for local)
#   empty-only     = projeto novo: recusa se qualquer tabela do backup já tiver linha
# Nunca imprime linha de dado: o psql roda com mensagens reduzidas ao SQLSTATE e a saída vai para arquivo.
. "$(dirname "$0")/common.sh"
need RESTORE_DB_URL RESTORE_MODE BACKUP_WORKDIR
dir="${1:?pasta}"

url="$RESTORE_DB_URL"
if [ "$RESTORE_MODE" = "empty-only" ] && [[ "$url" != *sslmode=* ]]; then
  if [[ "$url" == *\?* ]]; then url="$url&sslmode=require"; else url="$url?sslmode=require"; fi
fi

psql_quiet() {
  # -v VERBOSITY=sqlstate e SHOW_CONTEXT=never: o erro do Postgres pode citar a linha com o dado.
  local log="$BACKUP_WORKDIR/psql.log"
  if ! psql "$url" -X -q -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never "$@" >"$BACKUP_WORKDIR/psql.out" 2>"$log"; then
    local code
    code="$(grep -Eo 'ERROR:  [0-9A-Z]{5}' "$log" | head -n1 || true)"
    rm -f "$log" "$BACKUP_WORKDIR/psql.out"
    fail "Falhou uma instrução no banco de destino (${code:-sem código}). Os detalhes não são impressos por conterem dados."
  fi
  rm -f "$log"
}
psql_value() {
  psql "$url" -X -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never -c "$1" 2>/dev/null ||
    fail "Falhou uma consulta de conferência no banco de destino."
}

tables="$($BACKUP_CLI manifest-tables "$dir")" || fail "Manifesto inválido."

if [ "$RESTORE_MODE" = "local-truncate" ]; then
  case "$url" in
    *@127.0.0.1:* | *@localhost:*) ;;
    *) fail "RESTORE_MODE=local-truncate só vale para um banco local." ;;
  esac
  list="$(echo "$tables" | paste -sd, -)"
  psql_quiet -c "truncate $list cascade"
elif [ "$RESTORE_MODE" = "empty-only" ]; then
  $BACKUP_CLI counts-sql "$dir" >"$BACKUP_WORKDIR/counts.sql"
  existing="$(psql_value "$(cat "$BACKUP_WORKDIR/counts.sql")")"
  rm -f "$BACKUP_WORKDIR/counts.sql"
  nonzero="$(echo "$existing" | jq -r 'to_entries | map(select(.value > 0) | .key) | join(", ")')"
  [ -z "$nonzero" ] || fail "O projeto de destino não está vazio (há linhas em: $nonzero). A restauração só vale para um projeto novo e vazio."
else
  fail "RESTORE_MODE inválido."
fi

# Versões novas do pg_dump/psql escrevem \restrict/\unrestrict; um psql antigo não os entende.
clean="$BACKUP_WORKDIR/data.clean.sql"
sed -E '/^\\(un)?restrict /d' "$dir/data.sql" >"$clean"
psql_quiet --single-transaction -f "$clean"
rm -f "$clean"

$BACKUP_CLI counts-sql "$dir" >"$BACKUP_WORKDIR/counts.sql"
actual="$(psql_value "$(cat "$BACKUP_WORKDIR/counts.sql")")"
rm -f "$BACKUP_WORKDIR/counts.sql"
printf %s "$actual" >"$BACKUP_WORKDIR/actual.json"
$BACKUP_CLI compare "$dir" "$BACKUP_WORKDIR/actual.json" || fail "As contagens do banco restaurado não batem com o manifesto."
rm -f "$BACKUP_WORKDIR/actual.json"
echo "Dados restaurados e contagens conferidas."
