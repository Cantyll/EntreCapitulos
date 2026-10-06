import { INSTALL_RULES } from '../install';
import { A_DEFINIR, VALIDATED_FIELDS, type LegalData, type LegalText } from '../legal-config';
import { ageSentence } from './age';
import { SITE_COOKIES } from './cookies';
import { activeProviders, regionOf } from './providers';
import type { LegalBlock, LegalDoc, LegalFeatures, LegalSection } from './types';

/*
 * Política de Privacidade (RASCUNHO para revisão de um profissional). Tudo o que depende de decisão ou de
 * análise jurídica vem de `legal-config.ts` como "A DEFINIR". Só se afirma aqui o que o código faz de verdade.
 * Nunca escrever que os dados "não saem do Brasil" nem que "não há transferência internacional".
 */

const isPending = (value: LegalText): boolean => value === A_DEFINIR;

/**
 * Enquanto não houver revisão profissional, todo ponto preenchido é só uma proposta, EXCETO os campos que o advogado
 * já validou (`VALIDATED_FIELDS`): nesses o aviso por ponto não aparece (o selo "Rascunho em revisão" da página
 * continua enquanto `legalReviewed` for `false`).
 */
function proposalNote(config: LegalData, field?: string): LegalBlock[] {
  const validated = field !== undefined && (VALIDATED_FIELDS as readonly string[]).includes(field);
  return config.legalReviewed || validated
    ? []
    : [{ type: 'p', text: 'Este ponto ainda precisa ser validado por um advogado.' }];
}

/**
 * Um campo de `legal-config.ts` como texto. Pendente: a frase única de antes ("…: A DEFINIR. Este ponto
 * depende de análise jurídica."). Preenchido: a introdução, o conteúdo (frase ou lista) e o aviso de proposta.
 */
function describeField(
  config: LegalData,
  intro: string,
  value: LegalText,
  pendingTail: string,
  /** Caminho do campo em `legal-config.ts` (`legalBases`, `backups.retention`…), para saber se já foi validado. */
  field?: string,
): LegalBlock[] {
  if (isPending(value)) {
    return [{ type: 'p', text: `${intro}: ${value as string}. ${pendingTail}` }];
  }
  const content: LegalBlock =
    typeof value === 'string' ? { type: 'p', text: value } : { type: 'ul', items: value };
  return [{ type: 'p', text: `${intro}:` }, content, ...proposalNote(config, field)];
}

export function buildPrivacy(config: LegalData, features: LegalFeatures): LegalDoc {
  const { regions } = config;

  const dataItems = [
    `E-mail: o endereço que você informa para entrar${features.google ? ' (ou que o Google informa, se você entrar com ele)' : ''}. Usamos para enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer. Ele não é público: só você e, para dar suporte e atender pedidos sobre os seus dados, a administração do clube o veem (veja "Consulta de contato pela administração", mais abaixo).`,
    'Nome de exibição: o nome que você escolhe no primeiro acesso e pode trocar em Minha conta. É público.',
    ...(features.google
      ? [
          'Se você escolher entrar com o Google, ele nos informa seu nome, e-mail e foto de perfil. O nome inicial do perfil vem daí.',
        ]
      : []),
    'Comentários e respostas: o texto, a data, o estado de moderação (em análise, publicado ou removido), o aviso de spoiler, se houver, e até que capítulo você tinha lido quando comentou. Nome, texto e esse capítulo são públicos.',
    'Alertas de moderação: quando um comentário tem um link, a equipe vê um alerta interno ("Contém link"). Só a equipe vê.',
    'Progresso de leitura: até que capítulo você leu em cada livro. Com conta, fica guardado no banco de dados; sem conta, fica num cookie do seu navegador.',
    `Consulta de contato pela administração: a administração do clube pode ver o seu e-mail, a data do seu último acesso e como você entra (código por e-mail${features.google ? ' ou Google' : ''}), só para dar suporte e atender pedidos sobre os seus dados. Cada vez que o e-mail completo, o último acesso e o provedor são mostrados, a consulta fica registrada. A lista de membros mostra só um e-mail parcial (a primeira letra e o domínio) e a busca por um e-mail exato diz se existe uma conta com ele; esses dois usos não ficam registrados.`,
    'Situação dos comentários: a administração pode suspender a publicação de comentários de uma conta. Essa informação só a própria pessoa e a administração veem.',
    'Registro das ações da administração (auditoria): quando a administração muda um cargo, suspende ou reativa comentários, consulta o e-mail, baixa os dados ou exclui uma conta, fica registrado quem fez, em qual conta, o quê e quando. O registro não guarda nome, e-mail nem texto: só os identificadores internos das contas e, na mudança de cargo, o cargo de antes e o de depois. Só a administração o vê.',
    `Aceite dos Termos: a versão dos Termos de Uso e da Política de Privacidade que você aceitou, a data do primeiro aceite e a do último. O aceite vale também como a sua declaração de ter ${config.minimumAge} anos ou mais: o site não verifica a idade. Só você e, ao atender um pedido sobre os seus dados, a administração o veem.`,
    'Registro mínimo de exclusões: quando uma conta é excluída, guardamos por 56 dias apenas um identificador técnico e a data da exclusão, sem nome, e-mail nem texto. Ninguém o vê pelo site.',
    'Registros técnicos: os provedores de hospedagem e de banco de dados podem registrar dados técnicos de acesso, como endereço IP, data e hora, tipo de navegador e páginas acessadas, para operar e proteger o serviço. O site não usa ferramentas de análise de audiência nem de publicidade.',
    ...(features.turnstile
      ? [
          'Quando a verificação anti-robô (Cloudflare Turnstile) estiver ativa, ela é usada na tela de entrada para confirmar que o envio vem de uma pessoa. Ela recebe dados do seu navegador; os dados exatos são definidos pela Cloudflare.',
        ]
      : []),
  ];

  const purposes = [
    'Deixar você entrar na sua conta e manter a sessão, enviar o código de acesso por e-mail e responder aos pedidos que você nos fizer.',
    'Mostrar as sessões de leitura e esconder o que fala de capítulos que você ainda não leu.',
    'Publicar, moderar e exibir comentários e respostas.',
    'Guardar até onde você leu, para a próxima visita.',
    'Proteger o site contra abuso e spam (limite de comentários por minuto e por hora, análise de comentários com link e, quando ativa, a verificação anti-robô no envio do código).',
    'Dar suporte, atender os pedidos sobre os dados e proteger a comunidade: a administração pode ver o e-mail de uma conta, suspender os comentários dela ou excluí-la, e registra essas ações.',
    `Registrar o aceite dos Termos de Uso e da Política de Privacidade e a declaração de ter ${config.minimumAge} anos ou mais.`,
    'Evitar que contas e dados já excluídos sejam recriados por engano ao restaurar uma cópia de segurança (registro mínimo de exclusões).',
    'Cumprir obrigações legais e exercer direitos em eventual disputa.',
  ];

  const providers: string[][] = activeProviders(features).map((provider) => [
    provider.name,
    provider.purpose,
    regionOf(config, provider.id),
  ]);

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
        { type: 'p', text: ageSentence(config) },
        ...proposalNote(config, 'minimumAge'),
        {
          type: 'p',
          text: `${config.dataProtectionOfficer} O canal para os titulares falarem com a gente é o e-mail de contato: ${config.privacyContactEmail}.`,
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
          text: 'Seu nome de exibição e seus comentários são públicos: qualquer visitante, mesmo sem entrar, consegue ler o seu nome, o texto, a data e até que capítulo você tinha lido. Também é público se a conta é da administração ou da moderação (um selo aparece ao lado do nome). Não escreva no comentário nada que você não queira que apareça para todo mundo. Seu e-mail não é público.',
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
        ...describeField(
          config,
          'As bases legais da LGPD (art. 7º) que justificam cada finalidade',
          config.legalBases,
          'Este ponto depende de análise jurídica.',
          'legalBases',
        ),
        ...describeField(
          config,
          'Base legal do registro mínimo de exclusões',
          config.deletionRegistry.legalBasis,
          'Este ponto depende de análise jurídica.',
          'deletionRegistry',
        ),
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
          text: `O banco de dados e a autenticação (Supabase) ficam na região de ${regions.supabase}. As funções do site (Vercel) rodam na região de ${regions.vercel}, conforme a configuração do projeto no provedor.`,
        },
        ...(isPending(config.internationalTransfer)
          ? [
              {
                type: 'p' as const,
                text: 'Esses serviços são de empresas internacionais. A rede de entrega, os registros técnicos e o suporte deles podem envolver outros países, além da região indicada.',
              },
            ]
          : []),
        ...describeField(
          config,
          'Transferência internacional de dados',
          config.internationalTransfer,
          'Este ponto depende de análise jurídica.',
          'internationalTransfer',
        ),
        {
          type: 'p',
          text: `As cópias de segurança criptografadas do banco de dados ficam num serviço de armazenamento da Cloudflare (R2). Região: ${regions.cloudflareR2}`,
        },
        ...describeField(
          config,
          'Transferência internacional das cópias de segurança',
          config.backups.internationalTransfer,
          'Este ponto depende de análise jurídica.',
          'backups.internationalTransfer',
        ),
      ],
    },
    {
      id: 'retencao',
      title: '7. Por quanto tempo guardamos',
      blocks: [
        ...describeField(
          config,
          'Por quanto tempo guardamos cada tipo de dado',
          config.retention,
          'Inclui as cópias de segurança dos provedores. Este ponto depende de análise jurídica.',
          'retention',
        ),
        {
          type: 'p',
          text: 'Guardamos cópias de segurança criptografadas do banco de dados, para recuperar o site se houver uma perda de dados. Elas podem conter dados que você já excluiu, como comentários e contas apagados, até que cada cópia expire e seja descartada. Por isso, excluir um comentário ou a conta apaga o dado do banco de dados do site, mas não das cópias de segurança já feitas.',
        },
        ...describeField(
          config,
          'Por quanto tempo guardamos as cópias de segurança',
          config.backups.retention,
          'Este ponto depende de análise jurídica.',
          'backups.retention',
        ),
        {
          type: 'p',
          text: 'Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato. As respostas de outras pessoas a um comentário excluído deixam de aparecer no site, mas continuam guardadas até a exclusão da conta de quem as escreveu.',
        },
        {
          type: 'p',
          text: '"Excluir minha conta", em Minha conta, apaga o seu perfil, o seu e-mail, os seus comentários (e as respostas que outras pessoas escreveram a eles), o aceite dos Termos e o seu progresso de leitura. A exclusão da conta não tem volta.',
        },
        {
          type: 'p',
          // Texto fornecido pelo dono do site: validar a redação final com o advogado.
          text: 'Caso haja a restauração de um backup, mantemos um registro mínimo, seguro e inacessível ao público (apenas um identificador técnico e a data) com o único objetivo de garantir que contas e dados já excluídos por você não sejam recriados acidentalmente. Esse registro é mantido por 56 dias, o mesmo prazo das cópias de segurança semanais, e depois é apagado.',
        },
        {
          type: 'p',
          text: 'Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.',
        },
        {
          type: 'p',
          text: 'O registro das ações da administração guarda só os identificadores internos das contas. Quando uma conta é excluída, as linhas sobre ela (e as em que ela foi quem fez a ação) continuam, ligadas só a esse identificador, que já não corresponde a nenhum perfil, sem nome, e-mail nem texto.',
        },
        ...describeField(
          config,
          'Por quanto tempo guardamos o registro das ações da administração',
          config.audit.retention,
          'Este ponto depende de análise jurídica.',
          'audit.retention',
        ),
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
            'Baixar uma cópia dos seus dados: em Minha conta, "Baixar meus dados" (um arquivo com o seu perfil, e-mail, todos os seus comentários, o seu progresso e o seu aceite dos Termos).',
            'Excluir um comentário que esteja visível ou em análise: "Excluir meu comentário", embaixo dele. Para um comentário removido pela moderação, peça pelo e-mail de contato.',
            'Excluir a sua conta: em Minha conta, "Excluir minha conta". Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.',
            'Pedir uma cópia dos seus dados ou a exclusão da conta pelo e-mail de contato: a administração confirma que o pedido vem do e-mail cadastrado na conta e atende pelo painel, com a mesma cópia e a mesma exclusão de "Minha conta". Cada uma dessas ações fica registrada.',
            `Qualquer outro pedido (por exemplo, confirmar o tratamento, corrigir algo que você não consegue editar ou pedir informações): escreva para ${config.privacyContactEmail}, a partir do e-mail cadastrado na conta.`,
          ],
        },
        ...describeField(
          config,
          'Prazo para responder aos pedidos',
          config.requestDeadline,
          'Este ponto depende de análise jurídica.',
          'requestDeadline',
        ),
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
        {
          type: 'p',
          text: `Em iPhones e iPads (no Safari ou no navegador embutido de outro aplicativo), o site guarda uma preferência no armazenamento local do navegador (${INSTALL_RULES.storageKey}) para decidir quando mostrar o cartão que ensina a colocar o Entre Capítulos na Tela de Início. Ela guarda em quantos dias diferentes você abriu o site neste aparelho, o último desses dias, se você tocou em "Agora não" (e quando; o cartão pode voltar depois de ${INSTALL_RULES.dismissDays} dias) e se você tocou em "Já instalei". Não guarda nome, e-mail nem identificador de conta, nunca é enviada ao servidor e fica neste aparelho até o navegador limpar os dados do site. Nos outros aparelhos e no aplicativo instalado, o site não grava essa preferência.`,
        },
        ...(features.turnstile
          ? [
              {
                type: 'p' as const,
                text: 'Quando a verificação de segurança está ativa, o site carrega scripts da Cloudflare. Num teste com a chave de testes da Cloudflare, o widget não criou cookies no site e guardou um item no armazenamento local do próprio domínio da Cloudflare; o que o serviço usa de verdade com a chave real é definido pela Cloudflare: A DEFINIR (conferir antes de ativar).',
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
