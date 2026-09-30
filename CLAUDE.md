# Entre Capítulos

Blog e clube de leitura da Agatha Montinelli. Ela publica **sessões de leitura** (relatos por grupo de capítulos) do livro atual, e os membros discutem cada sessão com **controle de spoiler por capítulo**. O site é 100% web e responsivo. Não há app nativo nesta fase.

O protótipo aprovado está em `docs/prototype/entre-capitulos.html`. Ele é a **fonte de verdade visual e de comportamento**: abra no navegador e use a pílula "Leitor / Administradora" no rodapé. Quando houver dúvida de layout, espaçamento, texto ou fluxo, siga o protótipo.

## Stack

- **Next.js** (App Router) com **TypeScript** estrito.
- **Supabase**: Postgres, Auth (Google e código de 6 dígitos por e-mail), Storage (capas) e Row Level Security.
- **Vercel** para hospedagem.
- **Estilo:** CSS com variáveis (tokens abaixo) e CSS Modules. Não usar bibliotecas de componentes prontas; os componentes seguem o protótipo.
- **Editor do relato:** Tiptap, com um nó próprio de "divisória de capítulo".
- **Imagens:** `sharp` no servidor, para processar a capa e extrair a paleta.
- **E-mail:** Resend, para enviar cada sessão aos inscritos (fase 2).
- **Testes:** Vitest para a lógica (spoiler, tema, contraste) e Playwright para os fluxos principais.

## Convenções

- Interface em **português do Brasil**. Código, nomes de tabelas e commits em inglês.
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

- `profiles`: id (= auth.users), display_name, avatar_url, role (`admin` | `moderator` | `member`), created_at, comment_count, is_trusted.
- `books`: id, title, author, synopsis, total_chapters, current_chapter, status (`reading` | `finished` | `queued`), rating, cover_path, palette jsonb, theme_tokens jsonb, theme_auto bool, started_at, finished_at.
- `reading_sessions`: id, book_id, number, chapter_from, chapter_to, title, body (JSON do Tiptap), excerpt, rating, visibility (`public` | `members`), status (`draft` | `scheduled` | `published`), publish_at, read_minutes, comments_open.
- `session_notes`: id, session_id, kind (`quote` | `note`), text, reference (ex.: "Capítulo 10, página 162"), position.
- `session_questions`: id, session_id, text, position.
- `comments`: id, session_id, author_id, parent_id (uma resposta por nível), body, read_up_to (capítulo que a pessoa leu), spoiler_up_to (nulo ou capítulo), status (`pending` | `approved` | `removed`), flag_reason, created_at.
- `comment_likes`: comment_id, user_id.
- `reactions`: session_id, user_id, kind (`love` | `cry` | `wow` | `think`).
- `reports`: comment_id, reporter_id, reason, resolved.
- `polls`, `poll_options` (book_id opcional) e `poll_votes` (um voto por usuário por votação).
- `subscribers`: email, user_id opcional, confirmed, unsubscribed_at.
- `reading_progress`: user_id, book_id, chapter (o "li até o capítulo X" de cada leitor, salvo quando logado).

**RLS:** leitura pública de sessões `published` e `public`; sessões `members` só para quem está logado; escrita de livros e sessões só para `admin`; comentários criados por membros entram como `pending` quando o autor tem menos de 3 comentários aprovados; `moderator` aprova e remove.

## Regras de spoiler

- Cada sessão cobre `chapter_from..chapter_to`. O relato é dividido por capítulo pela divisória do editor.
- O leitor informa até onde leu (salvo em `reading_progress`; para visitantes, em cookie).
- Trechos do relato de capítulos maiores que o progresso aparecem borrados, com botão para revelar.
- Comentários com `spoiler_up_to` maior que o progresso aparecem borrados.
- Moderação pode "aprovar como spoiler", marcando `spoiler_up_to`.

## Fases

- [ ] **Fase 0, base:** projeto Next.js, lint, formatação, tokens, fontes, layout público e do painel, Supabase ligado, deploy na Vercel.
- [ ] **Fase 1, MVP:** auth; home; página do livro; página da sessão com relato; comentários com respostas; filtro de spoiler; painel com editor de sessão, livros (com upload de capa e tema automático) e moderação.
- [ ] **Fase 2:** reações, curtidas, votação do próximo livro, estante, envio por e-mail, agendamento, membros e papéis.
- [ ] **Fase 3:** busca, estatísticas do painel, SEO e compartilhamento (imagem de prévia por sessão), PWA.

## Dados de exemplo

O livro atual é **O Livro de Azrael**, de Amber V. Nicole. O total de capítulos (52) é uma estimativa a confirmar. Os outros livros e membros do protótipo são fictícios e servem só como seed de desenvolvimento. **Nunca inventar citações do livro:** trechos reais são inseridos pela Agatha no editor.
