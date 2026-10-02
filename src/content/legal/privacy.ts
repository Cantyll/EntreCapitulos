import type { LegalData } from '../legal-config';
import { SITE_COOKIES } from './cookies';
import type { LegalDoc, LegalFeatures, LegalSection } from './types';

/*
 * Política de Privacidade (RASCUNHO para revisão de um profissional). Tudo o que depende de decisão ou de
 * análise jurídica vem de `legal-config.ts` como "A DEFINIR". Só se afirma aqui o que o código faz de verdade.
 * Nunca escrever que os dados "não saem do Brasil" nem que "não há transferência internacional".
 */

export function buildPrivacy(config: LegalData, features: LegalFeatures): LegalDoc {
  const { regions } = config;

  const dataItems = [
    'E-mail: usado só para você entrar (o código de 6 dígitos chega por ele) e para falarmos com você sobre a sua conta. Ele não aparece para outras pessoas.',
    'Nome de exibição: o nome que você escolhe no primeiro acesso e pode trocar em Minha conta. É público.',
    ...(features.google
      ? [
          'Se você entrar com o Google: o nome e o endereço da foto do seu perfil Google, que o Google informa no primeiro acesso. O nome inicial do perfil vem daí.',
        ]
      : []),
    'Comentários e respostas: o texto, a data, o estado de moderação (em análise, publicado ou removido), o aviso de spoiler, se houver, e até que capítulo você tinha lido quando comentou. Nome, texto e esse capítulo são públicos.',
    'Alertas de moderação: quando um comentário tem um link, a equipe vê um alerta interno ("Contém link"). Só a equipe vê.',
    'Progresso de leitura: até que capítulo você leu em cada livro. Com conta, fica guardado no banco de dados; sem conta, fica num cookie do seu navegador.',
    'Registros técnicos: os provedores de hospedagem e de banco de dados podem registrar dados técnicos de acesso, como endereço IP, data e hora, tipo de navegador e páginas acessadas, para operar e proteger o serviço. O site não usa ferramentas de análise de audiência nem de publicidade.',
    ...(features.turnstile
      ? [
          'Verificação de segurança: ao pedir o código por e-mail, o Cloudflare Turnstile recebe dados do seu navegador para distinguir pessoas de robôs. Os dados exatos são definidos pela Cloudflare.',
        ]
      : []),
  ];

  const purposes = [
    'Deixar você entrar na sua conta e manter a sessão.',
    'Mostrar as sessões de leitura e esconder o que fala de capítulos que você ainda não leu.',
    'Publicar, moderar e exibir comentários e respostas.',
    'Guardar até onde você leu, para a próxima visita.',
    'Proteger o site contra abuso e spam (limite de comentários por minuto e por hora, análise de comentários com link e, quando ativa, a verificação de segurança no envio do código).',
    'Atender os seus pedidos sobre os seus dados e cumprir obrigações legais.',
  ];

  const providers: string[][] = [
    [
      'Supabase',
      'Banco de dados, autenticação (login) e armazenamento das capas dos livros.',
      regions.supabase,
    ],
    ['Vercel', 'Hospedagem do site e das funções que o executam.', regions.vercel],
    [
      'Resend',
      'Envio do e-mail com o código de entrada, como operador contratado pelo Supabase (configurado no envio de e-mails do Supabase).',
      regions.resend,
    ],
    ...(features.google
      ? [['Google', 'Login com a conta Google, quando você escolhe essa opção.', regions.google]]
      : []),
    ...(features.turnstile
      ? [
          [
            'Cloudflare Turnstile',
            'Verificação de segurança ao pedir o código por e-mail.',
            regions.cloudflareTurnstile,
          ],
        ]
      : []),
  ];

  const cookies = SITE_COOKIES.filter((cookie) => cookie.only !== 'google' || features.google);

  const sections: LegalSection[] = [
    {
      id: 'quem-controla',
      title: '1. Quem controla os dados',
      blocks: [
        {
          type: 'p',
          text: `O Entre Capítulos é mantido por ${config.controllerName}, que decidem como os dados descritos aqui são tratados (o "controlador", na LGPD).`,
        },
        {
          type: 'p',
          text: `Para qualquer pedido ou dúvida sobre privacidade, escreva para ${config.privacyContactEmail}.`,
        },
        {
          type: 'p',
          text: `O site é destinado a pessoas com ${config.minimumAge} anos ou mais.`,
        },
      ],
    },
    {
      id: 'dados',
      title: '2. Quais dados tratamos',
      blocks: [{ type: 'ul', items: dataItems }],
    },
    {
      id: 'publico',
      title: '3. O que é público',
      blocks: [
        {
          type: 'note',
          text: 'Seu nome de exibição e seus comentários são públicos: qualquer visitante, mesmo sem entrar, consegue ler o seu nome, o texto, a data e até que capítulo você tinha lido. Também é público se a pessoa é autora ou moderadora. Não escreva no comentário nada que você não queira que apareça para todo mundo. Seu e-mail não é público.',
        },
      ],
    },
    {
      id: 'finalidades',
      title: '4. Para que usamos os dados',
      blocks: [{ type: 'ul', items: purposes }],
    },
    {
      id: 'bases-legais',
      title: '5. Bases legais',
      blocks: [
        {
          type: 'p',
          text: `As bases legais da LGPD (art. 7º) que justificam cada finalidade: ${config.legalBases}. Este ponto depende de análise jurídica.`,
        },
      ],
    },
    {
      id: 'compartilhamento',
      title: '6. Com quem compartilhamos',
      blocks: [
        {
          type: 'p',
          text: 'Usamos os serviços abaixo para o site funcionar. Eles tratam dados em nosso nome ou, no caso do login, a seu pedido. Não há outros destinatários no código do site.',
        },
        {
          type: 'table',
          caption: 'Serviços usados pelo site',
          head: ['Serviço', 'Para quê', 'Região'],
          rows: providers,
        },
        {
          type: 'p',
          text: 'Esses serviços são de empresas internacionais. A rede de entrega, os registros técnicos e o suporte deles podem envolver outros países, além da região indicada.',
        },
        {
          type: 'p',
          text: `Transferência internacional de dados: ${config.internationalTransfer}. Este ponto depende de análise jurídica.`,
        },
      ],
    },
    {
      id: 'retencao',
      title: '7. Por quanto tempo guardamos',
      blocks: [
        {
          type: 'p',
          text: `Prazos de retenção: ${config.retention}. Inclui as cópias de segurança dos provedores. Este ponto depende de análise jurídica.`,
        },
        {
          type: 'p',
          text: 'Você pode apagar os seus dados a qualquer momento: "Excluir meu comentário" apaga o texto de um comentário, e "Excluir minha conta", em Minha conta, apaga o seu perfil, o seu e-mail, os seus comentários (e as respostas que outras pessoas escreveram a eles) e o seu progresso de leitura. A exclusão da conta não tem volta.',
        },
      ],
    },
    {
      id: 'direitos',
      title: '8. Seus direitos (LGPD, art. 18)',
      blocks: [
        {
          type: 'p',
          text: 'A LGPD garante que você peça, a qualquer momento: confirmação de que tratamos seus dados; acesso aos dados; correção de dados incompletos, inexatos ou desatualizados; anonimização, bloqueio ou eliminação de dados desnecessários ou tratados fora da lei; portabilidade; eliminação dos dados tratados com o seu consentimento; informação sobre com quem compartilhamos os dados; informação sobre a possibilidade de não dar consentimento e suas consequências; e a revogação do consentimento.',
        },
        { type: 'p', text: 'Como exercer, na prática:' },
        {
          type: 'ul',
          items: [
            'Editar o seu nome: em Minha conta (menu da conta, no topo do site).',
            'Baixar uma cópia dos seus dados: em Minha conta, "Baixar meus dados" (um arquivo com o seu perfil, e-mail, todos os seus comentários e o seu progresso).',
            'Excluir um comentário: "Excluir meu comentário", embaixo dele.',
            'Excluir a sua conta: em Minha conta, "Excluir minha conta". Contas da equipe precisam deixar o papel de equipe antes.',
            `Qualquer outro pedido (por exemplo, confirmar o tratamento, corrigir algo que você não consegue editar ou pedir informações): escreva para ${config.privacyContactEmail}, a partir do e-mail cadastrado na conta.`,
          ],
        },
        {
          type: 'p',
          text: `Prazo para responder aos pedidos: ${config.requestDeadline}. Este ponto depende de análise jurídica.`,
        },
      ],
    },
    {
      id: 'cookies',
      title: '9. Cookies e armazenamento no navegador',
      blocks: [
        {
          type: 'p',
          text: 'O site usa apenas cookies essenciais, necessários para o que você pediu (entrar na conta e lembrar até onde leu). Por isso não há aviso de consentimento de cookies.',
        },
        {
          type: 'table',
          caption: 'Cookies do site',
          head: ['Cookie', 'Para quê', 'Duração'],
          rows: cookies.map((cookie) => [cookie.name, cookie.purpose, cookie.duration]),
        },
        {
          type: 'p',
          text: 'O editor de sessões, usado só pela equipe, guarda uma cópia do rascunho no armazenamento local do navegador (IndexedDB) para não perder o texto se o aplicativo for fechado.',
        },
        ...(features.turnstile
          ? [
              {
                type: 'p' as const,
                text: 'Quando a verificação de segurança está ativa, o site carrega scripts da Cloudflare. Os detalhes de cookies ou de armazenamento que esse serviço usa são definidos pela Cloudflare: A DEFINIR (conferir antes de ativar).',
              },
            ]
          : []),
      ],
    },
    {
      id: 'alteracoes',
      title: '10. Mudanças nesta política',
      blocks: [
        {
          type: 'p',
          text: `Podemos atualizar esta política. A data da última atualização é ${config.lastUpdated}.`,
        },
      ],
    },
  ];

  return {
    title: 'Política de Privacidade',
    lead: 'Como o Entre Capítulos trata os seus dados pessoais, em linguagem simples.',
    sections,
  };
}
