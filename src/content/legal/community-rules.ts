import type { IconName } from '@/components/ui/Icon';

/*
 * Combinados da comunidade (etapa 8j). Vivem AQUI, em código, versionados com os Termos de Uso: `/termos` os lista
 * (a seção "Combinados da comunidade") e `/sobre` os mostra num bloco só de leitura. Eles NÃO fazem parte do conteúdo
 * editável da página Sobre: quem edita o Sobre no painel não consegue mudá-los, de propósito, porque são regra do
 * clube e entram nos Termos que a pessoa aceita.
 *
 * Mudou título ou texto de uma regra (ou acrescentou uma)? É mudança nos Termos: suba `TERMS_VERSION` e
 * `legalConfig.lastUpdated`, acrescente a entrada em `TERMS_CHANGELOG` (`version.ts`) e atualize a impressão digital
 * em `terms-version.test.ts`. O teste falha enquanto os três não concordarem.
 */

export type CommunityRule = { icon: IconName; title: string; text: string };

export const COMMUNITY_RULES = [
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
  {
    icon: 'flag',
    // TEXTO DO DONO DO SITE: validar com o advogado (etapa 8j). Regra nova dos combinados, ditada como está.
    title: 'Conteúdo adequado',
    text: 'Sem conteúdo sexual explícito nem palavrões pesados; a moderação pode remover comentários que descumpram os combinados.',
  },
] as const satisfies readonly CommunityRule[];
