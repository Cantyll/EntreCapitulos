/*
 * Versão dos Termos de Uso e da Política de Privacidade que a pessoa aceita (etapa 8g). Fica em CÓDIGO: o banco só
 * exige que exista um aceite (`terms_acceptances`); se o aceite for de uma versão diferente desta, o app apenas
 * pede um novo aceite, sem bloquear.
 *
 * Formato AAAA-MM-DD, de 1 a 32 caracteres (limite da coluna). Suba a versão quando um dos dois textos mudar de
 * forma relevante. Um teste confere que é a data de `legalConfig.lastUpdated`, e o `seed.sql` usa a mesma.
 */
export const TERMS_VERSION = '2026-10-06';
