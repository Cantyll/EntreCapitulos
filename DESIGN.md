---
name: Entre Capítulos
description: Blog e clube de leitura da Agatha Montinelli, lido capítulo por capítulo, com o que vem depois coberto até você chegar lá.
colors:
  bg: "#FFF8F9"
  surface: "#FFFFFF"
  soft: "#FDEFF2"
  soft-2: "#F7DDE4"
  line: "#F1DDE3"
  line-2: "#E7C8D1"
  rose: "#CF6C88"
  rose-2: "#B04C69"
  rose-deep: "#7E3350"
  rose-tint: "#FBE6EC"
  ink: "#2A1E24"
  ink-2: "#6C5961"
  ink-3: "#7B6671"
  av1: "#F8DCE3"
  av2: "#F3E3D6"
  av3: "#E4E9F0"
  av4: "#EFE0EA"
  ok: "#2F7355"
  ok-bg: "#E4F2EA"
  warn: "#8A5E1F"
  warn-bg: "#FAEEDB"
  danger: "#A93A47"
  danger-bg: "#FBE3E5"
typography:
  display:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(36px, 5.2vw, 60px)"
    fontWeight: 500
    lineHeight: 1
    letterSpacing: "-0.025em"
  headline:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "clamp(34px, 4.6vw, 52px)"
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "28px"
    fontWeight: 500
    lineHeight: 1.15
    letterSpacing: "-0.01em"
  title-card:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1.2
  chapter:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "25px"
    fontWeight: 500
    lineHeight: 1.25
  prose:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "19.5px"
    fontWeight: 400
    lineHeight: 1.72
  body:
    fontFamily: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "'Instrument Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.4
  logo:
    fontFamily: "Newsreader, Georgia, 'Times New Roman', serif"
    fontSize: "23px"
    fontWeight: 500
    letterSpacing: "-0.01em"
rounded:
  segment: "2px"
  field: "10px"
  card: "16px"
  pill: "999px"
spacing:
  gutter-mobile: "18px"
  gutter: "28px"
  card: "22px"
  section: "44px"
  container: "1160px"
  prose: "700px"
  tap: "44px"
components:
  button-primary:
    backgroundColor: "{colors.rose-2}"
    textColor: "#FFFFFF"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-primary-hover:
    backgroundColor: "{colors.rose-deep}"
    textColor: "#FFFFFF"
  button-soft:
    backgroundColor: "{colors.rose-tint}"
    textColor: "{colors.rose-deep}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  button-soft-hover:
    backgroundColor: "{colors.soft-2}"
    textColor: "{colors.rose-deep}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    padding: "10px 18px"
  icon-button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "38px"
  chip:
    backgroundColor: "{colors.rose-tint}"
    textColor: "{colors.rose-deep}"
    rounded: "{rounded.pill}"
    padding: "4px 11px"
  nav-link-active:
    backgroundColor: "{colors.rose-tint}"
    textColor: "{colors.rose-deep}"
    rounded: "{rounded.pill}"
    padding: "8px 13px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "{spacing.card}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    padding: "10px 14px"
    height: "44px"
  theory-box:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "18px 22px"
  strip-segment-session:
    backgroundColor: "{colors.rose}"
    rounded: "{rounded.segment}"
    height: "16px"
  strip-segment-last:
    backgroundColor: "{colors.rose-deep}"
    rounded: "{rounded.segment}"
    height: "16px"
  strip-segment-unread:
    backgroundColor: "{colors.line-2}"
    rounded: "{rounded.segment}"
    height: "16px"
---

# Design System: Entre Capítulos

Este arquivo descreve o visual que já existe no código, para que telas novas continuem no mesmo mundo. A fonte dos valores é `src/styles/tokens.css` (o YAML acima espelha esse arquivo); o protótipo aprovado (`docs/prototype/entre-capitulos.html`) continua sendo a referência de layout e de comportamento, e o `CLAUDE.md` tem as regras técnicas. O contexto de produto (público, propósito e princípios) está no `PRODUCT.md`.

## Overview

**Creative North Star: "A margem do livro"**

O Entre Capítulos é a margem de um livro aberto: as anotações a lápis que uma leitora faz enquanto lê, e o espaço para quem lê junto responder. A página pertence ao texto da Agatha (serifado, grande, com ar entre as linhas), e a interface é o lápis: fina, discreta, em sans-serif pequena, presente só onde ajuda a ler, a encontrar o capítulo certo ou a conversar.

O tom é íntimo, editorial e calmo. Fundo de papel levemente tingido, cartões brancos com borda fina e uma única sombra de cartão, difusa, títulos em Newsreader de peso médio com o espaçamento apertado de uma página impressa. A cor vem emprestada da capa do livro que está sendo lido: o rosa padrão é só o tom de quando não há capa, e cada livro novo pinta o site com a própria paleta, dentro de contrastes garantidos. Por isso as cores são nomeadas pelo papel que cumprem, nunca pelo tom.

O sistema serve a duas superfícies. O site público é de leitura (relatos longos, fita de capítulos, discussão), e o painel é de operação (a Agatha publicando pelo celular, a moderação aprovando comentários). As duas usam os mesmos tokens e componentes; o painel só troca a navegação (barra lateral no computador, barra inferior no celular). O tema é só claro.

**Key Characteristics:**

- Serifa para ler, sans-serif para operar.
- Cor emprestada da capa do livro atual, aplicada por papéis, sempre com contraste AA.
- Superfícies planas em papel, separadas por borda fina e uma única sombra suave.
- Pílulas para tudo que se toca (botões, chips, navegação); cantos de 16px para o que se lê.
- A fita de capítulos como assinatura: o livro inteiro numa linha, sessão por sessão.
- Feito para o polegar: alvos de 44px, campos de 16px e áreas seguras do iPhone em toda tela.

## Colors

Uma paleta de papel e tinta, com um único tom de destaque que muda com a capa do livro.

### Primary

- **Marca-texto** (`rose`): destaque gráfico, nunca texto corrido. Segmentos das sessões na fita de capítulos, o número grande do cartão de sessão, o filete das citações, bordas em hover. Contraste mínimo de 3:1 contra o papel.
- **Tinta de destaque** (`rose-2`): o tom que se aperta e que se segue. Fundo do botão principal (com texto branco, contraste de 4,5:1 garantido), links, anel de foco, selo de contagem, a capitular da abertura do relato.
- **Tinta profunda** (`rose-deep`): ênfase em texto. Títulos de capítulo e intertítulos do relato, texto de chips e de itens ativos, a última sessão na fita, o hover do botão principal. Contraste de 7:1 sobre o Realce.
- **Realce** (`rose-tint`): o fundo do que está escolhido ou marcado. Chips, item ativo da navegação, botão suave, o halo do indicador "ao vivo".

### Neutral

- **Papel** (`bg`): o fundo de todas as páginas.
- **Folha** (`surface`): cartões, campos, diálogos e a barra inferior do painel.
- **Papel tingido** (`soft`) e **Papel tingido forte** (`soft-2`): fundos suaves (a caixa "Minha teoria", hover da navegação do painel, o degradê do topo da home), trilhas e o hover do botão suave.
- **Pauta** (`line`) e **Pauta marcada** (`line-2`): bordas. A Pauta separa cartões e seções; a Pauta marcada contorna campos e botões fantasma e pinta os capítulos ainda não lidos na fita.
- **Tinta** (`ink`): texto principal, com contraste de 7:1 sobre o Papel.
- **Tinta secundária** (`ink-2`) e **Tinta de nota** (`ink-3`): subtítulos, resumos e metadados (datas, contagens, legendas). As duas passam AA sobre o Papel tingido.
- **Pastéis de avatar** (`av1` a `av4`): fundo das iniciais dos avatares. Também seguem o tema da capa.

### Estados (fixos, fora do tema)

- **Certo** (`ok` sobre `ok-bg`), **Atenção** (`warn` sobre `warn-bg`) e **Perigo** (`danger` sobre `danger-bg`): mensagens de sucesso, avisos e erros, e o texto do botão fantasma de perigo. Sempre o par texto e fundo juntos.

### Named Rules

**A regra da cor emprestada.** As 17 cores do primeiro grupo (do Papel aos Pastéis) são sobrescritas pelo tema da capa, então nenhuma tela usa hexadecimal solto para esses papéis: só `var(--…)`. O único literal permitido é o branco do texto sobre Tinta de destaque (botão principal e selos de contagem). Um par de texto e fundo que não está entre os seis garantidos pelo motor de tema (branco sobre Tinta de destaque, Tinta de nota e Tinta secundária sobre Papel tingido, Tinta profunda sobre Realce, Tinta sobre Papel, Marca-texto contra Papel) precisa passar no teste de contraste com os temas derivados (`acessibilidade-temas.spec.ts`).

**A regra do marca-texto.** O Marca-texto (`rose`) só pinta forma: segmento, filete, número decorativo, borda. Texto que precisa ser lido usa Tinta de destaque ou Tinta profunda.

## Typography

**Display Font:** Newsreader (com Georgia), variável no peso, romana e itálica, sem o eixo de tamanho óptico (o protótipo o pede, mas ele dobra o peso dos arquivos; ver Desempenho no CLAUDE.md).
**Body Font:** Instrument Sans (com a fonte do sistema), pesos 400, 500 e 600.

**Character:** a Newsreader é a voz da página impressa, com títulos em peso médio e espaçamento negativo, e uma itálica que faz o papel da letra cursiva da margem. A Instrument Sans é o lápis da interface: pequena, neutra, legível em 13px.

### Hierarchy

- **Display** (Newsreader 500, de 36 a 60px, entrelinha 1, espaçamento -0,025em): o título do livro atual no topo da home.
- **Headline** (Newsreader 500, de 34 a 52px, entrelinha 1,05, espaçamento -0,025em): o título de cada página (`PageHeader`).
- **Title** (Newsreader 500, 28px, entrelinha 1,15): títulos de seção. Títulos de cartão de sessão usam 25 a 26px (21px no celular); títulos de cartões laterais e de diálogos, 20 a 22px.
- **Capítulo** (Newsreader itálica 500, 25px, Tinta profunda): a divisória de capítulo dentro do relato, com o rótulo "Capítulo N" em sans 13px acima. Intertítulos do relato usam a mesma itálica em 22px.
- **Prosa** (Newsreader 400, 19,5px, entrelinha 1,72; 18px abaixo de 640px): o texto dos relatos, em coluna de até 700px. Citações em itálica de 23px (20px no celular) com filete de 2px em Marca-texto à esquerda. A abertura do relato tem capitular de 3,4em em Tinta de destaque.
- **Body** (Instrument Sans 400, 15px, entrelinha 1,55): o texto da interface. Resumos e excertos ficam em Tinta secundária, com no máximo 62 caracteres por linha nos cartões.
- **Label** (Instrument Sans 500 ou 600, de 12,5 a 14px): botões (14px; 13px no pequeno; 16px no grande), chips (12,5px), rótulos de campo (13px, 600), metadados (13px, Tinta de nota).
- **Logo** (Newsreader itálica 500, 23px; 19px na versão pequena): o nome "Entre Capítulos" no cabeçalho e no painel.

### Named Rules

**A regra da serifa para ler.** Newsreader só em títulos, no texto dos relatos, no logotipo e na capa gerada. Botões, chips, rótulos, campos e navegação são sempre Instrument Sans.

**A regra do texto mais alto.** A prosa da Agatha (19,5px) é o maior texto corrido do site. Nenhum texto de interface passa de 16px fora dos títulos.

## Layout

- **Contêiner:** largura máxima de 1160px, centralizado, com margem lateral de 28px (18px abaixo de 760px).
- **Grades de duas colunas:** a home usa conteúdo + coluna lateral de 320px (vão de 52px); a página da sessão usa o relato (coluna de até 700px) + lateral de 290px com a fita e o índice de capítulos. Abaixo de 1020px tudo vira uma coluna.
- **Pontos de quebra:** 1020px (duas colunas viram uma; o painel troca a barra lateral pela barra inferior), 760px (margens menores, navegação do site em faixa rolável abaixo do logotipo) e 640px (prosa menor). A fita de capítulos, a página Sobre, Membros e a lista de Sessões do painel usam consultas de contêiner (`@container`), não a largura da janela: em Membros, a tabela só aparece com 800px de lista (abaixo disso, cartões, dois por linha no tablet) e o cartão de cargos fica embaixo da lista, com os três cargos lado a lado; em Sessões, a tabela só aparece com 900px de lista, com as ações numa linha; em Livros, com 720px de lista (abaixo disso, cartões com capa, estado, progresso e o editar sempre à vista). O editor de sessão põe as opções ao lado do texto só quando o texto fica com 560px ou mais; no iPad deitado, com a barra lateral do painel, elas vão para baixo.
- **Tela larga:** o conteúdo do painel para em 1240px (`--panel-max`), e o "?" e o sino do topo param no mesmo ponto, em vez de irem para a borda da tela. Na página do livro, a capa acompanha a coluna (180px entre 761 e 1020px).
- **Tela baixa (até 500px de altura, o celular deitado):** o cabeçalho do site e o topo do painel deixam de ser fixos e rolam com a página; em pé, continuam fixos.
- **Medida do texto de ajuda:** parágrafos de ajuda e explicação param em uns 70 caracteres por linha, mesmo em coluna larga.
- **Ritmo:** cartões com 22px de respiro interno; seções separadas por 44px; o topo da home com 52px acima e 46px abaixo; títulos de página com 40px acima.
- **Toque (`pointer: coarse`):** todo alvo cresce para 44x44px, campos passam a 16px de fonte e o hover dá lugar ao estado pressionado (`:active`).
- **Impressão:** sai o texto da página. Cabeçalho, menu do rodapé, "Voltar", barras e lateral do painel, convites, controles de leitura e a discussão sem comentários levam `data-print="hide"` (ou uma regra `@media print` do próprio módulo); as grades de duas colunas viram uma. O trecho coberto pelo filtro de spoiler não sai borrado: no lugar dele vai um aviso tracejado ("Trecho coberto pelo filtro de spoiler. Para imprimi-lo, mostre-o na tela antes."). Título não fica sozinho no pé da página, e a fita, o mapa de capítulos e os botões imprimem com cor.
- **Alto contraste (cores forçadas do Windows):** o sistema apaga fundos e sombras, então o que só se distinguia pelo fundo ganha cores do sistema: item atual do menu, aba escolhida e botão ligado em `Highlight` com texto `HighlightText` (com `forced-color-adjust: none`, senão o navegador desenha uma placa atrás das letras); interruptor com contorno e bolinha em `ButtonText`, ligado em `Highlight`; na fita e no mapa, sessão em `CanvasText`, a última em `Highlight`, o lido sem sessão em `GrayText`, a próxima tracejada e o que falta ler só contornado. O foco do título do editor (uma sombra) vira contorno.
- **Telas do iPhone:** áreas seguras (`env(safe-area-inset-*)`) no documento, no cabeçalho fixo e nas barras inferiores; altura útil com `100dvh`, nunca `100vh`; a barra inferior do painel tem 64px mais a área segura.

## Elevation & Depth

O sistema é plano e em camadas de papel: a profundidade vem do contraste entre o Papel do fundo e a Folha branca dos cartões, de uma borda de 1px em Pauta e de uma única sombra difusa, tingida de Tinta profunda, que faz o cartão parecer apoiado na página. Barras fixas (o cabeçalho do site e a barra inferior do painel) usam vidro fosco: fundo translúcido com desfoque de 12 a 14px.

### Shadow Vocabulary

Toda sombra e todo véu são tokens de `tokens.css`, tingidos pelas cores do tema com `color-mix` sobre Tinta profunda (`--rose-deep`) ou Tinta (`--ink`): com a capa azul, a sombra é azulada. Nenhuma sombra leva cor escrita à mão.

- **Folha apoiada** (`--shadow`: Tinta profunda a 5% e a 28%, `0 1px 2px` e `0 14px 34px -18px`): cartões em destaque (última sessão, cartões laterais), diálogos e o botão de revelar spoiler.
- **Marcador** (`--shadow-sm`: Tinta profunda a 12%, `0 1px 3px`): a pílula escolhida de um seletor segmentado (abas de Comentários e Membros, filtros de Sessões, Escrever/Pré-visualizar).
- **Livro na estante** (`--shadow-book`): só a capa do livro, com a lombada desenhada por sombras internas pretas e a sombra de fora em Tinta profunda escurecida.
- **Folha inferior** (`--shadow-sheet`: Tinta a 40%, `0 -20px 50px -20px`): diálogos que viram folha inferior no celular e a folha "Mais" da barra inferior do painel, que sobe em 0,22s.
- **Barra presa** (`--shadow-bar`: Tinta a 35%, `0 -8px 20px -14px`): barras grudadas no fim da tela, a de formatação do editor no celular e a de ações da Página Sobre.
- **Bilhete solto** (`--shadow-float`: Tinta a 18%, `0 18px 50px`): o que flutua sobre a página sem ser diálogo (o cartão e o menu do tutorial, a dica do "?").
- **Véu** (`--scrim`: Tinta a 42%): o fundo escurecido atrás de diálogos e folhas.

### Named Rules

**A regra da sombra única.** Há uma sombra de cartão (`--shadow`), e ela não se empilha nem cresce no hover. Uma lista de itens (sessões, comentários) se separa por filetes de Pauta, sem sombra.

**A regra da caixa única.** Nada de cartão dentro de cartão. Um bloco que já tem caixa própria (a pergunta "Até que capítulo você leu?") perde a caixa quando entra num cartão ou numa faixa e fica separado por um filete de Pauta.

## Shapes

- **Cantos:** 16px para cartões, diálogos e caixas de leitura (`--r`); 10px para campos, mensagens de status e itens da barra lateral do painel (`--r-sm`); pílula (999px) para botões, chips, navegação do site e selos; círculo para avatares e botões de ícone; 2px para os segmentos da fita (1px na compacta).
- **A capa:** proporção 2:3, cantos de 3px na lombada e 9px na borda de fora, como um livro de verdade. Sem imagem, a capa é gerada por CSS: degradê de duas cores tiradas do título, moldura fina interna, título em Newsreader e autor em itálica.
- **Bordas:** sempre de 1px (Pauta ou Pauta marcada). Filetes de destaque têm 2px e só aparecem em citações.
- **Inclinação:** a capa do livro atual, no topo da home, gira -1,5°. É a única peça fora do prumo.

## Components

### Buttons

Pílulas leves, de peso 500, que se distinguem pela tinta, não pelo tamanho.

- **Shape:** pílula (999px), borda de 1px transparente, ícone opcional à esquerda com 8px de vão.
- **Principal:** fundo Tinta de destaque, texto branco, 10px por 18px. Hover e pressionado: Tinta profunda.
- **Suave:** fundo Realce, texto Tinta profunda. Hover: Papel tingido forte.
- **Fantasma:** fundo Folha, borda em Pauta marcada, texto Tinta. Hover: borda em Marca-texto. A variante de perigo só troca o texto para Perigo.
- **Tamanhos:** pequeno (6px por 13px, 13px), médio (padrão) e grande (11px por 20px, 16px de texto, para blocos cujo texto já tem 16px). No toque, altura mínima de 44px.
- **Foco:** contorno de 2px em Tinta de destaque, afastado 2px, em todo elemento interativo.
- **Navegar é link:** um botão que leva a outra página é um link com cara de botão (`ButtonLink`), nunca um `<button>`.

### Icon buttons

- Círculo de 38px (32px no pequeno; 44px no toque), fundo Folha, borda em Pauta; hover com borda em Marca-texto. Ponto de aviso de 8px em Tinta de destaque, com contorno da cor da Folha. Sempre com rótulo acessível.

### Chips

- **Estilo:** pílula com fundo Realce e texto Tinta profunda, 12,5px peso 500, 4px por 11px. A variante de contorno troca o fundo por uma borda em Pauta marcada e o texto por Tinta secundária.
- **Uso:** faixa de capítulos de uma sessão, visibilidade ("Só para membros"), estado do livro.

### Cards / Containers

- **Corner Style:** 16px.
- **Background:** Folha sobre o Papel; a caixa "Minha teoria" usa Papel tingido.
- **Shadow Strategy:** a Folha apoiada, só em cartões isolados (ver Elevation & Depth).
- **Border:** 1px em Pauta.
- **Internal Padding:** 22px (20px por 22px no cartão da última sessão).
- **Cartão de sessão:** não é caixa. É uma linha de lista separada por filete, com o número da sessão em Newsreader de 46px (30px no celular) em Marca-texto à esquerda, chips, título serifado, excerto e metadados. O link do título cobre a linha inteira; no hover o título passa a Tinta profunda.

### Inputs / Fields

- **Style:** fundo Folha, borda de 1px em Pauta marcada, cantos de 10px, 10px por 14px, altura mínima de 44px. Rótulo em 13px peso 600 acima; ajuda em 13px Tinta de nota abaixo.
- **Linha de pauta:** a borda de baixo do campo é Tinta de nota (`--field-rule`), como a linha de um caderno: é ela que passa os 3:1 de contorno de campo (WCAG 1.4.11); os outros lados ficam em Pauta marcada. Não vale para os campos sem moldura (o cartão do comentário, a resposta e o papel do relato).
- **Placeholder:** Tinta de nota, sem transparência (4,5:1).
- **Fonte:** 14,5px no computador e 16px no toque (abaixo disso o iOS dá zoom ao focar).
- **Focus:** o mesmo contorno de 2px em Tinta de destaque. Nos campos sem moldura, o contorno acende no cartão ou no papel em volta (`:has(:focus-visible)` ou `:focus-within`), e o cursor de texto é Tinta de destaque.
- **Error:** borda em Perigo e mensagem em 13px Perigo logo abaixo; mensagens de formulário em caixa de 10px com fundo de Perigo ou Certo.

### Navigation

- **Site:** cabeçalho fixo de 70px em vidro fosco (Papel a 90%, desfoque de 12px) com filete inferior; logotipo à esquerda, links em pílula de 14px em Tinta secundária, item ativo em pílula de Realce com texto Tinta profunda. Abaixo de 760px os links viram uma faixa rolável sob o logotipo, como uma frase que continua na outra página: o lado que ainda tem itens some num esfumado de 24px e o item atual aparece inteiro ao abrir a página (`ScrollStrip`). O mesmo vale para as abas de livros em Sessões e para a barra de formatação do editor no celular.
- **Painel no computador:** barra lateral branca, fixa, com filete à direita; itens de 14px com cantos de 10px, hover em Papel tingido, ativo em Realce, contagem de pendentes em pílula de Tinta de destaque com texto branco.
- **Painel no celular:** barra inferior em vidro fosco (Folha a 94%, desfoque de 14px), cinco células com ícone e rótulo de 11px, alinhadas pela base, acima da área segura.
- **Voltar:** toda página interna tem um link "Voltar" visível para a página pai (o app instalado não tem botão voltar).

### Diálogos

- Caixa de até 480px, Folha, borda em Pauta marcada, cantos de 16px, Folha apoiada, fundo da página escurecido pelo Véu (`--scrim`). No toque, vira folha inferior encostada embaixo (acima do teclado), com rolagem interna e botões empilhados de 44px.

### Fita de capítulos (componente-assinatura)

O livro inteiro numa linha: um segmento por capítulo, agrupado por sessão.

- **Segmentos:** todos da mesma altura (16px na fita grande, 8px na compacta), vão de 2px (1px na compacta), largura mínima de 3px. Cores por estado: sessão em Marca-texto, alternando com o Marca-texto misturado à Folha (62%) para separar sessões vizinhas; última sessão em Tinta profunda; capítulos lidos sem sessão visível em Marca-texto misturado à Folha (45%); por ler em Pauta marcada; próxima sessão contornada (tracejado de 1,5px na grande, contorno inteiro na compacta) sobre Folha.
- **Muitos capítulos:** quando os segmentos não cabem com 3px, a fita passa a desenhar um bloco por sessão, com largura proporcional, e uma trilha única para o que falta ler. A troca é feita pelo CSS, por consulta de contêiner.
- **Só desenho:** a fita não tem links (o segmento de um capítulo mede uns 10x16px). Logo abaixo dela, em qualquer aparelho, uma pílula por sessão ("Sessão N · cap. a–b") abre a sessão: a última em Realce com texto Tinta profunda, a próxima tracejada e sem link. A pílula tem 44px no toque e 34px com mouse, com a borda em Marca-texto no hover.
- **Variações:** a grade de blocos de 44px na página do livro (`ChapterMap`), a fita compacta nos cartões do painel.

### Cobertura de spoiler

- O trecho coberto fica desfocado (7px) e a 70% de opacidade, inerte, com altura mínima de 150px. No centro, um cartão-botão de Folha (cantos de 16px, Folha apoiada, ícone de olho fechado em Tinta de destaque) lembra até que capítulo a pessoa disse ter lido; a ação, embaixo, vem em 13px peso 600 Tinta profunda. Revelar remove o desfoque em 0,25s, sem animação quando a pessoa pede menos movimento. Na impressão, o trecho coberto sai como aviso tracejado, nunca borrado.

### Capa do livro

- Proporção 2:3, cantos de livro (3px e 9px) e a sombra "Livro na estante". Com imagem enviada, `object-fit: cover`; sem imagem, a capa gerada descrita em Shapes.
- **A capa gerada escala inteira:** título, autor, respiro e ornamento medem em `cqi` (a largura da própria capa). Quando a página encolhe a capa no celular, tudo encolhe junto, como uma foto do livro; o tamanho pedido em px vale para a largura pedida. Os acentos de maiúscula ("Última", "Âmbar") têm folga em cima do título.

## Do's and Don'ts

### Do:

- **Do** usar só as variáveis de `tokens.css` para cor, raio e sombra, para que o tema da capa alcance a tela nova.
- **Do** escrever títulos em Newsreader peso 500 com espaçamento negativo (-0,01em a -0,025em) e toda a interface em Instrument Sans.
- **Do** usar pílula (999px) para tudo que se toca e 16px para cartões e diálogos.
- **Do** separar itens de lista com filete de 1px em Pauta e reservar a Folha apoiada para cartões isolados.
- **Do** pôr o hover dentro de `@media (hover: hover)` e dar a todo alvo 44x44px e a todo campo 16px de fonte sob `@media (pointer: coarse)`.
- **Do** mostrar estado por forma e texto, além da cor: na fita, cheio, escuro, contornado e trilha têm forma própria e legenda.
- **Do** manter `-webkit-backdrop-filter` junto de `backdrop-filter` nas barras de vidro fosco e as áreas seguras do iPhone em barras fixas.
- **Do** rodar o teste de contraste com os temas derivados quando um texto novo cair sobre um fundo do tema.
- **Do** usar `ScrollStrip` em toda faixa que rola de lado (sem barra de rolagem à vista, nada diria que há mais itens).
- **Do** marcar com `data-print="hide"` o que não serve no papel e conferir em alto contraste todo estado que só muda o fundo.

### Don't:

- **Don't** escrever hexadecimal para os papéis do tema, nem montar CSS com valor vindo do banco por outro caminho que não a lista de tokens validada.
- **Don't** usar o Marca-texto (`rose`) como cor de texto.
- **Don't** desenhar um segmento da fita como traço fino: todos têm a mesma altura e no mínimo 3px de largura.
- **Don't** usar biblioteca de componentes pronta; os componentes seguem o protótipo.
- **Don't** usar `100vh`, nem bloquear o zoom por pinça.
- **Don't** usar Newsreader em botões, chips, rótulos ou campos.
- **Don't** empilhar ou aumentar sombras no hover.
- **Don't** usar `black-translucent` na barra de status do iOS: o tema é claro.
