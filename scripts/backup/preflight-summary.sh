#!/usr/bin/env bash
# Resumo da pré-verificação das credenciais no resumo do job (tabela Item, Resultado, Motivo, O que fazer).
# Roda num passo `if: always()` (existe mesmo que um passo posterior falhe) e lê só os registros de texto
# fixo gravados por preflight.sh. Uso: preflight-summary.sh <escopo>  (ou PREFLIGHT_SCOPE).
. "$(dirname "$0")/common.sh"
SCOPE="${1:-${PREFLIGHT_SCOPE:-}}"
export PREFLIGHT_DIR="${PREFLIGHT_DIR:-${RUNNER_TEMP:?RUNNER_TEMP não definida}/preflight}"
if ! $BACKUP_CLI pf-summary "$SCOPE" >>"${GITHUB_STEP_SUMMARY:-/dev/null}" 2>/dev/null; then
  echo "::warning::Não foi possível montar o resumo da pré-verificação das credenciais." >&2
fi
