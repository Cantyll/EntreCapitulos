#!/usr/bin/env bash
# Restaura um backup num projeto Supabase NOVO e VAZIO (workflow db-restore.yml, ambiente "restore").
# Entrada (variáveis): BACKUP_CHOICE (daily/AAAA-MM-DD ou weekly/AAAA-MM-DD), DRY_RUN (true/false),
#   RESTORE_TARGET_PROJECT_REF, RESTORE_TARGET_DB_PASSWORD, PRODUCTION_PROJECT_REF, SUPABASE_ACCESS_TOKEN,
#   BACKUP_PASSPHRASE, R2_*, BACKUP_WORKDIR.
# Nunca imprime dado, contagem por tabela, e-mail nem segredo.
. "$(dirname "$0")/common.sh"
BACKUP_TITLE="Restauração do backup"
need BACKUP_CHOICE BACKUP_WORKDIR RESTORE_TARGET_PROJECT_REF RESTORE_TARGET_DB_PASSWORD SUPABASE_ACCESS_TOKEN BACKUP_PASSPHRASE
mkdir -p "$BACKUP_WORKDIR"
r2_setup

# Salvaguarda 1: nunca restaurar sobre a produção. Falha fechado se a referência da produção não foi informada.
if [ -z "${PRODUCTION_PROJECT_REF:-}" ]; then
  fail "A variável de repositório PRODUCTION_PROJECT_REF não está configurada. Ela é usada para recusar a produção como destino (docs/operacao.md, seção 15)."
fi
if [ "$RESTORE_TARGET_PROJECT_REF" = "$PRODUCTION_PROJECT_REF" ]; then
  fail "RECUSADO: o projeto de destino é o de produção. A restauração só vale para um projeto novo e vazio."
fi

key="$($BACKUP_CLI parse-choice "$BACKUP_CHOICE")" || fail "Escolha de backup inválida (mensagem acima)."
r2api get-object --bucket "$R2_BUCKET" --key "$key" "$BACKUP_WORKDIR/restore.tar.gpg" >/dev/null ||
  fail "Não foi possível baixar esse backup do R2. Confira a data escolhida."
bash "$(dirname "$0")/open-backup.sh" "$BACKUP_WORKDIR/restore.tar.gpg" "$BACKUP_WORKDIR/opened"

# A partir daqui tudo mira o projeto de DESTINO (a senha e o token vêm do ambiente, não de argumentos).
export SUPABASE_DB_PASSWORD="$RESTORE_TARGET_DB_PASSWORD"
export PGPASSWORD="$RESTORE_TARGET_DB_PASSWORD"
quiet "vincular o projeto de destino" supabase_cmd link --project-ref "$RESTORE_TARGET_PROJECT_REF"
pooler_file="supabase/.temp/pooler-url"
[ -s "$pooler_file" ] || fail "A CLI não gravou o endereço de conexão do projeto de destino (supabase/.temp/pooler-url)."
export RESTORE_DB_URL
RESTORE_DB_URL="$(tr -d '\n' <"$pooler_file")"
export RESTORE_MODE=empty-only
target_url="$RESTORE_DB_URL"
if [[ "$target_url" != *sslmode=* ]]; then
  if [[ "$target_url" == *\?* ]]; then target_url="$target_url&sslmode=require"; else target_url="$target_url?sslmode=require"; fi
fi

target_value() {
  psql "$target_url" -X -Atq -v ON_ERROR_STOP=1 -v VERBOSITY=sqlstate -v SHOW_CONTEXT=never -c "$1" 2>/dev/null ||
    fail "Falhou uma consulta no projeto de destino."
}

# Salvaguarda 2: o destino precisa estar vazio de contas (auth.users sempre existe num projeto novo).
users="$(target_value 'select count(*) from auth.users')"
[ "$users" = "0" ] || fail "RECUSADO: o projeto de destino já tem contas. A restauração só vale para um projeto novo e vazio."

if [ "${DRY_RUN:-true}" = "true" ]; then
  quiet "simular as migrations no destino" supabase_cmd db push --dry-run
  {
    echo "### Restauração do backup"
    echo "Resultado: **simulação OK** (nada foi alterado)"
    echo "Backup: ${key}"
  } >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
  echo "Simulação concluída: backup aberto e conferido, destino vazio. Nada foi alterado."
  exit 0
fi

quiet "aplicar as migrations no destino" supabase_cmd db push --yes
bash "$(dirname "$0")/restore-data.sh" "$BACKUP_WORKDIR/opened"
covers="$(target_value 'select count(*) from public.books where cover_path is not null')"
{
  echo "### Restauração do backup"
  echo "Resultado: **OK**"
  echo "Backup: ${key}"
  echo "Livros com capa para reenviar pelo painel (os arquivos do Storage não entram no backup): ${covers}"
} >>"${GITHUB_STEP_SUMMARY:-/dev/null}"
echo "Restauração concluída e contagens conferidas."
