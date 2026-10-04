/*
 * Cartão de instalação (etapa 8e): TEXTOS e REGRAS num só lugar, fáceis de mudar. O iOS não tem
 * `beforeinstallprompt`, então o site só mostra os passos. Quem decide quando mostrar é `src/lib/pwa/install-state.ts`
 * (função pura, com testes); este arquivo só guarda os números e as frases.
 *
 * Os passos do CARTÃO são só os essenciais (Compartilhar, Adicionar à Tela de Início, Adicionar), sem citar versão
 * do iOS. As observações sobre "Abrir como app da Web" e "Editar Ações" ficam só nas seções de /sobre e de /conta,
 * escritas para valer em mais de uma versão. NÃO VERIFICADO (conferir no iPhone real): os rótulos exatos em pt-BR,
 * o lugar do botão Compartilhar no iPad e o iPadOS em modo "site para computador".
 */

export const INSTALL_RULES = {
  /** Chave única do localStorage. A versão faz parte do nome: mudou o formato guardado, mude o número. */
  storageKey: 'ec:install:v1',
  /** No site público o cartão aparece a partir desta visita (uma visita = um dia do calendário local). */
  minVisitsPublic: 2,
  /** "Agora não" esconde o cartão por este número de dias. */
  dismissDays: 60,
  /** `?instalacao=ver` mostra o cartão ignorando contagem e dispensa (só no Safari do iOS fora do app instalado). */
  previewParam: 'instalacao',
  previewValue: 'ver',
  /** Rotas em que o cartão nunca aparece (a rota igual ou um subcaminho dela). */
  excludedPaths: ['/entrar', '/boas-vindas', '/conta/excluida'],
  /**
   * As páginas de erro e o 404 do site público se marcam com este atributo (componente `NoInstallCard`) e o cartão
   * some. Está aqui porque o cartão vive no layout e uma página de erro não muda o endereço.
   */
  suppressAttribute: 'data-no-install-card',
} as const;

export type InstallStep = { id: 'share' | 'add' | 'confirm'; text: string };

/** Os três passos, curtos, os mesmos no cartão e nas seções de /sobre e /conta. */
export const INSTALL_STEPS: readonly InstallStep[] = [
  { id: 'share', text: 'Toque em Compartilhar.' },
  { id: 'add', text: 'Escolha Adicionar à Tela de Início.' },
  { id: 'confirm', text: 'Toque em Adicionar.' },
];

export const INSTALL_CARD = {
  regionLabel: 'Instalar o Entre Capítulos',
  title: 'Instale o Entre Capítulos',
  lead: 'Abra o clube direto da Tela de Início, como um aplicativo.',
  later: 'Agora não',
  installed: 'Já instalei',
} as const;

/** Navegador embutido de aplicativo (Instagram, Facebook…): só uma dica curta e dispensável. */
export const INSTALL_HINT = {
  regionLabel: 'Dica de instalação',
  text: 'Para instalar como aplicativo, abra este site no Safari.',
  later: 'Agora não',
} as const;

/** Seções de /sobre ("Leia como aplicativo") e de /conta ("Instalar no iPhone"). */
export const INSTALL_GUIDE = {
  about: {
    title: 'Leia como aplicativo',
    lead: 'No iPhone ou no iPad, pelo Safari, você pode colocar o Entre Capítulos na Tela de Início e abrir o clube como se fosse um aplicativo.',
  },
  account: {
    title: 'Instalar no iPhone',
    lead: 'Para abrir o Entre Capítulos direto da Tela de Início, como um aplicativo:',
  },
  /** Observações que valem para mais de uma versão do iOS: só aqui, nunca no cartão. */
  notes: [
    'Se o iOS mostrar a opção “Abrir como app da Web”, deixe-a ligada.',
    'Se Adicionar à Tela de Início não aparecer na lista, role até o fim, toque em “Editar Ações” e adicione-a.',
    'Se você não encontrar o botão Compartilhar, toque no botão “⋯” da barra do Safari: ele costuma estar lá dentro.',
    'O ícone fica só no aparelho em que você o adicionou.',
  ],
} as const;
