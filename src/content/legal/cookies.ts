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

/** Armazenamento local do navegador (fora os cookies). Para a política e para o documento de revisão. */
export type LocalStorageInfo = {
  name: string;
  purpose: string;
  duration: string;
  /** Quem é afetado. */
  who: string;
  only?: 'turnstile';
};

export const LOCAL_STORAGE_ITEMS: readonly LocalStorageInfo[] = [
  {
    name: 'IndexedDB do editor de sessões (`session:<id>` e `new:<bookId>`)',
    purpose: 'Cópia local do rascunho, para não perder o texto se o aplicativo for fechado.',
    duration: 'até o rascunho ser enviado ao servidor ou o navegador limpar os dados do site',
    who: 'só a equipe (quem usa o editor)',
  },
  {
    name: '`cf.turnstile.u` (armazenamento local do iframe da Cloudflare)',
    purpose: 'Item criado pelo widget de verificação anti-robô, no domínio da Cloudflare.',
    duration: 'definida pela Cloudflare',
    who: 'quem pede o código quando a verificação está ativa',
    only: 'turnstile',
  },
];
