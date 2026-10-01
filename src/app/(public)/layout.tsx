import { Suspense, type ReactNode } from 'react';

import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SiteHeaderSkeleton } from '@/components/site/SiteHeaderSkeleton';
import { SkipLink } from '@/components/ui/SkipLink';
import { logFailure } from '@/lib/auth/log';
import { getCurrentBook } from '@/lib/public/loaders';

import styles from './layout.module.css';

/**
 * O cabeçalho vai dentro de um Suspense: saber quem está logado e qual é o livro atual leva um
 * instante, e o resto da página (e o `loading.tsx` de cada rota) já pode começar a aparecer.
 */
async function HeaderWithCurrentBook() {
  let slug: string | null = null;
  try {
    slug = (await getCurrentBook())?.slug ?? null;
  } catch (error) {
    // O menu nunca derruba a página: sem o livro atual, "Lendo agora" aponta para /livro.
    logFailure('layout público: livro atual', error);
  }
  return <SiteHeader currentBookSlug={slug} />;
}

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <div className={styles.shell}>
        <Suspense fallback={<SiteHeaderSkeleton />}>
          <HeaderWithCurrentBook />
        </Suspense>
        <main id="conteudo" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
