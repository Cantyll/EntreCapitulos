import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { AdminPage } from '@/components/admin/AdminPage';
import { SessionEditor } from '@/components/sessoes/SessionEditor';
import styles from '@/components/sessoes/sessoes.module.css';
import { logFailure } from '@/lib/auth/log';
import { requireRole } from '@/lib/auth/session';
import { ADMIN_SESSIONS_HREF } from '@/lib/routes';
import { getEditorData, type EditorLoad } from '@/lib/sessions/queries';
import { uuidSchema } from '@/lib/sessions/validation';
import { createClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Editar sessão' };

const BACK = { href: ADMIN_SESSIONS_HREF, label: 'Voltar para Sessões' };

export default async function EditSessionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('admin');

  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  let load: EditorLoad;
  try {
    load = await getEditorData(await createClient(), id);
  } catch (error) {
    logFailure('sessions: abrir o editor', error);
    return (
      <AdminPage back={BACK}>
        <p role="alert" className={`${styles.banner} ${styles.bannerError}`}>
          Não foi possível abrir a sessão agora. Atualize a página em instantes.
        </p>
      </AdminPage>
    );
  }

  if (load.kind === 'not_found') notFound();

  if (load.kind === 'unreadable') {
    return (
      <AdminPage back={BACK}>
        <section className={styles.card}>
          <h2>Não dá para abrir a sessão {load.number} no editor</h2>
          <p className={styles.muted}>
            O texto salvo tem um formato que o editor não reconhece. Para não apagar nada, a sessão
            não foi aberta. Fale com quem cuida do site.
          </p>
        </section>
      </AdminPage>
    );
  }

  const { data } = load;
  return (
    <AdminPage back={BACK}>
      <SessionEditor
        key={data.id}
        book={data.book}
        session={{
          id: data.id,
          number: data.number,
          status: data.status,
          updatedAt: data.updatedAt,
          liveCommentCount: data.liveCommentCount,
        }}
        snapshot={data.snapshot}
        notes={data.notes}
        questions={data.questions}
      />
    </AdminPage>
  );
}
