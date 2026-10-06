import type { AboutContent, AboutFieldError, AboutIssue } from './schema';

/*
 * Os tipos das respostas do servidor ao editor da página Sobre. Ficam num arquivo SEM `server-only` para o editor (um
 * Client Component) e as Server Actions usarem os mesmos nomes.
 */

export type ServerDraft = { updatedAt: string; content: AboutContent };

export type AboutSaveOutcome =
  | { kind: 'saved'; updatedAt: string; content: AboutContent }
  | { kind: 'conflict'; server: ServerDraft | null }
  | { kind: 'invalid'; issue: AboutIssue; fields: AboutFieldError[]; message: string }
  | { kind: 'error'; message: string; pending?: boolean };

export type AboutPublishOutcome =
  | { kind: 'published'; updatedAt: string; content: AboutContent }
  | { kind: 'conflict'; server: ServerDraft | null }
  | { kind: 'invalid'; issue: AboutIssue; fields: AboutFieldError[]; message: string }
  /** `savedUpdatedAt`: o rascunho FOI salvo (e este é o token novo), mas a publicação não aconteceu. */
  | { kind: 'error'; message: string; pending?: boolean; savedUpdatedAt?: string };

export type AboutRestoreOutcome =
  | { kind: 'restored'; updatedAt: string; content: AboutContent }
  | { kind: 'conflict'; server: ServerDraft | null }
  | { kind: 'error'; message: string; pending?: boolean };

export type HistoryItem = {
  id: number;
  kind: 'publish' | 'restore';
  publishedAt: string;
  /** Nome de exibição de quem publicou (os perfis são públicos); `null` se a conta foi excluída. */
  byName: string | null;
  title: string;
};

export type AboutEditorState =
  | { available: false }
  | {
      available: true;
      /** De onde vem o conteúdo inicial do editor. */
      source: 'draft' | 'published' | 'default';
      content: AboutContent;
      /** Token do rascunho; `null` enquanto não há rascunho. */
      draftUpdatedAt: string | null;
      /** O rascunho tem diferença em relação ao publicado (ou há rascunho e nada publicado). */
      hasUnpublishedChanges: boolean;
      /** O que está no ar, ou `null` se nada foi publicado (a página mostra o texto de código). */
      publishedAt: string | null;
      /** Assinatura (`contentSignature`) do que está no ar; `null` se nada foi publicado. */
      publishedSignature: string | null;
      /** O texto salvo não passou na validação e foi trocado pelo padrão (nunca deveria acontecer). */
      contentUnreadable: boolean;
      history: HistoryItem[];
    };
