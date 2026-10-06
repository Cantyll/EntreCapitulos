import { unstable_rethrow } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { InstallGate } from '@/components/install/InstallGate';
import { TermsNotice } from '@/components/legal/TermsNotice';
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
    // Os erros internos do Next (página que precisa de requisição, por exemplo) seguem em frente.
    unstable_rethrow(error);
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
        {/* Aviso do aceite dos Termos: só para quem está logado e ainda não aceitou (a equipe também). */}
        <Suspense fallback={null}>
          <TermsNotice />
        </Suspense>
        <main id="conteudo" tabIndex={-1} className={styles.main}>
          {children}
          {/* Cartão "Instale o Entre Capítulos": só no navegador, no fim do conteúdo, antes do rodapé. */}
          <InstallGate surface="public" />
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
