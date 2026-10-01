import 'server-only';

import { cookies } from 'next/headers';

import { logFailure } from '@/lib/auth/log';
import { createClient } from '@/lib/supabase/server';
import { PROGRESS_COOKIE, parseProgressCookie } from '@/lib/spoiler';
import { planProgressMigration } from '@/lib/spoiler/migrate';

import { getBooks } from './queries';

/**
 * Ao entrar, leva o progresso que o visitante tinha no cookie para o banco, só onde ainda não há
 * linha (nunca sobrescreve), e apaga o cookie. Nunca lança: uma falha aqui não pode impedir o login,
 * e o cookie fica onde está para a próxima tentativa.
 */
export async function migrateVisitorProgress(
  userId: string,
  supabase?: Awaited<ReturnType<typeof createClient>>,
): Promise<void> {
  try {
    const store = await cookies();
    const raw = store.get(PROGRESS_COOKIE)?.value;
    if (raw === undefined) return;

    const rows = planProgressMigration(parseProgressCookie(raw), await getBooks());
    if (rows.length > 0) {
      const client = supabase ?? (await createClient());
      const { error } = await client
        .from('reading_progress')
        .upsert(
          rows.map((row) => ({ ...row, user_id: userId })),
          { onConflict: 'user_id,book_id', ignoreDuplicates: true },
        );
      if (error) throw error;
    }
    store.delete(PROGRESS_COOKIE);
  } catch (error) {
    logFailure('progress: migrar o cookie ao entrar', error);
  }
}
