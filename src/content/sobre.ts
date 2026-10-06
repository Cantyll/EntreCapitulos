/*
 * Conteúdo PADRÃO (e PROVISÓRIO) da página "Sobre o clube". É o texto do protótipo, adaptado só para não prometer o
 * que o site ainda não faz (comentários, reações e votação chegam depois). Os textos em primeira pessoa são da
 * Agatha: ela precisa ler, ajustar e PUBLICAR o dela pelo painel (Painel > Página Sobre) antes de o site ir ao ar.
 *
 * Este arquivo é o que `/sobre` mostra enquanto NADA foi publicado pelo painel, e também se a leitura do conteúdo
 * publicado falhar ou o conteúdo vier inválido (o site nunca quebra por causa disso). É também o ponto de partida do
 * editor na primeira vez. Depois da primeira publicação, mudar o texto da página é no painel, não aqui. O título e o
 * botão da chamada final ficam aqui, no código (só o texto dela é editável). Os "Combinados da comunidade" NÃO estão
 * aqui: vivem em `src/content/legal/community-rules.ts`.
 */

export const SOBRE = {
  title: 'Oi, eu sou a Agatha.',
  lead: 'Eu sempre li com um lápis na mão. Um dia percebi que as anotações nas margens eram a melhor parte, e que eu queria conversar sobre elas com alguém.',
  paragraphs: [
    'O Entre Capítulos nasceu daí: eu leio um livro por vez, escrevo sobre cada trecho em sessões curtas e abro a conversa. Você acompanha no seu ritmo, sem medo de spoiler.',
  ],
  bio: 'Leitora, anotadora compulsiva, apaixonada por fantasia sombria',
  steps: [
    {
      title: 'A Agatha lê e escreve',
      text: 'A cada poucos capítulos sai uma sessão com impressões, trechos marcados e perguntas.',
    },
    {
      title: 'Você lê no seu ritmo',
      text: 'Diga até que capítulo chegou e o site esconde o que vem depois.',
    },
    {
      title: 'Sua leitura fica guardada',
      text: 'Entrando no clube, o capítulo em que você parou fica salvo para a próxima vez.',
    },
  ],
  cta: {
    title: 'Leia com a gente',
    text: 'Entre com seu e-mail ou conta Google. Leva menos de um minuto.',
    button: 'Entrar para o clube',
  },
} as const;
