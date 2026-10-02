# Entre Capítulos

Blog e clube de leitura da Agatha Montinelli. Ela publica **sessões de leitura** (relatos por grupo de capítulos) do livro atual, e os membros discutem cada sessão com **controle de spoiler por capítulo**. O site é 100% web e responsivo. Não há app nativo nesta fase.

O protótipo aprovado está em `docs/prototype/entre-capitulos.html`. Ele é a **fonte de verdade visual e de comportamento**: abra no navegador e use a pílula "Leitor / Administradora" no rodapé. Quando houver dúvida de layout, espaçamento, texto ou fluxo, siga o protótipo.

## Stack

- **Next.js** (App Router) com **TypeScript** estrito.
- **Supabase**: Postgres, Auth (Google e código de 6 dígitos por e-mail via OTP, sem link mágico: ver item 4 da seção PWA), Storage (capas) e Row Level Security.
- **Vercel** para hospedagem.
- **Estilo:** CSS com variáveis (tokens abaixo) e CSS Modules. Não usar bibliotecas de componentes prontas; os componentes seguem o protótipo.
- **Editor do relato:** Tiptap, com um nó próprio de "divisória de capítulo".
- **Imagens:** `sharp` no servidor, para processar a capa e extrair a paleta.
- **E-mail:** Resend, para enviar cada sessão aos inscritos (fase 2).
- **Testes:** Vitest para a lógica (spoiler, tema, contraste) e Playwright para os fluxos principais.

## Convenções

- Interface em **português do Brasil**. Código, nomes de tabelas e commits em inglês.
- URLs em português, e as pastas de rota seguem a URL: `/sessoes`, `/estante`, `/sobre`, `/entrar`, `/painel/...`. Conteúdo: `/livro` (atalho para o livro atual), `/livros/[slug]` (página do livro) e `/livros/[slug]/sessoes/[numero]` (sessão; a numeração reinicia a cada livro).
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `chore:`…).
- Server Components por padrão; Client Components só onde houver interação.
- Acessibilidade: contraste **WCAG AA** em todo texto, foco visível, navegação por teclado, `aria-label` em botões só com ícone.
- Nada de `localStorage` para dados importantes. Estado persistente fica no Supabase.

## Design system (extraído do protótipo)

**Fontes:** Newsreader (serifa, para títulos e o texto dos relatos) e Instrument Sans (interface). Carregar com `next/font/google`.

**Tokens padrão (tema rosa).** O tema automático pela capa sobrescreve os mesmos nomes.

| Token | Valor | Uso |
|---|---|---|
| `--bg` | `#FFF8F9` | fundo da página |
| `--surface` | `#FFFFFF` | cartões |
| `--soft` / `--soft-2` | `#FDEFF2` / `#F7DDE4` | fundos suaves, trilhas |
| `--line` / `--line-2` | `#F1DDE3` / `#E7C8D1` | bordas |
| `--rose` | `#CF6C88` | destaque gráfico (≥3:1) |
| `--rose-2` | `#B04C69` | botões, links (texto branco ≥4.5:1) |
| `--rose-deep` | `#7E3350` | texto de destaque, títulos de capítulo |
| `--rose-tint` | `#FBE6EC` | chips, estados ativos |
| `--ink` / `--ink-2` / `--ink-3` | `#2A1E24` / `#6C5961` / `#7B6671` | textos (o `--ink-3` já passa AA) |
| `--av1..4` | tons pastel | avatares |

Raios: 16px para cartões, 10px para campos e 999px para pílulas. **Elemento-assinatura:** a *fita de capítulos*, em que cada capítulo é um segmento agrupado por sessão, com a última sessão em `--rose-deep` e a próxima tracejada. Ela aparece na home, na página do livro (como grade de blocos), na lateral da sessão e no painel.

## Otimização para Safari e "Adicionar à Tela de Início" (PWA)

Uso principal em desktop, mas o site deve funcionar como um quase-aplicativo no Safari do iPhone e do iPad, instalado pela Tela de Início. Também vale para o Safari do Mac (Adicionar ao Dock). Não haverá app nativo, App Store nem Capacitor: é só web, com uma camada de PWA. Versão mínima de iOS/iPadOS: 16.4.

### 1. Manifest e ícones
- Criar `src/app/manifest.ts` com: `name` "Entre Capítulos", `short_name`, `start_url` "/", `scope` "/", `display` "standalone", `lang` "pt-BR", `background_color` e `theme_color` iguais ao `--bg` padrão (#FFF8F9).
- Os campos do manifest são estáticos e não seguem o tema automático da capa. Manter neutros.
- Ícones em PNG: 192, 512 e 512 *maskable*. Para o iOS, `apple-touch-icon` de 180x180, **sem transparência e sem cantos arredondados** (o iOS aplica a máscara).
- Em `layout.tsx`, usar `metadata.appleWebApp = { capable: true, title: "Entre Capítulos", statusBarStyle: "default" }`. Usar `default` (não `black-translucent`), porque o tema é claro.
- `viewport`: `viewportFit: "cover"`, `width: "device-width"`, `initialScale: 1`. **Não** bloquear zoom por pinça (acessibilidade). Atualizar `<meta name="theme-color">` com o `--rose-deep` do tema do livro atual.
- Opcional: `apple-touch-startup-image` por tamanho de tela, com fundo `--bg`, para evitar o flash branco ao abrir.

### 2. Layout e toque (o protótipo já cobre parte disso)
- Safe areas: manter `env(safe-area-inset-top/bottom)` em headers fixos ou *sticky* e barras inferiores, como no protótipo.
- Nunca usar `100vh`. Usar `100dvh` ou `height: 100%`.
- **Campos com no mínimo 16px de fonte no mobile**. Abaixo disso o iOS dá zoom automático ao focar. O protótipo usa 14,5px, então ajustar em `input, textarea, select`.
- Alvos de toque de pelo menos 44x44px em `@media (pointer: coarse)`. Os botões de ícone do protótipo têm 32 a 38px e precisam crescer.
- Efeitos de hover só dentro de `@media (hover: hover)`. Usar `touch-action: manipulation` e `-webkit-tap-highlight-color: transparent`.
- Manter `-webkit-backdrop-filter` junto de `backdrop-filter`.

### 3. Navegação sem barra do navegador
- No modo standalone não existe botão voltar nem barra de endereço. Toda página interna precisa de caminho de volta visível (breadcrumb ou botão "Voltar").
- Navegar sempre com `<Link>` dentro do escopo. Links externos abrem fora do app, então evitar quando possível.
- Detectar instalação com `matchMedia("(display-mode: standalone)")` e `navigator.standalone`, num hook `useIsStandalone`.

### 4. Login dentro do app instalado (crítico)
- No iOS, o app da Tela de Início tem **cookies e storage separados do Safari**. Um link mágico do e-mail abre no Safari e deixa o app deslogado.
- Portanto: entrar com **código de 6 dígitos por e-mail digitado dentro do app** (`signInWithOtp` + `verifyOtp` do Supabase), além do Google OAuth. Trocar "link mágico" por "código por e-mail" na seção de auth deste arquivo.
- Sessão longa com refresh de token. Testar o fluxo de login **dentro do app instalado**, não só no Safari.

### 5. Service worker e offline
- Usar Serwist (`@serwist/next`) ou um SW simples. Assets estáticos, fontes e capas: cache-first. HTML: network-first, com página `/offline` de fallback.
- **Nunca** cachear respostas autenticadas nem dados privados (comentários pendentes, painel).
- Prompt de atualização ("Nova versão disponível, atualizar") quando o SW novo estiver pronto.
- Leitura offline de sessões já abertas é Fase 3.
- Não tratar storage local como fonte da verdade: o iOS pode suspender ou recarregar o app a qualquer momento.

### 6. Convite para instalar
- O iOS não tem `beforeinstallprompt`. Criar um cartão discreto, exibido só no Safari iOS fora do modo standalone: "Instale o Entre Capítulos: toque em Compartilhar e depois em Adicionar à Tela de Início", com ícone ilustrativo e botão de dispensar (lembrar a dispensa em `localStorage`, dado não crítico).
- Mostrar a partir da segunda visita e fixo em "Sobre o clube". Também no painel, para a Agatha.

### 7. Painel da Agatha no celular
- Ela publicará pelo celular. O editor Tiptap deve ter a barra de formatação acima do teclado (usar `visualViewport` para reposicionar) e sem saltos ao focar.
- **Autosave no servidor com debounce** (~2 s) e cópia local em IndexedDB como reserva, porque o iOS pode descartar o app em segundo plano.
- Badge no ícone com a contagem de comentários pendentes (`navigator.setAppBadge`), disponível no iOS 16.4+ no app instalado.

### 8. Push (Fase 2 ou 3)
- No iOS, push só funciona no app instalado e só depois de um toque do usuário (botão "Avisar sessões novas"). Nunca pedir permissão ao carregar a página.
- Implementar com Web Push e VAPID (`web-push`). O e-mail continua sendo o canal principal.

### 9. Desempenho
- `next/font` com `display: swap`, `next/image` para capas, sem *layout shift*. Meta: LCP abaixo de 2,5 s em 4G e Lighthouse de PWA sem pendências.

### 10. Testes e critérios de aceite
- Testar em iPhone real (Safari e app instalado). Playwright com WebKit serve só como aproximação e não reproduz o modo standalone.
- Aceite: instala com o ícone e o nome certos; abre sem barra do navegador; nada fica sob o notch nem sob a barra inferior; nenhum campo dá zoom ao focar; login por código funciona dentro do app; o rascunho sobrevive a fechar e reabrir o app; a página offline aparece sem rede.

## Tema automático pela capa

Quando a Agatha envia a capa do livro atual, o site passa a usar a paleta dela. A implementação de referência está em `docs/theme-engine.reference.js`.

1. No upload, o servidor lê a imagem com `sharp` e a reduz para cerca de 96px.
2. Descarta pixels transparentes e quase brancos (fundo de fotos 3D).
3. Agrupa as cores com k-means (k=7) e registra a participação de cada uma.
4. Escolhe o destaque pela maior saturação ponderada pela presença na capa.
5. Gera os tokens com o matiz do destaque, ajustando a luminosidade até cumprir os contrastes mínimos (branco sobre `--rose-2` ≥ 4.5, `--ink-3` sobre `--soft` ≥ 4.5, `--rose-deep` sobre `--rose-tint` ≥ 7).
6. Salva `palette` e `theme_tokens` (jsonb) no livro. O layout injeta os tokens no `<html>` via `style`, sem cálculo no navegador do visitante.
7. Se a capa não tiver cor suficiente, mantém o tema padrão. A Agatha pode desligar o automático e escolher um tom fixo em Configurações.

Este motor precisa de testes unitários: capas coloridas, capa preto e branco e contraste de todos os pares.

**Implementação (etapa 3), `src/lib/theme/`** (TypeScript puro, sem DOM): `color.ts` (HSL, contraste WCAG, `fit`), `palette.ts` (`extractPalette` recebe RGBA bruto, k-means determinístico), `derive.ts` (`deriveTheme`, `measureContrasts`, `isAccessible`), `tokens.ts` (allow-list), `server.ts` (`getSiteTheme`, só servidor) e `tag.ts` (`THEME_TAG`).

- `deriveTheme` escolhe o destaque em duas passagens: limiares do protótipo (saturação > 0,22, luminosidade entre 0,12 e 0,85) e, se nenhuma cor passar, uma mais tolerante (> 0,12, entre 0,08 e 0,92), para capas pastel. Devolve `null` se nenhuma passagem achar cor ou se algum dos seis contrastes mínimos falhar (branco sobre `--rose-2` ≥ 4,5; `--ink-3` e `--ink-2` sobre `--soft` ≥ 4,5; `--rose-deep` sobre `--rose-tint` ≥ 7; `--ink` sobre `--bg` ≥ 7; `--rose` contra `--bg` ≥ 3).
- **Regra dos tokens (allow-list):** só as 17 chaves de `THEME_KEYS` e valores `#RRGGBB` viram `style` no `<html>`. `parseTokens` valida na gravação e na leitura; qualquer valor fora disso (ou token faltando) descarta o tema inteiro, e `getSiteTheme` ainda confere o contraste com `isAccessible`. Nunca interpole valor do banco em CSS por outro caminho.
- `getSiteTheme` lê o livro `reading` com cliente SEM cookies, em cache com a tag `theme` (e 5 minutos de rede de segurança). Toda Server Action que mexe em livro, capa ou tema chama `updateTag(THEME_TAG)` e `revalidatePath('/', 'layout')`. Qualquer falha cai no tema padrão: o tema nunca derruba o site. `generateViewport` usa o `--rose-deep` do tema na `theme-color`; o manifest continua estático.
- Capa: o navegador envia direto ao bucket `covers` (`books/<uuid>/<nome>`), e `finalizeCover` (`src/app/painel/livros/cover-actions.ts`, núcleo em `src/lib/books/finalize-cover.ts`) valida o caminho, confere o formato REAL com `sharp`, reencoda para WebP (máx. 1000x1500, sem metadados), extrai a paleta e grava. A capa anterior e as sobras só são apagadas DEPOIS de o update do livro dar certo. `next.config.ts` deriva `remotePatterns` de `NEXT_PUBLIC_SUPABASE_URL` e nunca derruba o build sem ela (sem a variável, a interface usa a capa gerada por CSS).

## Corpo da sessão, editor e autosave (etapa 4)

**Lista de permissões do corpo** (`src/lib/session-body/schema.ts`, zod `strictObject`, ao salvar e ao ler). Nós: `doc`, `paragraph`, `heading` (só nível 2; a página o mostra como `<h3>`), `blockquote` (só parágrafos), `bulletList`, `orderedList`, `listItem` (parágrafo + parágrafos/listas), `hardBreak`, `text`, `theory` (caixa "Minha teoria", só parágrafos; o título fixo é "Minha teoria", sem "(sem spoiler)": o texto pode ter spoiler) e `chapterDivider` (`attrs.chapter` inteiro ≥ 1, `attrs.title` opcional). Marcas: `bold`, `italic`, `link` (`href` só http, https ou mailto; o renderizador põe `rel="noopener noreferrer"`). Qualquer outro nó, marca ou atributo é recusado. Limites: 200 KB (bytes) e 12 níveis, conferidos antes do zod. Sem imagens. `canonicalizeBody` deixa o link só com `href` e copia `attrs` para objetos comuns: o ProseMirror guarda `attrs` em objetos sem protótipo, que o React não envia a uma Server Action. O teste `src/components/sessoes/editor/extensions.test.ts` garante que o esquema do editor e o do servidor concordam (inclusive com o `seed.sql`).

- **Divisórias:** capítulos estritamente crescentes e dentro de `[chapter_from, chapter_to]`; o que vem antes da primeira é a abertura (sempre visível no filtro de spoiler da etapa 5). No rascunho, violações são só aviso; ao publicar (e em sessão já no ar), ordem e faixa bloqueiam; capítulo da faixa sem divisória é só aviso. O título da divisória não se edita dentro do editor (um `<input>` dentro do ProseMirror dá problema de foco no iOS): fica em "Capítulos desta sessão".
- **Renderizador** (`SessionBody`): elementos React, sem `dangerouslySetInnerHTML`; uma `<section id="ch-N" data-chapter="N">` por divisor.
- **Autosave** (`src/lib/session-editor/autosave.ts`, puro, com testes; `useSessionAutosave` é só a cola): rascunho envia ~2 s após a última alteração e na hora em `visibilitychange` hidden/`pagehide`; sessão PUBLICADA nunca envia sozinha (botões "Salvar alterações"/"Descartar alterações"). Toda alteração vai para o IndexedDB (`session:<id>` ou `new:<bookId>`) antes do envio; ao abrir, "Restaurar?" só aparece se a cópia tem alterações não enviadas (`dirty`) e difere do servidor (não se compara relógio do aparelho). Uma gravação por vez; sem rede, reenvia com intervalo crescente e ao voltar a conexão. A sessão só vira linha no banco na primeira alteração de título ou texto (título vazio grava "Sem título" e o editor mostra o campo vazio).
- **`updated_at` é TEXTO OPACO.** O Postgres guarda microssegundos e o `Date` do JavaScript só tem milissegundos. Nunca converta para `Date`: compare como texto, no código e em `UPDATE … WHERE updated_at = '<texto>'`. Conflito (token diferente) devolve a versão do servidor e o editor oferece "Carregar a versão do servidor" ou "Sobrescrever com a minha". Comparar o conteúdo usa `stableStringify` (o jsonb devolve as chaves em outra ordem).
- **Server Actions** (`src/app/painel/sessoes/actions.ts`, regras em `src/lib/sessions/service.ts`): o cliente só manda a lista fixa `title, body, chapterFrom, chapterTo, visibility, commentsOpen, rating, excerpt`; status, `published_at`, `book_id`, `number` e `id` nunca vêm dele (o livro é o que está em leitura, o número é o maior + 1, o status só muda pelas funções do banco). Notas e perguntas são actions próprias e não tocam o `updated_at` da sessão. O teste-guarda confere um `requireRole` por action.
- **Publicar:** `publish_session` (só rascunho; `books.current_chapter = greatest(atual, chapter_to)` na mesma transação; `chapter_to` acima do total do livro é bloqueado antes, com atalho para corrigir o total) e `unpublish_session` (volta a `draft`, mantém `published_at`, não reduz `current_chapter`, recusa com `session_has_comments:` se houver qualquer comentário). Publicar grava o texto primeiro; se a função falhar, o token novo volta ao editor (`markSaved`). Antes da migration ser aplicada, o resto funciona e publicar mostra "Falta aplicar a atualização do banco".
- **Celular:** a barra de formatação sobe acima do teclado com `visualViewport` (`src/lib/session-editor/viewport.ts`), numa linha só (altura fixa, a página não pula), alvos de 44px, campos de 16px; a barra inferior do painel some nas telas do editor (`body:has([data-editor-root])`).

## Páginas públicas, cache e filtro de spoiler (etapa 5)

- **Dados públicos** (`src/lib/public/`): lidos com cliente SEM cookies (`client.ts`) dentro de `unstable_cache`, com as tags `books`, `sessions` e `session:<id>` (`tags.ts`) e rede de segurança de 5 minutos. Toda Server Action que cria, edita, publica, despublica ou apaga livro, sessão, nota ou pergunta chama `invalidateBooks()`/`invalidateSession(id)` (usam `updateTag`); o teste `tests/painel-guards.test.ts` confere. Dados por pessoa (login, progresso, sessões só para membros) vêm do cliente com cookies, em paralelo, e **nunca** entram no cache compartilhado. Sessão só para membros: visitante vê "Entre para continuar", idêntico a uma sessão inexistente; logada e inexistente dá 404.
- **Spoiler** (`src/lib/spoiler/`): progresso = último capítulo lido (0 = não começou). Capítulo N está coberto se N > progresso; a abertura nunca; notas e perguntas ficam cobertas enquanto progresso < `chapter_to` da sessão. Progresso desconhecido vale 0 e mostra "Até que capítulo você leu?". `setReadingProgress` valida inteiro 0..total. Logada: `reading_progress`; visitante: cookie. No login, o cookie migra só se não houver progresso no banco. É cortesia de leitura, não segurança: o texto coberto está no HTML.
- **Lição do PostgREST:** `upsert` em `reading_progress` falha (42501), porque o `ON CONFLICT DO UPDATE` tenta mudar `user_id`/`book_id` e o grant por coluna só deixa `chapter`. Use UPDATE e, se não houver linha, INSERT (com nova tentativa em 23505).
- **Lição do `loading.tsx`:** ele envolve os layouts aninhados, então um `notFound()` lançado abaixo dele vira status 200. Checagens de 404 ficam em layouts acima da fronteira, e o esqueleto das rotas com rotas dinâmicas aninhadas é um `Suspense` na própria página.
- **Fita de capítulos:** lógica pura em `src/lib/chapters/` (`strip.ts`, `layout.ts`); componentes `ChapterStrip` e `ChapterMap` em `src/components/public/`. A próxima sessão são os 3 capítulos depois de `current_chapter`, limitados ao total. Cores como no protótipo (`.strip`/`.strip.sm`): todos os segmentos com a mesma altura (16px; 8px na compacta), vão de 2px (1px na compacta), por ler = bloco sólido `--line-2`, sessão = `--rose` alternando um tom, última = `--rose-deep`, próxima = bloco contornado (tracejado na grande, contorno inteiro na compacta), lido sem sessão visível = `--rose` clareado. Nunca um traço fino. **Largura mínima de 3px por segmento:** se `total × 3px` mais os vãos não couber, a fita é desenhada por sessão (um bloco por sessão, largura proporcional, e UMA trilha para o que falta ler; cada bloco é um link "Sessão 1, capítulos 1 a 3"). O servidor não mede a largura: o HTML traz os dois desenhos e o CSS escolhe com `@container` numa escada de larguras (`STRIP_WIDTH_STEPS`, que precisa bater com `ChapterStrip.module.css`); acima de 300 capítulos só vem o desenho por sessão. Datas puras em `src/lib/site.ts` (fuso `America/Sao_Paulo`).
- **Proibido `dangerouslySetInnerHTML` em `src/`** (teste estático em `tests/static-rules.test.ts`).

### Cookies do site

Para a política de privacidade (etapa 7b). Todos são essenciais (sem banner de consentimento):

| Cookie | Finalidade | Duração | Atributos |
|---|---|---|---|
| `ec_progress` | Guarda até onde o visitante (sem login) leu, `{slug: capítulo}`, para o filtro de spoiler | 1 ano | `httpOnly`, `SameSite=Lax`, path `/`, `Secure` em produção |
| `ec_next` | Guarda para onde voltar depois do login pelo Google (só quando se usa o Google) | 10 minutos | `httpOnly`, `SameSite=Lax`, path `/auth/callback`, `Secure` em produção |
| `sb-…-auth-token` (e `.0`, `.1`…) | Sessão do Supabase Auth: mantém a pessoa logada | duração da sessão do Supabase | definidos pelo `@supabase/ssr` |

### Migrations (regra)

Antes de criar uma migration: liste `supabase/migrations/` e veja a mais recente (inclusive na `main`). Crie com `supabase migration new <nome>` e confirme que o timestamp é POSTERIOR ao da última. Migrations aplicadas nunca são editadas.

## Comentários, moderação e cache (etapa 6)

- **Quem decide o status é o banco**, nunca o cliente: o trigger `comments_before_insert` (equipe aprova direto; membro com 3 ou mais aprovados entra aprovado; os demais pendentes) e, desde a migration `comment_link_hold`, **comentário de quem não é equipe com `http://`, `https://` ou `www.` fica pendente mesmo com 3 aprovados**, e o trigger `comments_flag_links` grava "Contém link" em `comment_flags` (só a equipe lê). Endereço sem esses começos ("exemplo.com") não é segurado. A regra só vale com usuário logado (`auth.uid()` não nulo): seed e SQL Editor seguem livres. As funções de trigger não têm `execute` para a API.
- **`createComment`** (`src/app/(public)/comment-actions.ts`): `requireUser` (anônimo vai para /entrar); lista fixa no insert (`id` gerado no servidor, `session_id`, `author_id` = quem está logado, `parent_id`, `body`, `read_up_to`, `spoiler_up_to`), **nunca `status`**; `read_up_to` é o progresso que o servidor conhece (`getProgressFor`: linha de `reading_progress` com a reserva do cookie ainda não migrado; desconhecido = 0), nunca do cliente; `spoiler_up_to` nulo ou de `chapter_to + 1` até o total do livro. Corpo normalizado em `src/lib/comments/body.ts` (quebras, sem controle nem zero-width/bidi, 1 a 2000 caracteres contados por code point). Erros do banco mapeados em `src/lib/comments/errors.ts`. O formulário é controlado e envia no `onSubmit` (lição do React 19): o texto só é apagado quando o servidor aceita. Nunca logar o texto do comentário nem e-mail: `logFailure` só leva nome, código e status.
- **Texto como texto**: o comentário é renderizado por React (`white-space: pre-wrap`), sem HTML e sem autolink. O teste `tests/comment-markup.test.ts` garante que `<script>` e `<img onerror>` saem escapados.
- **Spoiler**: coberto quando `spoiler_up_to > progresso` (desconhecido = `UNKNOWN_PROGRESS`); o autor nunca vê o próprio comentário coberto. Mesmo mecanismo acessível dos capítulos (`inert`, `aria-hidden`, blur, botão com `aria-expanded` fora da área inerte, reduced-motion). A cobertura é calculada na tela com o progresso do momento, então mudar "Li até o" a atualiza sem recarregar.
- **Dados** (`src/lib/comments/queries.ts`): a página de 20 comentários de nível superior (mais recentes primeiro; `?ordem=antigos`) de uma sessão pública vem do cliente SEM cookies em `unstable_cache` com a tag `comments:<sessionId>` (uma consulta com autor e até 100 respostas embutidos, mais um count). Sessão "só para membros" e os pendentes do próprio autor vêm do cliente com cookies, em paralelo, sem cache, e são mesclados no servidor (`threads.ts`). **Toda leitura de `comments` filtra o estado explicitamente** (a equipe lê todos os estados pelo RLS); o teste `tests/comments-static.test.ts` confere. Resposta só aparece embaixo de um comentário aprovado que está na página, então resposta de pai removido nunca aparece solta. Mais de 100 respostas: a tela diz "Mostrando as 100 primeiras respostas.".
- **Cursor do "Carregar mais"** (`loadMoreComments`, Server Action): `(created_at, id)` com `created_at` como TEXTO OPACO (microssegundos; nunca `Date`), validado por regex antes de entrar no filtro `or=(…)`.
- **Tags de cache**: `comments:<sessionId>` e `comment-counts` (contagens aprovadas por sessão e por livro; `SessionSummary.commentCount`). `invalidateComments(sessionId)` (em `src/lib/public/tags.ts`, usa `updateTag`) é chamado por criar, aprovar, remover, restaurar, marcar ou tirar spoiler e por salvar a sessão (abrir ou fechar comentários, via `refreshPublic`). Nome e papel do autor ficam nos comentários em cache: mudança aparece em até 5 minutos (a rede de segurança).
- **Moderação** (`/painel/comentarios`, `src/app/painel/comentarios/actions.ts`): `requireRole('staff')` em cada page e action; a moderadora só abre esta página (`/painel` a redireciona para cá) e recebe 403 no resto; `tests/painel-guards.test.ts` exige `staff` só em Comentários, no layout e em `/painel`, e `admin` no resto. Abas Para aprovar, Aprovados e Removidos (20 por página, `?aba=&pagina=`). Toda mudança é `UPDATE … WHERE status = <esperado>` e confere se alguma linha mudou (conflito vira "Outra pessoa já moderou este comentário"). **Restaurar volta para "Para aprovar"**, nunca direto para aprovado. **"Aprovar os sem alerta" aprova só os pendentes SEM flag da página que a pessoa está vendo (no máximo 20)**: a action recebe os ids visíveis e revalida cada um no servidor; aprovar às cegas faria o contador de aprovados subir sem revisão. O contador de pendentes do painel é um head count no layout (`getPendingCount`), refeito por `revalidatePath('/painel', 'layout')` a cada moderação.
- **Login**: `getCurrentUser` agora devolve `nameConfirmed` (mesma consulta de `profiles`). A coluna `display_name_confirmed_at` já existe na nuvem, então **não há reserva para o erro 42703**: um erro de coluna falha de forma visível (também em `isNameConfirmed`).

## Privacidade, abuso e LGPD (etapa 7a)

- **Limite de frequência** (`comments_rate_limit`, trigger `BEFORE INSERT` separado; `comments_before_insert` não foi tocado): quem não é equipe publica no máximo **3 por minuto e 20 por hora**, contados por `author_id` e `created_at` em **todos os estados** (excluir não devolve a cota); equipe isenta; só vale com `auth.uid()` não nulo (seed e SQL Editor seguem livres). Lock consultivo por autor contra inserções simultâneas; índice `(author_id, created_at)`. Erro `rate_limited:` (errcode `P0001`), mapeado em `src/lib/comments/errors.ts` para "Você está comentando rápido demais. Espere um pouco e tente de novo."
- **`retract_comment(p_comment_id)`** (security definer, `search_path` vazio, só `authenticated`, recusa login anônimo): só o autor, só comentário ainda não `removed`; sobrescreve o corpo com "[comentário removido pelo autor]" e marca `removed` (o contador de aprovados cai pelo trigger existente); devolve o `session_id` para a action expirar o cache. Quem não é o autor recebe o mesmo `comment_not_found:` (P0002) de um id inexistente. **Respostas de outras pessoas ficam no banco, mas somem da tela** (a página só mostra resposta embaixo de pai aprovado). Server Action `retractComment` em `src/app/(public)/comment-actions.ts` (só manda o id; chama `invalidateComments`); botão com confirmação na linha (`RetractButton`) e aviso numa região de status que persiste acima da lista (`RetractNoticeProvider`, porque o comentário sai da lista quando a página é atualizada).
- **`delete_my_account()`** (security definer, `search_path` vazio, sem argumentos, sem `execute` para `anon`/`public`): apaga de `auth.users` só `auth.uid()`; recusa login anônimo e `admin`/`moderator` (`staff_cannot_delete:`; o papel precisa ser retirado antes, ver README). A cascata leva perfil, comentários, respostas de outras pessoas a eles, sinalizações e progresso; `storage.objects` não tem chave estrangeira para `auth.users`, então o Storage não bloqueia (testado no pgTAP e com uma conta real no Supabase local, com identidades e sessões do GoTrue). A action `deleteAccount` (`src/app/(public)/conta/actions.ts`) exige o texto `EXCLUIR` (conferido no servidor), recusa equipe antes de chamar o banco, depois encerra a sessão, apaga os cookies `sb-*` e `ec_progress`, expira o cache de comentários de cada sessão pública e redireciona para `/conta/excluida`.
- **`/conta`** (`requireUser`, `noindex`): e-mail (só para a própria pessoa), nome (`saveAccountName`: mesmas regras do `/boas-vindas`, identidade por `requireUserId`, nunca lê o perfil antes de gravar), "Baixar meus dados" e exclusão. **`/conta/dados`** (route handler): identidade pelo Auth (`getUser`), 401 para visitante e anônimo, **toda consulta filtrada pelo id da pessoa** (a equipe lê os comentários de todos pelo RLS), cópia campo a campo em `src/lib/account/export.ts`, `Content-Disposition: attachment` e `Cache-Control: no-store`; nunca inclui terceiros nem `comment_flags`. Item "Minha conta" no `AccountMenu`.
- **RLS de `comments` (mudou na migration `privacy_abuse_controls`):** o autor lê os próprios comentários em **qualquer** estado (antes só os pendentes), para a exportação ser completa. A interface continua filtrando `status` explicitamente em toda leitura.
- **`profiles.avatar_url`** deixou de ser gravável pelo cliente (só `display_name` e `display_name_confirmed_at`).
- **Contrato de segurança** (`supabase/tests/database/12_security_contract.test.sql`): falha se uma tabela de `public` ficar sem RLS; se uma função de `public` ganhar `execute` para `anon`/`PUBLIC` fora de `is_admin`/`is_staff` ou para `authenticated` fora da lista; se uma função `security definer` não tiver `search_path=""` ou aparecer sem estar na lista explícita; ou se os grants de escrita (INSERT/UPDATE por coluna, DELETE, TRUNCATE) fugirem da matriz esperada. Ampliar qualquer um desses exige editar o teste de propósito.
- **Auditoria de logs** (`tests/privacy-static.test.ts`): `console.*` só existe em `src/lib/auth/log.ts`; toda chamada de `logFailure`/`logAuthFailure` passa só uma variável de erro (nunca `.message`, texto de comentário, e-mail ou dados); nenhum `catch` usa `error.message` além de classificar. `error.tsx` (público e painel) e `global-error.tsx` ficam em pt-BR, sem detalhe técnico.
- **Textos legais** (`src/content/legal-config.ts`): controlador, e-mail de contato, idade mínima, data, região de cada provedor e os campos **A DEFINIR** (bases legais, transferência internacional, retenção, região do Google e do Turnstile). `legalReviewed` (padrão `false`) e qualquer campo A DEFINIR mantêm as páginas legais (7b) como "Rascunho em revisão" e `noindex`. Nunca escrever que os dados "não saem do Brasil" nem que "não há transferência internacional".
- **Tags/caches:** excluir a conta expira `comments:<id>` de cada sessão pública e `comment-counts`; o nome novo pode levar até 5 minutos para aparecer nos comentários em cache.

## Modelo de dados (Supabase)

O que já está migrado (Fase 1, etapa 1) fica em `supabase/migrations/`. As tabelas marcadas como Fase 2 ainda não existem.

- `profiles`: id (= auth.users), display_name, avatar_url (só `https`; o cliente não grava mais), role (`admin` | `moderator` | `member`), approved_comment_count, display_name_confirmed_at (nulo até a pessoa escolher o nome público em `/boas-vindas`; a pessoa grava a própria coluna), created_at, updated_at. Sem e-mail. Um trigger em `auth.users` cria o perfil (o nome vem do metadata — `display_name`, `full_name` ou `name` — e, sem ele, é `Leitor`: nenhum trecho do e-mail vai para o perfil; o papel nunca vem do metadata). **Leitura pública**: nomes e avatares de todos os membros são legíveis por qualquer visitante (entra na política de privacidade, etapa 7); o usuário só atualiza `display_name` e `display_name_confirmed_at` (grant por coluna).
- `books`: id, slug (único, usado na URL `/livros/[slug]`), title, author, synopsis, genres (`text[]`), total_chapters (estimativa, sem trava contra as sessões), current_chapter (entre 0 e total_chapters), status (`reading` | `finished` | `queued`; no máximo um `reading`), rating (0 a 5 em passos de 0,5), cover_path, palette jsonb, theme_tokens jsonb, theme_auto bool, started_at, finished_at.
- `books` também tem as funções `start_book(p_book_id)` e `finish_book(p_book_id, p_rating)` (SECURITY INVOKER, `is_admin()` dentro, `search_path` vazio, só `authenticated` executa). `start_book` só aceita livro `queued` e recusa se já há um `reading` (`book_already_reading:`); define `started_at` (data do Brasil, `America/Sao_Paulo`) e `current_chapter` 0. `finish_book` exige nota (0 a 5, meio em meio), define `finished_at` e `current_chapter = total_chapters`. Os erros têm prefixo `codigo:` na mensagem, mapeado para pt-BR em `src/lib/books/errors.ts`. Em `books`, `palette` é `{ colors: [{ hex, share }], accent }` e `theme_tokens` é o mapa das 17 variáveis do tema.
- `reading_sessions`: id, book_id, number (único por livro), chapter_from, chapter_to (sem sobreposição entre sessões do mesmo livro, rascunhos incluídos), title, body (JSON do Tiptap; o nó de divisória se chama `chapterDivider`, com `attrs.chapter`), excerpt, rating, visibility (`public` | `members`), status (`draft` | `published`; `scheduled` chega na Fase 2 com `publish_at`), published_at (preenchido ao publicar), read_minutes, comments_open.
- `session_notes`: id, session_id, kind (`quote` | `note`), text, reference (ex.: "Capítulo 10, página 162"), position.
- `session_questions`: id, session_id, text, position.
- `comments`: id, session_id, author_id, parent_id (uma resposta por nível, só a um comentário aprovado de nível superior da mesma sessão), body (1 a 2000 caracteres), read_up_to (capítulo que a pessoa leu, 0 a 1000), spoiler_up_to (nulo ou capítulo, 1 a 1000), status (`pending` | `approved` | `removed`), created_at, updated_at. O `select` da tabela é liberado por inteiro (um `select *` de visitante funciona).
- `comment_flags`: comment_id (PK, FK para `comments`, cascata), reason (1 a 200 caracteres), created_at. Motivo de sinalização de um comentário (spam, possível spoiler e o automático "Contém link", gravado pelo trigger `comments_flag_links`). Só `admin` e `moderator` leem e escrevem; visitantes e membros não veem nem a existência.
- `reading_progress`: user_id, book_id, chapter (o "li até o capítulo X" de cada leitor, salvo quando logado). Cada pessoa lê e escreve só as próprias linhas.
- Fase 2: `comment_likes`, `reactions`, `reports`, `polls`, `poll_options` (book_id opcional), `poll_votes` (um voto por usuário por votação) e `subscribers`.
- Storage: bucket público `covers` (5 MB, `image/png`, `image/jpeg`, `image/webp`), escrita só de `admin`. O limite e os MIME são aplicados pela API de Storage e valem pelo `Content-Type` declarado.

**RLS** (o banco é a fonte de verdade das permissões; a interface só esconde):

- Sessões: `published` + `public` para todos; `published` + `members` para quem está logado; rascunhos só para `admin`. Notas e perguntas seguem a visibilidade da sessão-pai. Escrita de livros, sessões, notas e perguntas só para `admin`.
- Comentários: um trigger `BEFORE INSERT` ignora o status enviado. o trigger também recusa (`profile_incomplete:`, errcode 23514) o comentário de quem ainda não confirmou o nome, quando há usuário logado (seed e SQL Editor seguem livres); `admin` e `moderator` entram `approved`; membro com 3 ou mais comentários aprovados entra `approved`, **exceto se o texto tiver link (`http://`, `https://`, `www.`), caso em que fica `pending`**; os demais entram `pending`. Só aceita comentário em sessão `published` com `comments_open`. Anônimos (login anônimo do Supabase, que também tem o papel `authenticated`) não comentam nem leem sessões `members`: o RLS confere a claim `is_anonymous`. Leitura: `approved` para quem pode ler a sessão, o autor vê os PRÓPRIOS comentários em qualquer estado (desde a migration `privacy_abuse_controls`), a moderação vê tudo. A moderação só altera `status` e `spoiler_up_to`; ninguém apaga linhas (`removed` é exclusão lógica); o autor remove o próprio texto por `retract_comment`. `approved_comment_count` é mantido por trigger e sempre igual ao número de comentários `approved` da pessoa (sobe e desce).
- Exclusões: `books → reading_sessions` e `reading_sessions → comments` são `RESTRICT`. Excluir uma conta apaga em cascata os comentários da pessoa e, por consequência, as respostas de outras pessoas a eles (decisão conhecida).
- Nenhum fluxo de cadastro concede admin. O papel só muda pelo SQL Editor do Supabase (ver README).
- Login anônimo: o banco não depende dele estar desligado. Na nuvem, ligar ou desligar é uma opção do painel do Supabase (o `config.toml` só vale para o banco local); o RLS trata o usuário anônimo como não-membro de qualquer forma.

**Segurança no app:**

- Toda Server Action e route handler revalida no servidor quem é a pessoa e qual o papel dela. Nunca use `getSession()` para autorizar: use `getClaims()` (ou `getUser()`). O papel vem do banco (`is_admin()`/`is_staff()` no RLS), nunca do JWT.
- A chave `service_role`/secret nunca entra no app (há uma regra de lint, com exceção só em `src/lib/supabase/env.ts` e no teste dele, que precisam nomeá-la para recusá-la). Só existem `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, lidas só por `getSupabaseEnv()` (`src/lib/supabase/env.ts`). Ela lança `SupabaseEnvError` dizendo QUAL variável falhou (ausente, URL que não é `https://`, chave que parece secret/service_role), nunca o valor. `http://` só vale para `localhost`/`127.0.0.1`/`[::1]` fora de produção (Supabase local). Segredos nunca entram no git; o `.env.example` só tem os nomes.
- `NEXT_PUBLIC_GOOGLE_LOGIN_ENABLED` (`"true"` liga) controla o botão "Continuar com Google" (`src/lib/auth/features.ts`); o padrão é desligado, e a action `signInWithGoogle` também recusa quando está desligado. Toda `NEXT_PUBLIC_*` é lida **no build**: mudar o valor na Vercel exige novo deploy.
- **Log de falhas de autenticação:** use sempre `logAuthFailure(operação, erro)` (`src/lib/auth/log.ts`). Só sai `error.name`, o nome do construtor, `status`, `code` e, em erro de rede, `cause.code`. Nunca `message`, e-mail, código, token nem cabeçalhos. Não use `console.error` direto com um erro do Auth.

**Autenticação e painel (Fase 1, etapa 2):**

- `src/proxy.ts` renova a sessão (`@supabase/ssr`) e redireciona `/painel/*` sem sessão para `/entrar?next=…`. É só conveniência.
- `src/lib/auth/`: `session.ts` (`getCurrentUser`, `requireUser`, `requireRole('admin' | 'staff')`), `roles.ts`, `safe-next.ts` (o `next` só aceita caminho interno), `messages.ts` (erros em pt-BR; `?erro=` só aceita códigos de uma lista fixa). A identidade vem de `getClaims()` e o papel de `profiles.role`, nunca do JWT.
- **Todo layout, página e Server Action do painel chama `requireRole`.** O teste `tests/painel-guards.test.ts` falha se um arquivo novo esquecer. Sem permissão, `forbidden()` responde 403 (`experimental.authInterrupts`, `src/app/forbidden.tsx`). A moderadora só acessa Comentários.
- **O proxy nunca derruba o site público e falha fechado no painel:** qualquer exceção (variável ausente, Auth fora do ar, inclusive o erro de rede que o `getClaims()` devolve em vez de lançar) deixa as rotas públicas passarem e faz `/painel/*` responder 503 com uma página simples em pt-BR (`src/lib/auth/panel-unavailable.ts`). O log leva só o nome do erro (e, no `SupabaseEnvError`, as variáveis e o motivo).
- Páginas públicas que também servem visitantes (o cabeçalho, `/entrar`) usam `getCurrentUserOrNull(onde)` (`src/lib/auth/current-user.ts`): erro de configuração ou do Auth vira "visitante"; os erros internos do Next passam por `unstable_rethrow` antes e qualquer outro erro continua subindo. `requireUser`/`requireRole` continuam falhando fechado.
- Login: código de 6 dígitos por e-mail (Server Actions `sendCode`/`verifyCode` em `/entrar`) e Google (`/auth/callback`). As actions capturam exceções (rede, variável errada) e mostram "Não conseguimos enviar/confirmar o código agora. Tente de novo em instantes." em erro sem `status` nem `code`. O destino do login pelo Google vai num cookie httpOnly de 10 min, não na URL. Nunca logar e-mail, código ou token; em erro, só `error.code`.
- Primeiro acesso: `/boas-vindas` grava `display_name` e `display_name_confirmed_at`. A action usa `requireUserId()` (identidade pelo `getClaims()`, sem ler o perfil) e chama `revalidatePath('/', 'layout')` ANTES do `redirect`: o cabeçalho vive no layout público, que o Next guarda e não renderiza de novo ao navegar, então sem isso ele mostra "Leitor" até a pessoa sair e entrar. Regra geral: Server Action que grava o perfil não chama `getCurrentUser`/`requireUser` antes de gravar (o perfil antigo ficaria memoizado) e invalida o layout. Não há reserva para a coluna ausente (42703): a coluna já existe na nuvem e um erro de leitura falha de forma visível.
- A configuração do painel do Supabase (URLs, SMTP, modelos, Google) é manual e está no README; os modelos de e-mail ficam em `supabase/templates/` como referência.

## Regras de spoiler

- Cada sessão cobre `chapter_from..chapter_to`. O relato é dividido por capítulo pela divisória do editor.
- O leitor informa até onde leu (salvo em `reading_progress`; para visitantes, em cookie).
- Trechos do relato de capítulos maiores que o progresso aparecem borrados, com botão para revelar.
- Comentários com `spoiler_up_to` maior que o progresso aparecem borrados.
- Moderação pode "aprovar como spoiler", marcando `spoiler_up_to`.

## Fases

- [x] **Fase 0, base:** projeto Next.js, lint, formatação, tokens, fontes, layout público e do painel (no celular, o painel usa barra inferior), itens 1 a 3 do bloco PWA (manifest, ícones, metadados Apple, viewport, safe areas, alvos de toque, `useIsStandalone`, botão "Voltar"), deploy de pré-visualização na Vercel com proteção de deploy.
  - [x] Código: projeto, lint, formatação, tokens, fontes, os dois layouts com páginas-esqueleto e os itens 1 a 3 do bloco PWA. Os ícones do app são provisórios.
  - [x] Deploy de pré-visualização na Vercel publicado e instalação no iPhone testada.
- [ ] **Fase 1, MVP** (uma etapa por sessão, cada uma numa branch e num PR pequeno em rascunho): Supabase ligado; auth (Google e código por e-mail); home; página do livro; página da sessão com relato; comentários com respostas; filtro de spoiler; painel com editor de sessão, livros (com upload de capa e tema automático) e moderação; itens 4 a 7 do bloco PWA (login por código no app instalado, service worker com `/offline`, cartão de instalação, editor no celular).
  - [x] Etapa 1, Supabase, modelo de dados e RLS (migration, testes pgTAP, clientes, tipos e CI). Falta aplicar a migration na nuvem (Actions → Database deploy).
  - [x] Etapa 2, autenticação e proteção do painel (proxy, `requireRole`, login por código e Google, 403, `/boas-vindas`, migration `profile_name_confirmation`). Falta aplicar a migration na nuvem e testar o Google e o app instalado no iPhone.
  - [x] Etapa 3, livros no painel, upload de capa e tema automático pela capa (motor de tema em `src/lib/theme/`, migration `book_lifecycle` com `start_book`/`finish_book`, `/painel/livros`). Falta aplicar a migration na nuvem (Actions → Database deploy).
  - [x] Etapa 4, editor de sessões (`/painel/sessoes`, Tiptap, autosave, migration `session_publishing` com `publish_session`/`unpublish_session`). Falta aplicar a migration na nuvem (Actions → Database deploy) e testar no iPhone com o app instalado.
  - [x] Etapa 5, páginas públicas (home, livro, sessões, sessão, estante, sobre), fita de capítulos e filtro de spoiler. Sem migration. O texto de `/sobre` (`src/content/sobre.ts`) é PROVISÓRIO e precisa da aprovação da Agatha.
  - [x] Etapa 6, comentários, respostas, spoiler nos comentários e moderação (`/painel/comentarios`, migration `comment_link_hold`). Falta aplicar a migration na nuvem (Actions → Database deploy, dry run primeiro); antes disso tudo funciona com as regras antigas (só o link não é segurado).

  - [x] Etapa 7a, segurança e LGPD, parte 1 (limite de frequência de comentários, excluir o próprio comentário, `/conta` com nome, download dos dados e exclusão da conta, `src/content/legal-config.ts`, contrato de segurança no pgTAP, auditoria de logs, páginas de erro; migration `privacy_abuse_controls`). Falta aplicar a migration na nuvem (Actions → Database deploy, dry run primeiro); antes disso `/conta` funciona e excluir comentário ou conta mostra "Este recurso ainda não está disponível".
  - [ ] Etapa 7b (sessão nova, depois do merge da 7a): `/privacidade` e `/termos` com links (rodapé, `/entrar`, `/boas-vindas`), cabeçalhos de segurança e CSP com nonce no proxy (`CSP_REPORT_ONLY`, liberações só em preview, sem `form-action 'self'`, HSTS de 2 anos sem `includeSubDomains` nem preload), Turnstile no `/entrar`, `robots.ts` e `noindex` (`/conta`, `/entrar`, `/boas-vindas`), badge do ícone (`navigator.setAppBadge`; só atualiza com o painel aberto).

- [ ] **Fase 2:** reações, curtidas, votação do próximo livro, estante, envio por e-mail, agendamento, membros e papéis; push (item 8 do bloco PWA) na Fase 2 ou 3.
- [ ] **Fase 3:** busca, estatísticas do painel, SEO e compartilhamento (imagem de prévia por sessão), leitura offline de sessões já abertas.

Os itens 9 e 10 do bloco PWA (desempenho e critérios de aceite) valem ao longo de todas as fases.

### Pendências depois da etapa 7a

- **Feitos na 7a:** limite de frequência de comentários e o autor excluir o próprio comentário.
- **Na 7b:** o badge do ícone com a contagem de pendentes (`navigator.setAppBadge`, item 7 do bloco PWA; a contagem real já existe no layout do painel) e o restante da lista da etapa 7.
- **Fora da etapa 7 (fases futuras):** edição do comentário pelo autor (o banco não deixa mudar `body`), service worker, cartão de instalação, push e e-mail.
- **Melhoria futura:** exigir login recente (um código novo por e-mail) antes de excluir a conta, para o caso de um aparelho desbloqueado e esquecido.

## Dados de exemplo

O livro atual é **O Livro de Azrael**, de Amber V. Nicole. O total de capítulos (52) é uma estimativa a confirmar. Os outros livros e membros do protótipo são fictícios e servem só como seed de desenvolvimento. **Nunca inventar citações do livro:** trechos reais são inseridos pela Agatha no editor.

## Comandos

- `npm run dev`: servidor de desenvolvimento em http://localhost:3000. O painel fica em `/painel`.
- `npm run build` e `npm run start`: build e servidor de produção.
- `npm test`: Vitest (lógica de auth, papéis e o teste-guarda do painel).
- `npm run lint`: ESLint (config do Next, com as regras de hooks e de acessibilidade).
- `npm run typecheck`: gera os tipos das rotas (`next typegen`) e roda o `tsc`.
- `npm run format` e `npm run format:check`: Prettier. Os `.md` ficam de fora, porque são escritos à mão.
- `npm run db:start`, `db:stop`, `db:reset`, `db:test` e `db:types`: banco Supabase local (Docker), testes pgTAP em `supabase/tests/database/` e geração de `src/lib/supabase/database.types.ts`. Servem às sessões de nuvem e ao CI; a dona do projeto não roda nada localmente.
- Antes de commitar, `lint`, `typecheck`, `format:check` e `build` precisam passar. Mudou migration? Rode também `db:test` e `db:types` e faça o commit dos tipos: o CI falha se `database.types.ts` divergir.

**Desenvolvimento 100% na nuvem.** A dona do projeto trabalha só pelo navegador (GitHub, Vercel, Supabase). Nunca peça que ela rode algo localmente e não escreva isso no README. Migrations são aplicadas por ela em Actions → Database deploy (`.github/workflows/db-deploy.yml`, só a partir da `main`, com `dry_run` ligado por padrão). O CI (`.github/workflows/ci.yml`) roda sem secrets.

**Ambiente de sessão de nuvem.** O daemon do Docker pode estar parado: suba com `dockerd &`. O ECR e o GHCR ficam bloqueados pelo proxy; o Docker Hub funciona. Então, antes de `supabase start`, `db reset`, `db:test` ou `db:types`, exporte `SUPABASE_INTERNAL_IMAGE_REGISTRY=docker.io`. `supabase.com` e `nextjs.org` também ficam bloqueados; a documentação do Next vem em `node_modules/next/dist/docs`. Os testes pgTAP são herméticos (limpam as tabelas dentro da transação), então passam com o seed carregado.

Se o Docker Hub devolver `429 Too Many Requests` (limite de pulls por IP), use o espelho: `SUPABASE_INTERNAL_IMAGE_REGISTRY=mirror.gcr.io`. O espelho não tem os nomes `supabase/kong`, `supabase/mailpit` e `supabase/postgrest`: baixe `mirror.gcr.io/library/kong:2.8.1`, `docker.io/axllent/mailpit` (ou `mirror.gcr.io/axllent/mailpit`) e `mirror.gcr.io/postgrest/postgrest` e dê `docker tag` para `mirror.gcr.io/supabase/kong`, `…/mailpit` e `…/postgrest` com as mesmas versões que o `supabase start` pedir no erro.

Versões fixadas por compatibilidade: TypeScript em 6.0 (o `typescript-eslint` não aceita 6.1 ou superior) e ESLint em 9 (os plugins do `eslint-config-next` ainda não suportam o 10). O `next.config.ts` tem `agentRules: false`: desde o Next 16.3 o `next dev` escreveria um bloco próprio neste arquivo.

## Estrutura do projeto

- `src/app/`: rotas. `layout.tsx` (fontes, metadados, viewport), `manifest.ts`, `icon.tsx`, `apple-icon.tsx` e `icons/[file]/route.tsx` (ícones do app, gerados com `ImageResponse`). `(public)/` é o site (inclui `livros/[slug]` e `livros/[slug]/sessoes/[numero]`) e `painel/` é o painel da Agatha.
- `src/components/`: `ui/` (Icon, Logo, Avatar, Button, IconButton, BackButton, SkipLink...), `site/` (cabeçalho, menu, rodapé) e `admin/` (barra lateral, barra inferior, topo).
- `src/lib/`: `navigation.ts` (menus e regra de item ativo), `routes.ts` (URLs dinâmicas), `brand.ts` (nome e cores que vivem fora do CSS).
- `src/lib/supabase/`: `server.ts` (Server Components, Actions e Route Handlers), `browser.ts` (Client Components), `env.ts` e `database.types.ts` (gerado por `npm run db:types`, não editar à mão). O refresh de sessão por proxy fica para a etapa 2.
- `supabase/`: `config.toml`, `migrations/`, `seed.sql` (só para o banco local; nunca para a nuvem e nunca com `--include-seed`) e `tests/database/` (pgTAP).
- `src/proxy.ts` e `src/lib/auth/`: ver "Autenticação e painel".
- `src/lib/theme/`: motor do tema automático (ver "Tema automático pela capa"). `src/lib/books/`: slug, validação (zod), mapeamento de erros do banco, caminhos de capa, processamento de imagem e consultas do painel. `src/components/livros/`: cartões, formulários e capa do painel de livros. `src/lib/session-body/` (esquema, renderizador, funções puras), `src/lib/session-editor/` (autosave, IndexedDB, viewport), `src/lib/sessions/` (serviço do servidor, erros, consultas) e `src/components/sessoes/` (editor, painéis e lista).
- `src/lib/comments/`: regras puras (`body`, `rules`, `threads`, `display`, `moderation`, `errors`, `action-state`), `queries.ts` (leituras públicas) e `admin-queries.ts` (moderação). `src/components/comments/`: discussão da sessão (compositor, lista, item, ordem). `src/components/moderacao/`: painel Comentários.
- `src/lib/account/`: exportação (`export.ts`) e mensagens da exclusão de conta (`messages.ts`). `src/components/conta/`: formulários de `/conta`. `src/content/legal-config.ts`: dados dos textos legais.
- `src/hooks/`: `useIsStandalone.ts`.
- `src/styles/`: `tokens.css` (variáveis de design) e `base.css`.

Regras que valem daqui em diante:

- Links para rotas dinâmicas usam `bookHref()` e `sessionHref()` de `lib/routes.ts`: os tipos das rotas do Next só conhecem as estáticas.
- Em CSS Modules, dois módulos não definem a mesma propriedade no mesmo elemento (a ordem do CSS no bundle não é garantida). Use um elemento interno, como fazem `SiteHeader` e `SiteFooter` com o `Container`.
- O botão "Voltar" (`BackButton`) é sempre um link para a página pai, nunca `history.back()`: o histórico pode ter páginas de fora (login com o Google) e âncoras `#capitulo`.
- Componentes só com ícone usam `IconButton`/`IconLink`, que exigem `label`.
- O React 19 **zera os campos** de um `<form action={…}>` quando a action termina, mesmo com erro de validação. Em formulário cujos valores precisam continuar na tela (progresso, cadastro de livro), use `onSubmit` + `startTransition(() => action(new FormData(form)))` em vez de `action={…}`. E não use `key` que mude com os dados salvos: o formulário remonta e perde o aviso e o redirecionamento.
- Nunca grave nem edite `database.types.ts` à mão e nunca edite uma migration já aplicada: só migrations novas.
- As páginas-esqueleto mostram um `StubNotice`. Ele sai quando a página ganha o conteúdo do protótipo.
