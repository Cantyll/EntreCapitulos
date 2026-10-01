import Image from 'next/image';
import type { CSSProperties } from 'react';

import { cx } from '@/lib/cx';
import { hsl } from '@/lib/theme/color';

import styles from './BookCover.module.css';

type BookCoverProps = {
  title: string;
  author: string;
  /** URL pública da capa; sem ela (ou sem URL do Supabase) usa a capa gerada por CSS. */
  coverUrl: string | null;
  /** Largura em px. */
  width?: number;
  /** Tamanho da fonte do título na capa gerada, em px. */
  fontSize?: number;
  /** Só a imagem ou o gradiente, sem texto (miniatura de tabela). */
  tiny?: boolean;
  priority?: boolean;
};

/** Matiz 0 a 359 estável a partir do título: o mesmo livro sempre tem a mesma capa. */
export function hueFromTitle(title: string): number {
  let n = 0;
  for (const ch of title) n = (n * 31 + ch.charCodeAt(0)) >>> 0;
  return n % 360;
}

export function BookCover({
  title,
  author,
  coverUrl,
  width = 120,
  fontSize = 14,
  tiny,
  priority,
}: BookCoverProps) {
  if (coverUrl) {
    return (
      <div className={styles.cover} style={{ width }}>
        <Image
          src={coverUrl}
          alt={`Capa de ${title}`}
          fill
          sizes={`${width}px`}
          priority={priority}
          className={styles.image}
        />
      </div>
    );
  }

  const hue = hueFromTitle(title);
  const style = {
    width,
    '--c0': hsl(hue, 0.6, 0.9),
    '--c1': hsl(hue, 0.5, 0.78),
    '--cover-ink': hsl(hue, 0.4, 0.2),
    '--cs': `${fontSize}px`,
  } as CSSProperties;

  return (
    <div
      className={cx(styles.cover, styles.generated, tiny && styles.tiny)}
      style={style}
      role="img"
      aria-label={`Capa de ${title}`}
    >
      <div className={styles.title}>{title}</div>
      <div className={styles.ornament} />
      <div className={styles.author}>{author}</div>
    </div>
  );
}
