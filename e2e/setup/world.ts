import { mkdirSync, rmSync } from 'node:fs';

import { lit, sql } from '../support/db';
import {
  CLAIMS_DIR,
  WORLD,
  chapterText,
  chapterTitle,
  OPENING_TEXT,
  poolSlug,
} from '../support/world';

function body(from: number, to: number): string {
  const content: unknown[] = [
    { type: 'paragraph', content: [{ type: 'text', text: OPENING_TEXT }] },
  ];
  for (let chapter = from; chapter <= to; chapter += 1) {
    content.push({ type: 'chapterDivider', attrs: { chapter, title: chapterTitle(chapter) } });
    content.push({ type: 'paragraph', content: [{ type: 'text', text: chapterText(chapter) }] });
  }
  return JSON.stringify({ type: 'doc', content });
}

type Row = {
  slug: string;
  title: string;
  total: number;
  sessions: {
    number: number;
    from: number;
    to: number;
    title: string;
    status: string;
    visibility: string;
    commentsOpen: boolean;
  }[];
};

function insertSql(rows: Row[]): string {
  const out: string[] = [];
  for (const row of rows) {
    out.push(
      `with b as (insert into public.books (slug, title, author, total_chapters, current_chapter, status, rating, started_at, finished_at)
         values (${lit(row.slug)}, ${lit(row.title)}, 'Autora de Teste', ${row.total}, ${row.total}, 'finished', 4, '2026-01-10', '2026-02-10') returning id)
       insert into public.reading_sessions (book_id, number, chapter_from, chapter_to, title, body, excerpt, rating, visibility, status, published_at, read_minutes, comments_open)
       values ${row.sessions
         .map(
           (s) =>
             `((select id from b), ${s.number}, ${s.from}, ${s.to}, ${lit(s.title)}, ${lit(body(s.from, s.to))}::jsonb, 'Resumo de teste', 4, ${lit(s.visibility)}, ${lit(s.status)}, ${s.status === 'published' ? 'now()' : 'null'}, 3, ${s.commentsOpen})`,
         )
         .join(', ')};`,
    );
  }
  return out.join('\n');
}

/** Apaga o que uma rodada anterior deixou e cria o mundo. Roda antes de o app receber a primeira requisição. */
export default function globalSetup() {
  rmSync(CLAIMS_DIR, { recursive: true, force: true });
  mkdirSync(CLAIMS_DIR, { recursive: true });

  sql(`
    delete from public.comments where session_id in (select s.id from public.reading_sessions s join public.books b on b.id = s.book_id where b.slug like 'e2e-%');
    delete from public.reading_sessions where book_id in (select id from public.books where slug like 'e2e-%');
    delete from public.books where slug like 'e2e-%';
    delete from auth.users where email like '%@teste.example';
    -- O registro mínimo de exclusões que as rodadas anteriores deixaram (banco local de teste).
    delete from public.account_deletions;

    -- A página Sobre editável (etapa 8j): nada publicado, sem rascunho e sem histórico. O app só lê o publicado
    -- depois da primeira requisição, então isto precisa rodar antes dela. (As fotos de rodadas anteriores ficam no
    -- Storage: o banco local não deixa apagar storage.objects por SQL, e uma foto sem referência é inofensiva.)
    delete from public.site_page_revisions;
    delete from public.site_page_drafts;
    delete from public.site_pages;

    -- O que o painel (chromium-admin) cria e altera: livros "Livro do Painel …" e o estado do livro atual do seed.
    delete from public.comments where session_id in (select s.id from public.reading_sessions s join public.books b on b.id = s.book_id where b.title like 'Livro do Painel %');
    delete from public.reading_sessions where book_id in (select id from public.books where title like 'Livro do Painel %');
    delete from public.books where title like 'Livro do Painel %';
    delete from public.comments where session_id in (select s.id from public.reading_sessions s join public.books b on b.id = s.book_id where b.slug = 'o-livro-de-azrael' and s.number > 4);
    delete from public.reading_sessions where number > 4 and book_id in (select id from public.books where slug = 'o-livro-de-azrael');
    update public.books
       set status = 'reading', rating = null, finished_at = null, current_chapter = 12, total_chapters = 52,
           started_at = '2026-09-02', theme_auto = true
     where slug = 'o-livro-de-azrael';
  `);

  const sessions = WORLD.sessions;
  const rows: Row[] = [
    {
      slug: WORLD.readingSlug,
      title: 'Livro de Teste da Leitura',
      total: 12,
      sessions: [
        { ...sessions.public, status: 'published', visibility: 'public', commentsOpen: true },
        { ...sessions.members, status: 'published', visibility: 'members', commentsOpen: true },
        { ...sessions.draft, status: 'draft', visibility: 'public', commentsOpen: true },
        { ...sessions.closed, status: 'published', visibility: 'public', commentsOpen: false },
      ],
    },
  ];
  for (let slot = 1; slot <= WORLD.poolSize; slot += 1) {
    rows.push({
      slug: poolSlug(slot),
      title: `Livro do Pool ${slot}`,
      total: 6,
      sessions: [
        {
          number: 1,
          from: 1,
          to: 3,
          title: `Sessão do Pool ${slot}`,
          status: 'published',
          visibility: 'public',
          commentsOpen: true,
        },
      ],
    });
  }
  sql(insertSql(rows));
}
