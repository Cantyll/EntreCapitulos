# Product

<!-- impeccable:product-schema 1 -->

Contexto de produto do Entre Capítulos, para orientar decisões de design e de produto. As regras técnicas, o modelo de dados e o design system atual estão no `CLAUDE.md`; o protótipo aprovado (`docs/prototype/entre-capitulos.html`) continua sendo a fonte de verdade visual e de comportamento. Este arquivo é público, como o resto do repositório: nada de dado pessoal aqui.

## Platform

web

## Users

- **Leitoras e leitores (público principal).** Pessoas que acompanham a leitura da Agatha. O link do site chega pelo **WhatsApp**, então a primeira visita costuma ser no celular, aberta a partir de uma conversa; o site também é para ser usado no **computador**, com o mesmo cuidado. Cada pessoa lê o livro no próprio ritmo. O que ela quer fazer: saber em que ponto a Agatha está, ler a sessão até o capítulo em que parou sem tomar spoiler, e conversar sobre o trecho. Visitantes sem conta leem as sessões públicas; quem entra no clube (18 anos ou mais, por declaração) salva o progresso e comenta.
- **A Agatha (autora e administração).** Lê um livro por vez, escreve uma sessão a cada poucos capítulos e publica principalmente pelo celular, no site instalado na Tela de Início do iPhone. Também modera os comentários e cuida dos livros, da página Sobre e dos membros.
- **Moderação (opcional).** Pessoas de confiança que só aprovam, removem ou marcam como spoiler os comentários.

## Product Purpose

O Entre Capítulos é o blog e o clube de leitura da Agatha Montinelli: ela publica sessões de leitura (impressões, trechos marcados e perguntas sobre um grupo de capítulos) e abre a conversa sobre cada uma, com controle de spoiler por capítulo.

**Sucesso nos primeiros meses:** a Agatha publicar com regularidade e haver conversa nas sessões. Crescer em número de membros não é a meta.

**Sem fins comerciais:** sem anúncios, sem venda, sem assinatura paga e sem monetização. Nenhuma tela deve ser desenhada como funil de conversão ou para empurrar cadastro.

## Positioning

Ler junto com uma leitora específica, capítulo por capítulo, com o que vem depois escondido até você chegar lá. Cada sessão corresponde a uma faixa de capítulos do livro, a pessoa diz até onde leu e o site cobre o resto (relato, comentários, notas e perguntas). Não é um catálogo de resenhas, nem uma rede social de livros, nem um clube com várias vozes: é a leitura e a voz da Agatha, com espaço para conversar.

## Operating Context

- **Distribuição:** o link é compartilhado no WhatsApp. A prévia do link e a primeira tela no celular são, na prática, a porta de entrada. (A imagem de prévia por sessão está planejada para a Fase 3.)
- **Ritmo:** um livro "em leitura" por vez, uma fila de próximos e uma estante de livros terminados. As sessões saem a cada poucos capítulos, e a numeração reinicia a cada livro.
- **Publicação:** a Agatha escreve no editor do painel, quase sempre no celular, com divisórias de capítulo e salvamento automático do rascunho. Ela pode estar sem rede, ou o iPhone pode fechar o app em segundo plano.
- **Leitura:** "Li até o capítulo X" (guardado na conta, ou num cookie para visitantes), capítulos à frente cobertos com botão para revelar, discussão abaixo de cada sessão.
- **Entrada no clube:** código de 6 dígitos por e-mail digitado dentro do site (funciona no app instalado) e, opcionalmente, Google. No primeiro acesso a pessoa escolhe um nome público e aceita os Termos.
- **Comentários:** moderados. Os de quem tem 3 ou mais aprovados entram direto, exceto os que têm link.
- **Instalação:** o site pode ser instalado na Tela de Início do iPhone e do iPad (PWA, iOS 16.4 ou mais novo). Não há app nativo.

## Capabilities and Constraints

- **Qualquer gênero.** A Agatha escolhe os livros livremente (o atual é O Livro de Azrael, de Amber V. Nicole). Nada no produto deve presumir um gênero literário: um livro de fantasia sombria, um clássico ou um romance contemporâneo precisam caber igualmente.
- **As cores seguem a capa do livro atual.** O site troca o tema automaticamente a partir da paleta da capa, com contrastes mínimos garantidos (ver "Tema automático pela capa" no `CLAUDE.md`). Toda tela precisa funcionar com temas que não são o rosa padrão.
- **Interface em português do Brasil.**
- **Público adulto:** 18 anos ou mais, por declaração no aceite dos Termos. O site não verifica a idade, e nenhum texto pode dizer que verifica.
- **Infraestrutura gratuita** (Supabase e Vercel nos planos gratuitos), desenvolvimento 100% na nuvem, repositório público.
- **Planejado, ainda não feito:** reações, curtidas, votação do próximo livro, envio das sessões por e-mail, agendamento e push (Fase 2); busca, página offline, estatísticas e imagem de prévia por sessão (Fase 3). Depois do lançamento: ocultação de palavras inadequadas e verificação opcional de idade.
- **Em aberto:** os textos legais são rascunho até a revisão do advogado; o texto da página Sobre é provisório até a Agatha publicar o dela.

## Brand Commitments

- **Nome:** Entre Capítulos.
- **Voz:** a da Agatha, em primeira pessoa, próxima e calorosa ("Oi, eu sou a Agatha."). Os textos em primeira pessoa são dela: o código só traz o padrão provisório.
- **Visual:** o protótipo aprovado e o design system do `CLAUDE.md` (fontes, tokens, raios e a fita de capítulos como elemento-assinatura) são compromissos já firmados. Os ícones do app ainda são provisórios.
- **Cargos com nomes neutros:** Administração, Moderação e Membro.

## Evidence on Hand

- Livro atual real: O Livro de Azrael, de Amber V. Nicole (o total de 52 capítulos é uma estimativa).
- **Não existem, e não devem ser inventados:** citações do livro (os trechos reais são inseridos pela Agatha no editor), depoimentos, números de membros ou de comentários, nem resenhas. Os outros livros e membros do protótipo são fictícios e servem só como dados de desenvolvimento.

## Product Principles

1. **A leitura de cada pessoa manda.** Nada além do capítulo em que ela parou aparece sem um gesto dela.
2. **A voz é da Agatha.** O site é a moldura da leitura de uma pessoa, não uma rede nem um catálogo.
3. **Conversa antes de alcance.** Sem anúncios, sem métricas de vaidade e sem truques de crescimento. Bom é sessão publicada com regularidade e gente conversando nela.
4. **O link do WhatsApp é a porta da frente, e o computador também é de primeira classe.** A primeira visita no celular funciona sem conta e sem instalar nada.
5. **Publicar pelo celular nunca custa texto.** O rascunho sobrevive a rede ruim e ao app fechado.

## Accessibility & Inclusion

- Contraste WCAG AA em todo texto, inclusive sob os temas gerados pela capa; foco visível; navegação por teclado; `aria-label` em botões só com ícone.
- No toque: alvos de 44x44px e campos com fonte de pelo menos 16px. O zoom por pinça nunca é bloqueado.
- Respeitar a preferência por menos movimento.
