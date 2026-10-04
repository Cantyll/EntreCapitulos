/**
 * Marca uma página (erro, 404) em que o cartão de instalação nunca aparece. O cartão vive no layout público, e uma
 * página de erro não muda o endereço, então a exclusão por rota não basta: o `InstallGate` esconde o cartão
 * enquanto houver este elemento na página (inclusive se ele surgir depois, quando o erro acontece no navegador).
 *
 * O nome do atributo é `INSTALL_RULES.suppressAttribute` (src/content/install.ts); um teste confere que continua igual.
 */
export function NoInstallCard() {
  return <span hidden data-no-install-card="" />;
}
