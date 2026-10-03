#!/usr/bin/env bash
# Gera o backup: dumps pela CLI do Supabase, manifesto e arquivo CRIPTOGRAFADO (gpg, AES256).
# Entrada (variáveis): BACKUP_PASSPHRASE, BACKUP_WORKDIR, DUMP_TARGET (--linked, padrão; --local nos testes).
# Saída: $BACKUP_WORKDIR/backup.tar.gpg. O texto puro vive só em $BACKUP_WORKDIR/stage e é apagado aqui.
# Nada que venha do banco é impresso.
. "$(dirname "$0")/common.sh"
BACKUP_TITLE="Backup do banco"
need BACKUP_PASSPHRASE BACKUP_WORKDIR

STAGE="$BACKUP_WORKDIR/stage"
mkdir -p "$STAGE"
trap 'wipe_dir "$STAGE"; rm -f "$BACKUP_WORKDIR/backup.tar"' EXIT

target="${DUMP_TARGET:---linked}"
if [ "$target" = "--linked" ]; then
  need SUPABASE_ACCESS_TOKEN SUPABASE_DB_PASSWORD SUPABASE_PROJECT_REF
  # A senha e o token vêm do ambiente, nunca de argumentos (como no db-deploy.yml).
  quiet "vincular o projeto" supabase_cmd link --project-ref "$SUPABASE_PROJECT_REF"
fi
schemas="$(cfg '.dump.schemas | join(",")')"
excludes=()
while IFS= read -r table; do
  excludes+=(-x "$table")
done < <(cfg '.dump.excludeTables[]')

quiet "dump dos roles" supabase_cmd db dump "$target" --role-only -f "$STAGE/roles.sql"
quiet "dump do schema" supabase_cmd db dump "$target" -s "$schemas" -f "$STAGE/schema.sql"
quiet "dump dos dados" supabase_cmd db dump "$target" --data-only --use-copy -s "$schemas" "${excludes[@]}" -f "$STAGE/data.sql"

for file in roles.sql schema.sql data.sql; do
  [ -s "$STAGE/$file" ] || fail "O arquivo $file saiu vazio do dump."
done

$BACKUP_CLI counts "$STAGE/data.sql" "$STAGE/counts.json" || fail "Não foi possível contar as linhas do dump."
$BACKUP_CLI check-tables "$STAGE/counts.json" || fail "O dump não passou na conferência das tabelas (mensagem acima)."

cli_version="$(supabase_cmd --version 2>/dev/null | head -n1 | tr -cd '0-9A-Za-z.+-')"
latest_migration="$(ls supabase/migrations | sort | tail -n1)"
CLI_VERSION="$cli_version" REPO_LATEST_MIGRATION="$latest_migration" \
  $BACKUP_CLI manifest "$STAGE" "$STAGE/manifest.json" || fail "Não foi possível montar o manifesto."

tar -C "$STAGE" -cf "$BACKUP_WORKDIR/backup.tar" roles.sql schema.sql data.sql manifest.json

# A frase-senha entra pela entrada padrão do gpg (nunca como argumento nem em arquivo).
if ! printf %s "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --symmetric --cipher-algo AES256 --s2k-mode 3 --s2k-digest-algo SHA512 --s2k-count 65011712 \
  --output "$BACKUP_WORKDIR/backup.tar.gpg" "$BACKUP_WORKDIR/backup.tar" 2>/dev/null; then
  fail "Falhou a criptografia do backup."
fi
[ -s "$BACKUP_WORKDIR/backup.tar.gpg" ] || fail "O arquivo criptografado saiu vazio."
echo "Backup gerado e criptografado."
