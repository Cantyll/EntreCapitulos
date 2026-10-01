import type { Metadata } from 'next';

import { AdminPage } from '@/components/admin/AdminPage';
import { SessionEditor } from '@/components/sessoes/SessionEditor';
import styles from '@/components/sessoes/sessoes.module.css';
import { ButtonLink } from '@/components/ui/Button';
import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import {
  ADMIN_BOOKS_HREF,
  ADMIN_SESSIONS_HREF,
  adminBookHref,
  adminSessionHref,
} from '@/lib/routes';
import { EMPTY_BODY } from '@/lib/session-body';
import { getNewSessionContext, type NewSessionContext } from '@/lib/sessions/queries';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Nova sessão' };

const BACK = { href: ADMIN_SESSIONS_HREF, label: 'Voltar para Sessões' };

export default async function NewSessionPage() {
  await requireRole('admin');

  let context: NewSessionContext;
  try {
    context = await getNewSessionContext(await createClient());
  } catch (error) {
    logFailure('sessions: nova sessão', error);
    return (
      <AdminPage back={BACK}>
        <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          Não foi possível abrir o editor agora. Atualize a página em instantes.
        </p>
      </AdminPage>
    );
  }

  if (context.kind === 'no_book') {
    return (
      <AdminPage back={BACK}>
        <section className={styles.card}>
          <h2>Não há livro em leitura</h2>
          <p className={styles.muted} style={{ margin: '4px 0 14px' }}>
            As sessões pertencem ao livro que está sendo lido. Comece um livro da fila ou cadastre
            um novo.
          </p>
          <ButtonLink href={ADMIN_BOOKS_HREF}>Ir para Livros</ButtonLink>
        </section>
      </AdminPage>
    );
  }

  // Um rascunho esperando: continua nele em vez de criar outro.
  if (context.draft) {
    return (
      <AdminPage back={BACK}>
        <section className={styles.card}>
          <h2>Você já tem um rascunho</h2>
          <p className={styles.muted} style={{ margin: '4px 0 14px' }}>
            A sessão {context.draft.number}, “{context.draft.title}”, ainda não foi publicada.
            Continue nela antes de começar outra.
          </p>
          <ButtonLink href={adminSessionHref(context.draft.id)}>Continuar rascunho</ButtonLink>
        </section>
      </AdminPage>
    );
  }

  if (!context.range) {
    return (
      <AdminPage back={BACK}>
        <section className={styles.card}>
          <h2>Todos os capítulos já têm sessão</h2>
          <p className={styles.muted} style={{ margin: '4px 0 14px' }}>
            O total de {context.book.totalChapters} capítulos de “{context.book.title}” já está
            coberto. Se o livro tem mais capítulos, corrija o total do livro.
          </p>
          <ButtonLink href={adminBookHref(context.book.id)}>Corrigir o total do livro</ButtonLink>
        </section>
      </AdminPage>
    );
  }

  return (
    <AdminPage back={BACK}>
      <SessionEditor
        book={context.book}
        session={{
          id: null,
          number: context.nextNumber,
          status: 'draft',
          updatedAt: null,
          commentCount: 0,
        }}
        snapshot={{
          title: '',
          body: EMPTY_BODY,
          chapterFrom: context.range.from,
          chapterTo: context.range.to,
          visibility: 'public',
          commentsOpen: true,
          rating: null,
          excerpt: '',
        }}
        notes={[]}
        questions={[]}
      />
    </AdminPage>
  );
}
