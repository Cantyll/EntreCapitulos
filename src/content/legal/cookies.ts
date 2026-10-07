import { NEXT_COOKIE } from '@/lib/auth/constants';
import { PROGRESS_COOKIE } from '@/lib/spoiler/cookie';

import { INSTALL_RULES } from '../install';
import { TOUR_STORAGE_KEY } from '@/lib/tour/storage';

/*
 * Os cookies do site. É a lista de "Cookies do site e armazenamento local" do CLAUDE.md: precisa continuar igual
 * (um teste compara os nomes dos cookies e os do armazenamento local com as duas tabelas de lá). Todos os cookies
 * são essenciais para o que a pessoa pediu (entrar, lembrar até onde leu), por isso não há banner de
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
    // O nome e o número de dias vêm das regras do cartão (`src/content/install.ts`): mudou lá, muda aqui.
    name: `\`${INSTALL_RULES.storageKey}\` (armazenamento local do site)`,
    purpose: `Preferência do cartão "Instale o Entre Capítulos": guarda em quantos dias diferentes você abriu o site neste aparelho, o último desses dias, se você tocou em "Agora não" (e quando; o cartão pode voltar depois de ${INSTALL_RULES.dismissDays} dias) e se você tocou em "Já instalei". Não guarda nome, e-mail nem identificador de conta, e nunca é enviada ao servidor.`,
    duration: 'até o navegador limpar os dados do site ("Já instalei" vale por todo esse tempo)',
    who: 'só iPhone e iPad (Safari ou navegador embutido de outro aplicativo); nos demais aparelhos e no aplicativo instalado, nada é gravado',
  },
  {
    // Etapa 8k: o nome vem de `src/lib/tour/storage.ts`.
    name: `\`${TOUR_STORAGE_KEY}\` (armazenamento da aba do site)`,
    purpose:
      'Tutorial do painel: em que passo a pessoa está, para continuar depois de recarregar a página, e o clique em "Ver o tutorial desta parte" (Minha conta), de uso único. Não guarda nome, e-mail nem identificador de conta, e nunca é enviado ao servidor.',
    duration: 'até sair ou concluir o tutorial, ou fechar a aba',
    who: 'só a equipe (quem usa o painel)',
  },
  {
    name: '`cf.turnstile.u` (armazenamento local do iframe da Cloudflare)',
    purpose: 'Item criado pelo widget de verificação anti-robô, no domínio da Cloudflare.',
    duration: 'definida pela Cloudflare',
    who: 'quem pede o código quando a verificação está ativa',
    only: 'turnstile',
  },
];
