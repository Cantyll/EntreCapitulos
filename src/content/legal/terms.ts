import type { LegalData } from '../legal-config';
import { SOBRE } from '../sobre';
import type { LegalDoc, LegalSection } from './types';

/*
 * Termos de Uso (RASCUNHO para revisão de um profissional). Os combinados da comunidade vêm de
 * `src/content/sobre.ts` (a mesma lista da página "Sobre o clube"): mudou lá, muda aqui.
 */

export function buildTerms(config: LegalData): LegalDoc {
  const sections: LegalSection[] = [
    {
      id: 'o-site',
      title: '1. O que é o Entre Capítulos',
      blocks: [
        {
          type: 'p',
          text: 'O Entre Capítulos é um blog e clube de leitura de Agatha Montinelli. Ela lê um livro por vez e publica sessões de leitura, que são relatos curtos sobre grupos de capítulos. Quem entra no clube pode conversar sobre cada sessão nos comentários, com controle de spoiler por capítulo.',
        },
      ],
    },
    {
      id: 'conta',
      title: '2. Sua conta',
      blocks: [
        {
          type: 'p',
          text: 'Você pode ler as sessões públicas sem conta. Para comentar, é preciso entrar com um código enviado por e-mail ou, quando disponível, com a conta Google.',
        },
        {
          type: 'p',
          text: `O clube é destinado a pessoas com ${config.minimumAge} anos ou mais. O site não verifica a idade de quem cria a conta. Se soubermos que alguém abaixo dessa idade criou uma conta, podemos excluí-la.`,
        },
        {
          type: 'p',
          text: 'Você escolhe o nome que aparece nos seus comentários, que é público. Cuide do acesso ao seu e-mail: quem o controla consegue entrar na sua conta. Você pode trocar o nome, baixar os seus dados e excluir a conta em Minha conta.',
        },
        {
          type: 'p',
          text: 'Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.',
        },
      ],
    },
    {
      id: 'combinados',
      title: '3. Combinados da comunidade',
      blocks: [
        { type: 'ul', items: SOBRE.rules.map((rule) => `${rule.title}: ${rule.text}`) },
        {
          type: 'p',
          text: 'Os primeiros comentários de cada pessoa, e os que têm link, passam por uma análise da moderação antes de aparecer. A moderação pode remover comentários que não respeitem estes combinados.',
        },
      ],
    },
    {
      id: 'comentarios',
      title: '4. O que você escreve',
      blocks: [
        {
          type: 'p',
          text: 'O que você escreve nos comentários continua sendo seu. Ao publicar, você autoriza o site a exibir o seu comentário (com o seu nome de exibição) na página da sessão, para qualquer visitante.',
        },
        {
          type: 'p',
          text: 'Você é responsável pelo que escreve. A moderação pode remover um comentário a qualquer momento.',
        },
        {
          type: 'p',
          text: 'Você pode excluir seus comentários que estejam visíveis ou em análise, quando quiser, no próprio comentário ("Excluir meu comentário", embaixo dele, na página da sessão). Comentários removidos pela moderação não aparecem mais no site, e o texto deles só deixa de existir quando a conta é excluída; se quiser que um deles seja apagado antes, peça pelo e-mail de contato.',
        },
      ],
    },
    {
      id: 'spoiler',
      title: '5. Filtro de spoiler',
      blocks: [
        {
          type: 'p',
          text: 'O filtro de spoiler é uma cortesia de leitura: ele cobre os trechos e comentários que falam de capítulos à frente do que você marcou como lido, mas não é uma garantia. O texto coberto continua na página e pode aparecer por falha, por engano de quem comentou ou quando você escolhe mostrá-lo.',
        },
      ],
    },
    {
      id: 'disponibilidade',
      title: '6. Disponibilidade',
      blocks: [
        {
          type: 'p',
          text: 'O site é oferecido como está, sem garantia de que estará sempre disponível ou livre de erros. Podemos mudar, suspender ou encerrar partes do site.',
        },
      ],
    },
    {
      id: 'privacidade',
      title: '7. Seus dados',
      blocks: [
        {
          type: 'p',
          text: 'O tratamento dos seus dados pessoais está descrito na Política de Privacidade.',
        },
      ],
    },
    {
      id: 'alteracoes',
      title: '8. Mudanças nestes termos',
      blocks: [
        {
          type: 'p',
          text: `Podemos atualizar estes termos. A data da última atualização é ${config.lastUpdated}.`,
        },
      ],
    },
    {
      id: 'contato',
      title: '9. Contato',
      blocks: [
        {
          type: 'p',
          text: `Dúvidas sobre estes termos: ${config.privacyContactEmail}.`,
        },
      ],
    },
  ];

  return {
    title: 'Termos de Uso',
    lead: 'As regras de convivência e de uso do Entre Capítulos.',
    sections,
  };
}
