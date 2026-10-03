#!/usr/bin/env bash
# Descriptografa um backup baixado e confere o manifesto e os SHA-256.
# Uso: open-backup.sh <arquivo.tar.gpg> <pasta de saída>. Entrada: BACKUP_PASSPHRASE, BACKUP_WORKDIR.
# O texto puro fica SÓ na pasta de saída (dentro do runner).
. "$(dirname "$0")/common.sh"
need BACKUP_PASSPHRASE BACKUP_WORKDIR
file="${1:?arquivo}"
out="${2:?pasta}"
mkdir -p "$out"
tar_file="$BACKUP_WORKDIR/opened.tar"
trap 'rm -f "$tar_file"' EXIT

if ! printf %s "$BACKUP_PASSPHRASE" | gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 0 \
  --decrypt --output "$tar_file" "$file" 2>/dev/null; then
  fail "Não foi possível descriptografar o backup: a frase-senha está errada ou o arquivo está corrompido."
fi

# Só os quatro arquivos esperados, sem caminhos estranhos.
expected="$(printf '%s\n' data.sql manifest.json roles.sql schema.sql)"
[ "$(tar -tf "$tar_file" | sort)" = "$expected" ] || fail "O conteúdo do backup não é o esperado."
tar -C "$out" --no-same-owner -xf "$tar_file"
$BACKUP_CLI verify-manifest "$out" || fail "O backup não passou na conferência do manifesto."
echo "Backup aberto e conferido."
