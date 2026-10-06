import { TERMS_VERSION } from '@/content/legal/version';
import type { Role } from '@/lib/auth/roles';

/*
 * O aceite dos Termos e da Política de Privacidade (que traz a declaração de ter 18 anos ou mais). Regras puras:
 *  - accepted: aceitou a versão atual (`TERMS_VERSION`);
 *  - outdated: aceitou uma versão anterior (o app pede de novo, mas não bloqueia);
 *  - missing: nunca aceitou (o banco recusa o comentário de quem não é equipe);
 *  - unknown: não deu para ler (a tabela ainda não existe, ou falha de leitura). Nunca avisa nem bloqueia.
 * É uma DECLARAÇÃO: o site não verifica a idade.
 */
export type TermsStatus = 'accepted' | 'outdated' | 'missing' | 'unknown';

export function classifyTermsRow(
  version: string | null | undefined,
  current: string = TERMS_VERSION,
): Exclude<TermsStatus, 'unknown'> {
  if (version === null || version === undefined) return 'missing';
  return version === current ? 'accepted' : 'outdated';
}

/** O aviso do site (e o caminho para aceitar) aparece para quem não aceitou ou aceitou uma versão antiga. */
export function needsTermsNotice(status: TermsStatus): boolean {
  return status === 'missing' || status === 'outdated';
}

/**
 * O compositor de comentário fica no lugar do convite para aceitar? Só para membro que NUNCA aceitou: a equipe é
 * isenta (o banco também) e uma versão antiga não bloqueia.
 */
export function blocksCommenting(role: Role, status: TermsStatus): boolean {
  return role === 'member' && status === 'missing';
}

/** Rotas em que o aviso não aparece: a de entrar, a própria do aceite e a da conta excluída. */
const NOTICE_HIDDEN_PATHS = ['/entrar', '/boas-vindas', '/conta/excluida'] as const;

export function isNoticeHiddenPath(pathname: string): boolean {
  const lower = pathname.toLowerCase();
  return NOTICE_HIDDEN_PATHS.some((path) => lower === path || lower.startsWith(`${path}/`));
}

/** Para onde o aviso e o convite levam: /boas-vindas, voltando para `next` (já validado por quem chama). */
export function acceptHref(next: string): string {
  return next === '/' ? '/boas-vindas' : `/boas-vindas?next=${encodeURIComponent(next)}`;
}
