'use client';

import { useRouter } from 'next/navigation';
import { useId, useTransition } from 'react';

import type { CommentOrder } from '@/lib/comments';

import styles from './comments.module.css';

/** "Mais recentes" / "Mais antigos": vai para a mesma página com `?ordem=antigos` (a ordem é da URL). */
export function CommentSort({ order, basePath }: { order: CommentOrder; basePath: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const id = useId();

  return (
    <div className={styles.sort}>
      <label htmlFor={id} className={styles.srOnly}>
        Ordenar comentários
      </label>
      <select
        id={id}
        value={order}
        disabled={pending}
        onChange={(event) => {
          const next = event.target.value === 'antigos' ? 'antigos' : 'recentes';
          const url = `${basePath}${next === 'antigos' ? '?ordem=antigos' : ''}#discussao`;
          startTransition(() => router.replace(url as never, { scroll: false }));
        }}
      >
        <option value="recentes">Mais recentes</option>
        <option value="antigos">Mais antigos</option>
      </select>
    </div>
  );
}
