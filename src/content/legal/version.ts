/*
 * Versão dos Termos de Uso que a pessoa aceita (etapa 8g). Fica em CÓDIGO: o banco só exige que exista um aceite
 * (`terms_acceptances`); se o aceite for de uma versão diferente desta, o app apenas pede um novo aceite ("Atualizamos
 * os Termos de Uso…"), sem bloquear.
 *
 * Formato AAAA-MM-DD, com um sufixo de sequência (".2", ".3"…) quando a data coincide com a da versão anterior (de 1 a
 * 32 caracteres, o limite da coluna). SEMPRE suba a versão quando o texto dos Termos ou dos combinados da comunidade
 * mudar, mesmo no mesmo dia: quem aceitou a versão anterior precisa ver o aviso. Junto com ela:
 *   1. `legalConfig.lastUpdated` (a data, sem o sufixo);
 *   2. a entrada nova em `TERMS_CHANGELOG`, logo abaixo (vai para `docs/revisao-juridica.md`, para o advogado);
 *   3. a impressão digital do texto em `terms-version.test.ts`;
 *   4. o aceite do `supabase/seed.sql`.
 * Os testes conferem os quatro. A Política de Privacidade tem o mesmo aceite, mas só os Termos e os combinados entram
 * na impressão digital.
 */
export const TERMS_VERSION = '2026-10-06.2';

/** O que mudou em cada versão dos Termos, da mais antiga para a mais nova. A última é a de `TERMS_VERSION`. */
export const TERMS_CHANGELOG: readonly { version: string; changes: readonly string[] }[] = [
  {
    version: '2026-10-06',
    changes: [
      'Etapa 8g: idade mínima de 18 anos, com a declaração no aceite (o site não verifica a idade); aceite registrado enquanto a conta existir.',
      'Responsabilidade do usuário pelo que escreve, cumprimento de ordem judicial específica de remoção e foro da Comarca de Sinop/MT.',
    ],
  },
  {
    version: '2026-10-06.2',
    changes: [
      'Nova regra nos combinados da comunidade, "Conteúdo adequado": "Sem conteúdo sexual explícito nem palavrões pesados; a moderação pode remover comentários que descumpram os combinados." (texto ditado pelo dono do site; validar com o advogado).',
      'Os combinados deixaram de ser editados na página Sobre: vivem em código (`src/content/legal/community-rules.ts`), versionados junto com os Termos. A seção "Combinados da comunidade" de `/termos` lista as cinco regras.',
    ],
  },
];
