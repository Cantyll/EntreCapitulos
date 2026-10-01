/*
 * Conteúdo PROVISÓRIO da página "Sobre o clube". É o texto do protótipo, adaptado só para não prometer
 * o que o site ainda não faz (comentários, reações e votação chegam depois). A Agatha precisa ler,
 * aprovar e ajustar tudo isto antes de o site ir ao ar: os textos em primeira pessoa são dela.
 *
 * Para mudar o texto, edite só este arquivo.
 */

import type { IconName } from '@/components/ui/Icon';

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
  rules: [
    {
      icon: 'eyeOff',
      title: 'Marque os spoilers',
      text: 'Se o seu comentário fala de capítulos à frente, marque até qual.',
    },
    {
      icon: 'heart',
      title: 'Discordar é bem-vindo',
      text: 'Com carinho. Critique ideias, nunca pessoas.',
    },
    {
      icon: 'shield',
      title: 'Sem autopromoção',
      text: 'Links de venda e divulgação são removidos pela moderação.',
    },
    {
      icon: 'book',
      title: 'Todo ritmo vale',
      text: 'Quem está atrasado é tão parte do clube quanto quem adiantou.',
    },
  ] satisfies { icon: IconName; title: string; text: string }[],
  cta: {
    title: 'Leia com a gente',
    text: 'Entre com seu e-mail ou conta Google. Leva menos de um minuto.',
    button: 'Entrar para o clube',
  },
} as const;
