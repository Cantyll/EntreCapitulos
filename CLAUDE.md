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

## Modelo de dados (Supabase)

O que já está migrado (Fase 1, etapa 1) fica em `supabase/migrations/`. As tabelas marcadas como Fase 2 ainda não existem.

- `profiles`: id (= auth.users), display_name, avatar_url (só `https`), role (`admin` | `moderator` | `member`), approved_comment_count, display_name_confirmed_at (nulo até a pessoa escolher o nome público em `/boas-vindas`; a pessoa grava a própria coluna), created_at, updated_at. Sem e-mail. Um trigger em `auth.users` cria o perfil (o nome vem do metadata — `display_name`, `full_name` ou `name` — e, sem ele, é `Leitor`: nenhum trecho do e-mail vai para o perfil; o papel nunca vem do metadata). **Leitura pública**: nomes e avatares de todos os membros são legíveis por qualquer visitante (entra na política de privacidade, etapa 7); o usuário só atualiza `display_name` e `avatar_url` (grant por coluna).
- `books`: id, slug (único, usado na URL `/livros/[slug]`), title, author, synopsis, genres (`text[]`), total_chapters (estimativa, sem trava contra as sessões), current_chapter (entre 0 e total_chapters), status (`reading` | `finished` | `queued`; no máximo um `reading`), rating (0 a 5 em passos de 0,5), cover_path, palette jsonb, theme_tokens jsonb, theme_auto bool, started_at, finished_at.
- `reading_sessions`: id, book_id, number (único por livro), chapter_from, chapter_to (sem sobreposição entre sessões do mesmo livro, rascunhos incluídos), title, body (JSON do Tiptap; o nó de divisória se chama `chapterDivider`, com `attrs.chapter`), excerpt, rating, visibility (`public` | `members`), status (`draft` | `published`; `scheduled` chega na Fase 2 com `publish_at`), published_at (preenchido ao publicar), read_minutes, comments_open.
- `session_notes`: id, session_id, kind (`quote` | `note`), text, reference (ex.: "Capítulo 10, página 162"), position.
- `session_questions`: id, session_id, text, position.
- `comments`: id, session_id, author_id, parent_id (uma resposta por nível, só a um comentário aprovado de nível superior da mesma sessão), body (1 a 2000 caracteres), read_up_to (capítulo que a pessoa leu, 0 a 1000), spoiler_up_to (nulo ou capítulo, 1 a 1000), status (`pending` | `approved` | `removed`), created_at, updated_at. O `select` da tabela é liberado por inteiro (um `select *` de visitante funciona).
- `comment_flags`: comment_id (PK, FK para `comments`, cascata), reason (1 a 200 caracteres), created_at. Motivo de sinalização de um comentário (spam, possível spoiler). Só `admin` e `moderator` leem e escrevem; visitantes e membros não veem nem a existência.
- `reading_progress`: user_id, book_id, chapter (o "li até o capítulo X" de cada leitor, salvo quando logado). Cada pessoa lê e escreve só as próprias linhas.
- Fase 2: `comment_likes`, `reactions`, `reports`, `polls`, `poll_options` (book_id opcional), `poll_votes` (um voto por usuário por votação) e `subscribers`.
- Storage: bucket público `covers` (5 MB, `image/png`, `image/jpeg`, `image/webp`), escrita só de `admin`. O limite e os MIME são aplicados pela API de Storage e valem pelo `Content-Type` declarado.

**RLS** (o banco é a fonte de verdade das permissões; a interface só esconde):

- Sessões: `published` + `public` para todos; `published` + `members` para quem está logado; rascunhos só para `admin`. Notas e perguntas seguem a visibilidade da sessão-pai. Escrita de livros, sessões, notas e perguntas só para `admin`.
- Comentários: um trigger `BEFORE INSERT` ignora o status enviado. o trigger também recusa (`profile_incomplete:`, errcode 23514) o comentário de quem ainda não confirmou o nome, quando há usuário logado (seed e SQL Editor seguem livres); `admin` e `moderator` entram `approved`; membro com 3 ou mais comentários aprovados entra `approved`; os demais entram `pending`. Só aceita comentário em sessão `published` com `comments_open`. Anônimos (login anônimo do Supabase, que também tem o papel `authenticated`) não comentam nem leem sessões `members`: o RLS confere a claim `is_anonymous`. Leitura: `approved` para quem pode ler a sessão, o autor vê os próprios `pending`, a moderação vê tudo. A moderação só altera `status` e `spoiler_up_to`; ninguém apaga (`removed` é exclusão lógica). `approved_comment_count` é mantido por trigger e sempre igual ao número de comentários `approved` da pessoa (sobe e desce).
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
- Primeiro acesso: `/boas-vindas` grava `display_name` e `display_name_confirmed_at`. A action usa `requireUserId()` (identidade pelo `getClaims()`, sem ler o perfil) e chama `revalidatePath('/', 'layout')` ANTES do `redirect`: o cabeçalho vive no layout público, que o Next guarda e não renderiza de novo ao navegar, então sem isso ele mostra "Leitor" até a pessoa sair e entrar. Regra geral: Server Action que grava o perfil não chama `getCurrentUser`/`requireUser` antes de gravar (o perfil antigo ficaria memoizado) e invalida o layout. Enquanto a coluna não existe na nuvem (42703), `isNameConfirmed` trata como confirmado.
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
- [ ] **Fase 2:** reações, curtidas, votação do próximo livro, estante, envio por e-mail, agendamento, membros e papéis; push (item 8 do bloco PWA) na Fase 2 ou 3.
- [ ] **Fase 3:** busca, estatísticas do painel, SEO e compartilhamento (imagem de prévia por sessão), leitura offline de sessões já abertas.

Os itens 9 e 10 do bloco PWA (desempenho e critérios de aceite) valem ao longo de todas as fases.

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

Versões fixadas por compatibilidade: TypeScript em 6.0 (o `typescript-eslint` não aceita 6.1 ou superior) e ESLint em 9 (os plugins do `eslint-config-next` ainda não suportam o 10). O `next.config.ts` tem `agentRules: false`: desde o Next 16.3 o `next dev` escreveria um bloco próprio neste arquivo.

## Estrutura do projeto

- `src/app/`: rotas. `layout.tsx` (fontes, metadados, viewport), `manifest.ts`, `icon.tsx`, `apple-icon.tsx` e `icons/[file]/route.tsx` (ícones do app, gerados com `ImageResponse`). `(public)/` é o site (inclui `livros/[slug]` e `livros/[slug]/sessoes/[numero]`) e `painel/` é o painel da Agatha.
- `src/components/`: `ui/` (Icon, Logo, Avatar, Button, IconButton, BackButton, SkipLink...), `site/` (cabeçalho, menu, rodapé) e `admin/` (barra lateral, barra inferior, topo).
- `src/lib/`: `navigation.ts` (menus e regra de item ativo), `routes.ts` (URLs dinâmicas), `sample-data.ts` (dados de exemplo, saem com o Supabase), `brand.ts` (nome e cores que vivem fora do CSS).
- `src/lib/supabase/`: `server.ts` (Server Components, Actions e Route Handlers), `browser.ts` (Client Components), `env.ts` e `database.types.ts` (gerado por `npm run db:types`, não editar à mão). O refresh de sessão por proxy fica para a etapa 2.
- `supabase/`: `config.toml`, `migrations/`, `seed.sql` (só para o banco local; nunca para a nuvem e nunca com `--include-seed`) e `tests/database/` (pgTAP).
- `src/proxy.ts` e `src/lib/auth/`: ver "Autenticação e painel".
- `src/hooks/`: `useIsStandalone.ts`.
- `src/styles/`: `tokens.css` (variáveis de design) e `base.css`.

Regras que valem daqui em diante:

- Links para rotas dinâmicas usam `bookHref()` e `sessionHref()` de `lib/routes.ts`: os tipos das rotas do Next só conhecem as estáticas.
- Em CSS Modules, dois módulos não definem a mesma propriedade no mesmo elemento (a ordem do CSS no bundle não é garantida). Use um elemento interno, como fazem `SiteHeader` e `SiteFooter` com o `Container`.
- O botão "Voltar" (`BackButton`) é sempre um link para a página pai, nunca `history.back()`: o histórico pode ter páginas de fora (login com o Google) e âncoras `#capitulo`.
- Componentes só com ícone usam `IconButton`/`IconLink`, que exigem `label`.
- As páginas-esqueleto mostram um `StubNotice`. Ele sai quando a página ganha o conteúdo do protótipo.
