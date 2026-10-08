/*
 * Tutorial guiado do painel (etapa 8k): os passos são DADOS. Para mudar um texto, edite aqui; para uma
 * funcionalidade nova, acrescente o passo no capítulo certo com `since` igual ao novo `TOUR_VERSION`
 * (e suba `TOUR_VERSION` em `version.ts`): quem já viu o tutorial recebe a dica "Há novidades".
 *
 * Regras (conferidas em `src/lib/tour/tour.test.ts`):
 *  - ids únicos; título até 60 caracteres e texto até 280;
 *  - `target` é o valor de um atributo `data-tour="…"` (nunca uma classe) que existe na página do passo;
 *  - um passo sem `target` (ou cujo alvo não está na tela) aparece como cartão centralizado;
 *  - `go` só navega (nunca cria, edita, publica, aprova, suspende nem apaga nada); `try` convida a uma ação
 *    SEGURA de interface (trocar uma aba, alternar a pré-visualização) e nunca bloqueia o "Próximo";
 *  - nenhum passo foca campo de texto nem abre o teclado.
 */

export type TourRole = 'admin' | 'moderator';

export type ChapterId =
  | 'navegacao'
  | 'livros'
  | 'sessoes'
  | 'editor'
  | 'publicar'
  | 'comentarios'
  | 'membros'
  | 'sobre'
  | 'leitoras'
  | 'conta';

export type StepKind = 'info' | 'try' | 'go';

export type TourChapter = {
  id: ChapterId;
  number: number;
  title: string;
  roles: readonly TourRole[];
};

export type TourStep = {
  id: string;
  chapter: ChapterId;
  kind: StepKind;
  title: string;
  body: string;
  /** Valor de `data-tour`. Sem ele, cartão centralizado. */
  target?: string;
  /**
   * Alvo usado quando `target` não está visível. Os links da barra lateral (Ver o site, Minha conta) não existem no
   * celular: lá eles ficam em "Mais", e o passo destaca o botão "Mais".
   */
  altTarget?: string;
  /** Página do passo. Um passo `go` navega para ela; os demais só acontecem nela (ou em qualquer tela, sem rota). */
  route?: string;
  /** Só neste aparelho (o passo de instalação só aparece no Safari do iPhone/iPad fora do app instalado). */
  only?: 'ios-safari-outside-app';
  /** Versão do tutorial em que o passo entrou (para "Novidades"). */
  since: number;
};

const BOTH: readonly TourRole[] = ['admin', 'moderator'];
const ADMIN: readonly TourRole[] = ['admin'];

/** Os capítulos, na ordem do tour completo. A moderação só vê Comentários e Conta. */
export const TOUR_CHAPTERS: readonly TourChapter[] = [
  { id: 'navegacao', number: 1, title: 'Boas-vindas e navegação', roles: ADMIN },
  { id: 'livros', number: 2, title: 'Livros', roles: ADMIN },
  { id: 'sessoes', number: 3, title: 'Sessões', roles: ADMIN },
  { id: 'editor', number: 4, title: 'Editor', roles: ADMIN },
  { id: 'publicar', number: 5, title: 'Publicar', roles: ADMIN },
  { id: 'comentarios', number: 6, title: 'Comentários e moderação', roles: BOTH },
  { id: 'membros', number: 7, title: 'Membros e cargos', roles: ADMIN },
  { id: 'sobre', number: 8, title: 'Página Sobre', roles: ADMIN },
  { id: 'leitoras', number: 9, title: 'O que as leitoras veem', roles: ADMIN },
  { id: 'conta', number: 10, title: 'Conta e instalação', roles: BOTH },
];

export const TOUR_STEPS: readonly TourStep[] = [
  // 1. Boas-vindas e navegação
  {
    id: 'nav-boas-vindas',
    chapter: 'navegacao',
    kind: 'go',
    route: '/painel',
    title: 'Boas-vindas ao painel',
    body: 'Aqui você cadastra os livros, escreve as sessões, cuida dos comentários e da página Sobre. Este tour só mostra e explica: nada é criado, publicado ou apagado. Saia quando quiser com Esc ou com o botão Sair.',
    since: 1,
  },
  {
    id: 'nav-menu',
    chapter: 'navegacao',
    kind: 'info',
    route: '/painel',
    target: 'admin-nav',
    title: 'O menu',
    body: 'Este é o menu do painel. No computador ele fica na lateral; no celular, na barra de baixo, e o que não cabe nela fica em "Mais".',
    since: 1,
  },
  {
    id: 'nav-inicio',
    chapter: 'navegacao',
    kind: 'info',
    route: '/painel',
    target: 'overview-shortcuts',
    title: 'Início',
    body: 'A Visão geral é a porta de entrada: atalhos para Sessões, Livros, Comentários, Membros e Página Sobre.',
    since: 1,
  },
  {
    id: 'nav-site',
    chapter: 'navegacao',
    kind: 'info',
    route: '/painel',
    target: 'nav-site',
    altTarget: 'admin-more',
    title: 'Ver o site',
    body: 'Por aqui (no celular, em "Mais") você abre o site como as leitoras o veem, para conferir uma sessão depois de publicar.',
    since: 1,
  },
  {
    id: 'nav-conta',
    chapter: 'navegacao',
    kind: 'info',
    route: '/painel',
    target: 'nav-account',
    altTarget: 'admin-more',
    title: 'Minha conta',
    body: 'Seu nome de exibição, a cópia dos seus dados e a exclusão da conta ficam em Minha conta (no celular, em "Mais"). Voltamos a ela no fim do tour.',
    since: 1,
  },

  // 2. Livros
  {
    id: 'livros-lista',
    chapter: 'livros',
    kind: 'go',
    route: '/painel/livros',
    target: 'books-list',
    title: 'Seus livros',
    body: 'Cada livro tem um estado: na fila, lendo ou terminado. Só um livro fica "lendo" por vez, e é dele que saem as sessões novas.',
    since: 1,
  },
  {
    id: 'livros-novo',
    chapter: 'livros',
    kind: 'info',
    route: '/painel/livros',
    target: 'books-new',
    title: 'Cadastrar um livro',
    body: 'Comece por aqui: título, autoria, total de capítulos (uma estimativa, dá para corrigir depois) e a sinopse.',
    since: 1,
  },
  {
    id: 'livros-andamento',
    chapter: 'livros',
    kind: 'info',
    route: '/painel/livros',
    title: 'Começar, acompanhar e terminar',
    body: 'Ao começar um livro, o capítulo atual vai a 0 e sobe sozinho a cada sessão publicada. Ao terminar, você dá a nota e ele vai para a estante. Um livro só pode ser excluído enquanto não tiver sessões.',
    since: 1,
  },
  {
    id: 'livros-capa',
    chapter: 'livros',
    kind: 'info',
    route: '/painel/livros',
    title: 'Capa e tema automático',
    body: 'Quando você envia a capa do livro em leitura, o site passa a usar as cores dela. Se a capa tiver pouca cor, ou se você desligar o "Tema automático pela capa", o site volta ao rosa.',
    since: 1,
  },

  // 3. Sessões
  {
    id: 'sessoes-lista',
    chapter: 'sessoes',
    kind: 'go',
    route: '/painel/sessoes',
    target: 'sessions-list',
    title: 'Suas sessões',
    body: 'Aqui ficam todas as sessões, publicadas e rascunhos. Cada sessão cobre uma faixa de capítulos do livro em leitura.',
    since: 1,
  },
  {
    id: 'sessoes-filtros',
    chapter: 'sessoes',
    kind: 'info',
    route: '/painel/sessoes',
    target: 'sessions-filters',
    title: 'Filtros',
    body: 'Use os filtros para ver só os rascunhos ou só as publicadas.',
    since: 1,
  },
  {
    id: 'sessoes-nova',
    chapter: 'sessoes',
    kind: 'info',
    route: '/painel/sessoes',
    target: 'sessions-new',
    title: 'Nova sessão',
    body: 'Uma sessão nova começa logo depois da anterior. Um capítulo pertence a uma só sessão: as faixas não se sobrepõem, nem entre rascunhos.',
    since: 1,
  },

  // 4. Editor
  {
    id: 'editor-abrir',
    chapter: 'editor',
    kind: 'go',
    route: '/painel/sessoes/nova',
    title: 'O editor',
    body: 'Esta é a tela de escrever. Abrir não cria nada: a sessão só passa a existir quando você digita o título ou o texto.',
    since: 1,
  },
  {
    id: 'editor-barra',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-toolbar',
    title: 'Barra de formatação',
    body: 'Negrito, itálico, links, listas, citações e a caixa "Minha teoria". No celular, a barra sobe junto com o teclado.',
    since: 1,
  },
  {
    id: 'editor-divisoria',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-chapters',
    title: 'Divisória de capítulo',
    body: 'A divisória separa o relato por capítulo e é ela que permite cobrir o que a leitora ainda não leu. O título de cada capítulo se escreve aqui, em "Capítulos desta sessão".',
    since: 1,
  },
  {
    id: 'editor-trechos',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-notes',
    title: 'Trechos e anotações',
    body: 'Citação é um trecho curto e real do livro, com a referência. Anotação é um comentário seu. Os dois aparecem ao lado do relato.',
    since: 1,
  },
  {
    id: 'editor-perguntas',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-questions',
    title: 'Perguntas para a discussão',
    body: 'Perguntas que abrem a conversa nos comentários. Ficam cobertas para quem ainda não leu até o fim da sessão.',
    since: 1,
  },
  {
    id: 'editor-resumo',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-excerpt',
    title: 'Resumo',
    body: 'O resumo aparece na lista de sessões e no topo da página. Ele nunca é coberto: evite spoiler nele.',
    since: 1,
  },
  {
    id: 'editor-previa',
    chapter: 'editor',
    kind: 'try',
    route: '/painel/sessoes/nova',
    target: 'editor-tabs',
    title: 'Pré-visualizar',
    body: 'Experimente: toque em "Pré-visualizar" para ver a sessão como a leitora verá, e volte a "Escrever". Se preferir, siga em Próximo.',
    since: 1,
  },
  {
    id: 'editor-salvamento',
    chapter: 'editor',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'editor-status',
    title: 'Salvamento automático',
    body: 'O rascunho se salva sozinho uns segundos depois que você para de digitar. Sem conexão, o texto fica guardado no aparelho e é enviado quando a rede voltar.',
    since: 1,
  },

  // 5. Publicar
  {
    id: 'publicar-visibilidade',
    chapter: 'publicar',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'publish-visibility',
    title: 'Quem pode ler',
    body: 'Pública: qualquer pessoa lê. Só membros: só quem entrou na conta.',
    since: 1,
  },
  {
    id: 'publicar-comentarios',
    chapter: 'publicar',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'publish-comments',
    title: 'Comentários',
    body: 'Com os comentários fechados, a sessão continua no ar, mas ninguém comenta.',
    since: 1,
  },
  {
    id: 'publicar-impressao',
    chapter: 'publicar',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'publish-rating',
    title: 'Impressão até aqui',
    body: 'A sua nota para o livro até este ponto da leitura. É opcional.',
    since: 1,
  },
  {
    id: 'publicar-botao',
    chapter: 'publicar',
    kind: 'info',
    route: '/painel/sessoes/nova',
    target: 'publish-actions',
    title: 'Publicar',
    body: 'Publicar pede confirmação. Depois, mudanças só vão ao ar em "Salvar alterações". Uma sessão volta a rascunho só enquanto não tiver comentários, e só um rascunho pode ser excluído.',
    since: 1,
  },

  // 6. Comentários e moderação
  {
    id: 'comentarios-abas',
    chapter: 'comentarios',
    kind: 'go',
    route: '/painel/comentarios',
    target: 'comments-tabs',
    title: 'Comentários',
    body: 'Os comentários ficam em três abas: Para aprovar, Aprovados e Removidos. O número no sino e na barra mostra quantos esperam aprovação.',
    since: 1,
  },
  {
    id: 'comentarios-trocar-aba',
    chapter: 'comentarios',
    kind: 'try',
    route: '/painel/comentarios',
    target: 'comments-tabs',
    title: 'Trocar de aba',
    body: 'Experimente: toque em "Aprovados" e depois volte para "Para aprovar". Trocar de aba não muda nenhum comentário.',
    since: 1,
  },
  {
    id: 'comentarios-acoes',
    chapter: 'comentarios',
    kind: 'info',
    route: '/painel/comentarios',
    title: 'Aprovar, marcar spoiler, remover',
    body: 'Cada comentário pode ser aprovado, aprovado como spoiler (fica coberto para quem não leu até o capítulo que você marcar) ou removido. Um removido pode ser restaurado: ele volta para "Para aprovar".',
    since: 1,
  },
  {
    id: 'comentarios-regras',
    chapter: 'comentarios',
    kind: 'info',
    route: '/painel/comentarios',
    title: 'Quem passa pela aprovação',
    body: 'Os três primeiros comentários de cada pessoa esperam aprovação; depois disso, entram direto. Comentário com link (http, https ou www) sempre vai para análise.',
    since: 1,
  },
  {
    id: 'comentarios-lote',
    chapter: 'comentarios',
    kind: 'info',
    route: '/painel/comentarios',
    target: 'comments-bulk',
    title: 'Aprovar vários',
    body: 'Na aba Para aprovar, o botão "Aprovar os … desta página sem alerta" aprova só os comentários sem alerta que você está vendo (no máximo 20), nunca às cegas. Os com alerta ficam para você decidir um a um.',
    since: 1,
  },

  // 7. Membros e cargos
  {
    id: 'membros-numeros',
    chapter: 'membros',
    kind: 'go',
    route: '/painel/membros',
    target: 'members-stats',
    title: 'Membros',
    body: 'Quem tem conta no clube: o total, a equipe, quem está com os comentários suspensos e quem chegou nos últimos 7 dias.',
    since: 1,
  },
  {
    id: 'membros-busca',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    target: 'members-search',
    title: 'Buscar',
    body: 'Busque pelo começo do nome ou pelo e-mail exato. O e-mail nunca aparece no endereço da página.',
    since: 1,
  },
  {
    id: 'membros-filtros',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    target: 'members-filters',
    title: 'Filtros',
    body: 'Todos, Equipe, Suspensos e Novos.',
    since: 1,
  },
  {
    id: 'membros-cargos',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    target: 'members-roles-card',
    title: 'Os três cargos',
    body: 'Administração faz tudo. Moderação só cuida de Comentários e da própria conta. Membro lê e comenta, com as regras de moderação.',
    since: 1,
  },
  {
    id: 'membros-lista',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    target: 'members-table',
    title: 'A lista',
    body: 'Toque no nome de uma pessoa para abrir o perfil dela. A lista mostra o e-mail mascarado.',
    since: 1,
  },
  {
    id: 'membros-perfil',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    title: 'No perfil de uma pessoa',
    body: 'Você muda o cargo (para Administração, digita o nome da pessoa), suspende ou reativa os comentários e baixa os dados dela. A sua própria conta não tem essas ações. Cada consulta fica na auditoria.',
    since: 1,
  },
  {
    id: 'membros-excluir',
    chapter: 'membros',
    kind: 'info',
    route: '/painel/membros',
    title: 'Excluir uma conta',
    body: 'Só de membros: a equipe perde o cargo antes. Pede que você digite EXCLUIR, apaga os comentários da pessoa e as respostas ligadas a eles e não tem volta. Faça um backup manual antes.',
    since: 1,
  },

  // 8. Página Sobre
  {
    id: 'sobre-editor',
    chapter: 'sobre',
    kind: 'go',
    route: '/painel/sobre',
    target: 'about-editor',
    title: 'Página Sobre',
    body: 'Aqui você edita a página Sobre do clube. O visual segue as cores do livro em leitura; você cuida só do texto.',
    since: 1,
  },
  {
    id: 'sobre-foto',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-photo',
    title: 'Sua foto',
    body: 'A foto é recortada em quadrado e perde os dados de localização. O texto alternativo é obrigatório: descreva a foto para quem usa leitor de tela.',
    since: 1,
  },
  {
    id: 'sobre-abertura',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-intro',
    title: 'Abertura',
    body: 'O texto que abre a página, com negrito, itálico, links e listas.',
    since: 1,
  },
  {
    id: 'sobre-secoes',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-sections',
    title: 'Seções extras',
    body: 'Até três seções com título e texto, na ordem que você escolher (botões subir e descer).',
    since: 1,
  },
  {
    id: 'sobre-links',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-links',
    title: 'Links',
    body: 'Até cinco links, sempre com https.',
    since: 1,
  },
  {
    id: 'sobre-interruptores',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-toggles',
    title: 'Mostrar ou esconder',
    body: 'Três interruptores: os números do clube, o "Como funciona" e a chamada final.',
    since: 1,
  },
  {
    id: 'sobre-previa',
    chapter: 'sobre',
    kind: 'try',
    route: '/painel/sobre',
    target: 'about-preview',
    title: 'Pré-visualização',
    body: 'Experimente: veja a página no tamanho do celular e do computador, do jeito que está, mesmo antes de salvar.',
    since: 1,
  },
  {
    id: 'sobre-salvar',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-save',
    title: 'Salvar rascunho',
    body: 'O texto NÃO se salva sozinho: use "Salvar rascunho" para guardar sem publicar. Só você vê o rascunho.',
    since: 1,
  },
  {
    id: 'sobre-publicar',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-publish',
    title: 'Publicar',
    body: '"Publicar" salva e coloca a página no ar, com confirmação.',
    since: 1,
  },
  {
    id: 'sobre-historico',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    target: 'about-history',
    title: 'Histórico',
    body: 'As últimas 20 versões publicadas ficam aqui, e qualquer uma pode ser restaurada.',
    since: 1,
  },
  {
    id: 'sobre-fixo',
    chapter: 'sobre',
    kind: 'info',
    route: '/painel/sobre',
    title: 'O que não se edita aqui',
    body: 'Os combinados da comunidade, os textos legais (Termos e Privacidade) e a seção "Leia como aplicativo" são fixos: fazem parte dos Termos ou do site e não mudam por esta tela.',
    since: 1,
  },

  // 9. O que as leitoras veem
  {
    id: 'leitoras-progresso',
    chapter: 'leitoras',
    kind: 'info',
    title: '"Até que capítulo você leu?"',
    body: 'Cada leitora diz até onde leu. O que vem depois fica coberto, com um botão para revelar: os capítulos do relato, os comentários marcados como spoiler, as perguntas e os trechos.',
    since: 1,
  },
  {
    id: 'leitoras-fita',
    chapter: 'leitoras',
    kind: 'info',
    title: 'A fita de capítulos',
    body: 'A fita mostra os capítulos lidos, as sessões (a última em destaque) e a próxima, tracejada. Cada sessão tem um botão logo abaixo da fita, que abre a sessão.',
    since: 1,
  },
  {
    id: 'leitoras-aviso',
    chapter: 'leitoras',
    kind: 'info',
    title: 'Sempre à mostra',
    body: 'Título, resumo e números de capítulo aparecem sempre, para todo mundo. Evite spoiler neles.',
    since: 1,
  },
  {
    id: 'leitoras-site',
    chapter: 'leitoras',
    kind: 'info',
    target: 'nav-site',
    altTarget: 'admin-more',
    title: 'Confira no site',
    body: 'Depois de publicar, abra o site por aqui (no celular, em "Mais") para ver a sessão como as leitoras.',
    since: 1,
  },

  // 10. Conta e instalação
  {
    id: 'conta-minha-conta',
    chapter: 'conta',
    kind: 'info',
    target: 'nav-account',
    altTarget: 'admin-more',
    title: 'Minha conta',
    body: 'Em Minha conta (no celular, em "Mais") você muda o nome que aparece nos comentários e baixa uma cópia dos seus dados.',
    since: 1,
  },
  {
    id: 'conta-excluir',
    chapter: 'conta',
    kind: 'info',
    title: 'Excluir a conta',
    body: 'Uma conta da equipe só pode ser excluída depois de perder o cargo. Peça a outra pessoa da administração que mude o seu cargo para Membro antes.',
    since: 1,
  },
  {
    id: 'conta-instalar',
    chapter: 'conta',
    kind: 'info',
    only: 'ios-safari-outside-app',
    title: 'Instalar no iPhone',
    body: 'No Safari, toque em Compartilhar, escolha "Adicionar à Tela de Início" e toque em Adicionar. O painel abre como um aplicativo, sem a barra do navegador.',
    since: 1,
  },
  {
    id: 'conta-ajuda',
    chapter: 'conta',
    kind: 'info',
    target: 'help-button',
    title: 'O tutorial fica aqui',
    body: 'Sempre que quiser, toque no "?" para rever o tour, só a ajuda da tela em que você está ou um capítulo.',
    since: 1,
  },
];
