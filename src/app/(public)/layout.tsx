import type { ReactNode } from 'react';

import { SiteFooter } from '@/components/site/SiteFooter';
import { SiteHeader } from '@/components/site/SiteHeader';
import { SkipLink } from '@/components/ui/SkipLink';
import { currentBook } from '@/lib/sample-data';

import styles from './layout.module.css';

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <SkipLink />
      <div className={styles.shell}>
        <SiteHeader currentBookSlug={currentBook.slug} />
        <main id="conteudo" tabIndex={-1} className={styles.main}>
          {children}
        </main>
        <SiteFooter />
      </div>
    </>
  );
}
