import { NEXT_COOKIE } from '@/lib/auth/constants';
import { PROGRESS_COOKIE } from '@/lib/spoiler/cookie';

/*
 * Os cookies do site. É a lista de "Cookies do site" do CLAUDE.md: precisa continuar igual. Todos são
 * essenciais para o que a pessoa pediu (entrar, lembrar até onde leu), por isso não há banner de
 * consentimento. Os nomes vêm das constantes do código (um teste confere).
 */

export type CookieInfo = {
  name: string;
  purpose: string;
  duration: string;
  /** Só existe quando a funcionalidade está ligada. */
  only?: 'google';
};

export const SITE_COOKIES: readonly CookieInfo[] = [
  {
    name: PROGRESS_COOKIE,
    purpose:
      'Guarda até que capítulo você leu (por livro), para esconder os trechos com spoiler. Só é usado por quem não entrou na conta.',
    duration: '1 ano',
  },
  {
    name: NEXT_COOKIE,
    purpose: 'Lembra para onde voltar depois de entrar com o Google.',
    duration: '10 minutos',
    only: 'google',
  },
  {
    name: 'sb-…-auth-token',
    purpose:
      'Sessão do Supabase Auth: mantém você conectado depois de entrar. Pode vir em mais de um pedaço (.0, .1…).',
    duration: 'a duração da sessão, definida pelo Supabase',
  },
];
