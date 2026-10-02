import type { LegalData } from '../legal-config';
import type { LegalFeatures } from './types';

/*
 * Os serviços de terceiros que o código usa. É a ÚNICA lista: a política de privacidade (tabela "Serviços usados
 * pelo site") e o documento de revisão jurídica (`docs/revisao-juridica.md`) a leem daqui. Google e Turnstile só
 * contam quando estão ativos (variáveis `NEXT_PUBLIC_*`).
 */

/** De onde vem um fato: do código do site, informado pelo dono do site, ou ainda sem verificação. */
export type FactSource = 'codigo' | 'informado' | 'nao-verificado';

export const FACT_SOURCE_LABEL: Record<FactSource, string> = {
  codigo: 'do código',
  informado: 'informado pelo dono do site',
  'nao-verificado': 'não verificado',
};

export type ProviderId = 'supabase' | 'vercel' | 'resend' | 'google' | 'cloudflareTurnstile';

export type ProviderInfo = {
  id: ProviderId;
  name: string;
  /** Para quê o site usa o serviço (texto da tabela da política). */
  purpose: string;
  /** Papel na LGPD, para o advogado confirmar. */
  role: string;
  /** Só conta quando esta funcionalidade está ativa. */
  feature?: keyof LegalFeatures;
  /** De onde vem a afirmação de que o código usa o serviço. */
  usedBy: FactSource;
};

export const PROVIDERS: readonly ProviderInfo[] = [
  {
    id: 'supabase',
    name: 'Supabase',
    purpose: 'Banco de dados, autenticação (login) e armazenamento das capas dos livros.',
    role: 'Operador (trata os dados em nome dos controladores).',
    usedBy: 'codigo',
  },
  {
    id: 'vercel',
    name: 'Vercel',
    purpose: 'Hospedagem do site e das funções que o executam.',
    role: 'Operador (trata os dados em nome dos controladores).',
    usedBy: 'codigo',
  },
  {
    id: 'resend',
    name: 'Resend',
    purpose:
      'Envio do e-mail com o código de entrada, como operador contratado por nós e acionado pelo Supabase (o envio de e-mails do Supabase está configurado para usá-lo).',
    role: 'Operador contratado pelos controladores e acionado pelo Supabase (SMTP).',
    // O código não chama o Resend: a configuração está no painel do Supabase (README).
    usedBy: 'informado',
  },
  {
    id: 'google',
    name: 'Google',
    purpose: 'Login com a conta Google, quando você escolhe essa opção.',
    role: 'A confirmar pelo advogado (o Google trata os dados da conta Google por conta própria; o site só recebe o que ele informa).',
    feature: 'google',
    usedBy: 'codigo',
  },
  {
    id: 'cloudflareTurnstile',
    name: 'Cloudflare Turnstile',
    purpose: 'Verificação anti-robô ao pedir o código por e-mail.',
    role: 'A confirmar pelo advogado (operador, na verificação anti-robô).',
    feature: 'turnstile',
    usedBy: 'codigo',
  },
];

/** Os serviços que contam com as funcionalidades ligadas. */
export function activeProviders(features: LegalFeatures): ProviderInfo[] {
  return PROVIDERS.filter((provider) => !provider.feature || features[provider.feature]);
}

export const regionOf = (config: LegalData, id: ProviderId): string => config.regions[id];
