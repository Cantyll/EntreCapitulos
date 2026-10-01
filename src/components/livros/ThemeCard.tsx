import { measureContrasts } from '@/lib/theme';
import type { AdminBook } from '@/lib/books/queries';

import { BookCover } from './BookCover';
import styles from './books.module.css';
import { CoverUploader } from './CoverUploader';
import { Icon } from '@/components/ui/Icon';
import { ThemeAutoSwitch } from './ThemeAutoSwitch';

const ROLES = [
  ['Destaque', '--rose-2'],
  ['Profundo', '--rose-deep'],
  ['Suave', '--rose-tint'],
  ['Fundo', '--bg'],
] as const;

/** "Capa e tema do site": a capa do livro em leitura, o interruptor e as cores que o site vai usar. */
export function ThemeCard({ book }: { book: AdminBook | null }) {
  if (!book) {
    return (
      <section className={styles.card} aria-labelledby="tema-titulo">
        <div className={styles.cardHead}>
          <h2 id="tema-titulo">Capa e tema do site</h2>
        </div>
        <p className={styles.empty}>
          O tema acompanha a capa do livro em leitura. Comece um livro para usar este cartão.
        </p>
      </section>
    );
  }

  const { tokens, palette } = book;
  // O selo vem de medir os contrastes de verdade, nos tokens guardados.
  const accessible = tokens ? measureContrasts(tokens).every((check) => check.ok) : false;

  return (
    <section className={styles.card} aria-labelledby="tema-titulo">
      <div className={styles.cardHead}>
        <h2 id="tema-titulo">Capa e tema do site</h2>
        {tokens && book.themeAuto && accessible && (
          <span className={styles.aa}>
            <Icon name="check" size="sm" />
            Contraste AA verificado
          </span>
        )}
      </div>
      <div className={styles.themeGrid}>
        <div>
          <BookCover
            title={book.title}
            author={book.author}
            coverUrl={book.coverUrl}
            width={130}
            fontSize={14}
          />
          <CoverUploader bookId={book.id} themeAuto={book.themeAuto} />
        </div>
        <div>
          <div className={styles.switchRow}>
            <div>
              <b>Tema automático pela capa</b>
              <small>
                As cores do site acompanham o livro que está sendo lido. Troca sozinho quando um
                livro novo começa.
              </small>
            </div>
            <ThemeAutoSwitch bookId={book.id} enabled={book.themeAuto} />
          </div>

          {tokens && palette ? (
            <>
              <div className={styles.palette} role="img" aria-label="Cores extraídas da capa">
                {palette.colors.map((c) => (
                  <i
                    key={c.hex}
                    title={`${c.hex}, ${Math.round(c.share * 100)}% da capa`}
                    style={
                      {
                        '--c': c.hex,
                        '--w': Math.max(c.share, 0.05).toFixed(3),
                      } as React.CSSProperties
                    }
                  />
                ))}
              </div>
              <div className={styles.paletteMeta}>
                <span>
                  {palette.colors.length} cores encontradas, da mais presente para a menos
                </span>
                <span>Base: {palette.accent}</span>
              </div>
              <div className={styles.roles}>
                {ROLES.map(([name, key]) => (
                  <span key={key} className={styles.role}>
                    <i style={{ background: tokens[key] }} />
                    <span>
                      {name}
                      <small>{tokens[key]}</small>
                    </span>
                  </span>
                ))}
              </div>
              {!accessible && (
                <p className={styles.note} role="note">
                  Estas cores não passam na checagem de contraste, então o site usa o tema padrão.
                </p>
              )}
            </>
          ) : (
            <div className={styles.noColors}>
              <b>{book.coverUrl ? 'Sem cores suficientes' : 'Sem capa ainda'}</b>
              <span>
                {book.coverUrl
                  ? 'A capa é quase toda branca ou cinza. O site mantém o tema rosa padrão.'
                  : 'Envie a capa para o site usar as cores dela. Até lá, vale o tema rosa padrão.'}
              </span>
            </div>
          )}
          <p className={styles.explain}>
            Fundo branco da foto é ignorado. O tom de destaque é escurecido até o texto branco ficar
            legível, e o site continua claro.
            {!book.themeAuto && ' Com o tema automático desligado, vale o tema padrão.'}
          </p>
        </div>
      </div>
    </section>
  );
}
