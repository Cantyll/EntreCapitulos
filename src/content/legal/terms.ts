import type { LegalData } from '../legal-config';
import { SOBRE } from '../sobre';
import { ageSentence } from './age';
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
        { type: 'p', text: ageSentence(config) },
        {
          type: 'p',
          text: 'O aceite (a versão destes Termos e a data) fica registrado enquanto a sua conta existir. Sem o aceite você pode ler as sessões, mas não pode comentar. Se estes Termos mudarem, pedimos um novo aceite.',
        },
        {
          type: 'p',
          text: 'Você escolhe o nome que aparece nos seus comentários, que é público. Cuide do acesso ao seu e-mail: quem o controla consegue entrar na sua conta. Você pode trocar o nome, baixar os seus dados e excluir a conta em Minha conta.',
        },
        {
          type: 'p',
          text: 'Contas da equipe do clube (administração e moderação) têm uma etapa a mais: para excluir, primeiro retiramos o papel de equipe. Peça pelo e-mail de contato.',
        },
        {
          type: 'p',
          text: 'Ao excluir a sua conta ou um comentário, o dado é apagado do banco de dados do site, mas pode continuar por algum tempo em cópias de segurança criptografadas, até elas expirarem. Os detalhes estão na Política de Privacidade.',
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
          // TEXTO DO ADVOGADO: validar a redação final.
          text: 'O Entre Capítulos não se responsabiliza pelo conteúdo gerado pelos usuários (comentários), sendo a responsabilidade civil e penal exclusiva de seus autores.',
        },
        {
          type: 'p',
          // Validar com o advogado: ordem judicial específica (Marco Civil da Internet, art. 19).
          text: 'O site cumpre ordem judicial específica de remoção de conteúdo.',
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
    {
      id: 'foro',
      title: '10. Foro',
      blocks: [
        {
          type: 'p',
          // TEXTO DO ADVOGADO: validar a redação final (e a cláusula diante de uma relação de consumo).
          text: 'Fica eleito o foro da Comarca de Sinop/MT para dirimir quaisquer dúvidas ou litígios decorrentes destes Termos, renunciando as partes a qualquer outro, por mais privilegiado que seja.',
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
