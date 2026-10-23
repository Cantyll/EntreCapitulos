import { beforeEach, describe, expect, it, vi } from 'vitest';

import { autoExcerpt, type BodyDoc } from '@/lib/session-body';
import type { SessionSnapshot } from '@/lib/session-editor/snapshot';

import {
  classifySessionError,
  overlapMessage,
  SESSION_MESSAGES,
  sessionErrorMessage,
} from './errors';
import {
  addNote,
  addQuestion,
  removeNote,
  reorderNotes,
  reorderQuestions,
  updateNote,
  updateQuestion,
} from './items';
import {
  contentProblem,
  deleteDraftSession,
  publishSession,
  resolveExcerpt,
  rowToSnapshot,
  saveSession,
  unpublishSession,
} from './service';
import { FakeDb } from './test-support/fake-supabase';
import { sessionFieldsSchema, UNTITLED } from './validation';

const p = (text: string) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const divider = (chapter: number) => ({ type: 'chapterDivider', attrs: { chapter } });
const doc = (...content: unknown[]) => ({ type: 'doc', content }) as unknown as BodyDoc;

const fieldsOf = (over: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  title: 'Faíscas',
  body: doc(p('Abertura.'), divider(10), p('Texto do capítulo dez.')),
  chapterFrom: 10,
  chapterTo: 12,
  visibility: 'public',
  commentsOpen: true,
  rating: 4.5,
  excerpt: '',
  ...over,
});

const BOOK = '10000000-0000-4000-8000-000000000001';
const T1 = '2026-10-01T12:00:00.123456+00:00';
const T2 = '2026-10-01T12:00:00.123457+00:00';

function seed(options: { status?: 'draft' | 'published'; updatedAt?: string } = {}) {
  const db = new FakeDb();
  db.tables.books!.push({
    id: BOOK,
    title: 'Livro',
    slug: 'livro',
    status: 'reading',
    total_chapters: 52,
  });
  const row = {
    id: '20000000-0000-4000-8000-000000000001',
    book_id: BOOK,
    number: 5,
    chapter_from: 10,
    chapter_to: 12,
    title: 'Antigo',
    body: doc(p('Antigo texto.')),
    excerpt: null,
    rating: null,
    visibility: 'public',
    status: options.status ?? 'draft',
    comments_open: true,
    read_minutes: 1,
    published_at: null,
    created_at: T1,
    updated_at: options.updatedAt ?? T1,
  };
  db.tables.reading_sessions!.push(row);
  return { db, row, supabase: db.client() };
}

beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

describe('errors', () => {
  it.each([
    ['not_admin: x', undefined, 'not_admin'],
    ['session_not_found: x', undefined, 'session_not_found'],
    ['invalid_state: x', undefined, 'invalid_state'],
    ['book_not_found: x', undefined, 'book_not_found'],
    ['session_has_comments: x', undefined, 'session_has_comments'],
    ['chapter_beyond_total: x', '23514', 'chapter_beyond_total'],
    ['function public.publish_session does not exist', '42883', 'migration_pending'],
    ['Could not find the function', 'PGRST202', 'migration_pending'],
    ['conflicting key value', '23P01', 'overlap'],
    ['duplicate key', '23505', 'number_taken'],
    ['violates foreign key', '23503', 'has_comments'],
    ['permission denied', '42501', 'not_admin'],
    ['boom', 'XX000', 'generic'],
  ])('%s (%s) → %s', (message, code, key) => {
    expect(classifySessionError({ message, code })).toBe(key);
  });

  it('a constraint books_current_chapter_range vira a mensagem do total', () => {
    const error = {
      code: '23514',
      message:
        'new row for relation "books" violates check constraint "books_current_chapter_range"',
    };
    expect(classifySessionError(error)).toBe('chapter_beyond_total');
    expect(sessionErrorMessage(error, { total: 52, chapterTo: 60 })).toBe(
      'O livro tem 52 capítulos e esta sessão vai até o 60. Corrija o total do livro.',
    );
  });

  it('outra 23514 (ex.: título) é genérica', () => {
    expect(
      classifySessionError({ code: '23514', message: 'violates check constraint "title"' }),
    ).toBe('generic');
  });

  it('mensagens de sobreposição em pt-BR', () => {
    expect(overlapMessage(10, 12, 4)).toBe('Os capítulos 10 a 12 já pertencem à sessão 4.');
    expect(overlapMessage(10, 10, 4)).toBe('O capítulo 10 já pertence à sessão 4.');
  });

  it('a mensagem de "falta aplicar" aponta o Database deploy', () => {
    expect(SESSION_MESSAGES.migration_pending).toContain('Database deploy');
  });

  it('sem erro, é genérico', () => {
    expect(classifySessionError(null)).toBe('generic');
  });
});

describe('validação dos campos (lista fixa)', () => {
  it('aceita exatamente os 8 campos', () => {
    expect(sessionFieldsSchema.safeParse(fieldsOf()).success).toBe(true);
  });

  it.each([
    'status',
    'published_at',
    'book_id',
    'number',
    'id',
    'updated_at',
    'read_minutes',
    'created_at',
  ])('recusa o campo extra %s', (key) => {
    expect(sessionFieldsSchema.safeParse({ ...fieldsOf(), [key]: 'x' }).success).toBe(false);
  });

  it.each([
    [{ chapterFrom: 5, chapterTo: 4 }],
    [{ chapterFrom: 0 }],
    [{ chapterTo: 1.5 }],
    [{ visibility: 'secret' }],
    [{ rating: 4.3 }],
    [{ rating: 6 }],
    [{ title: 'a'.repeat(201) }],
    [{ excerpt: 'a'.repeat(301) }],
    [{ commentsOpen: 'sim' }],
  ])('recusa %j', (over) => {
    expect(sessionFieldsSchema.safeParse({ ...fieldsOf(), ...over }).success).toBe(false);
  });
});

describe('saveSession: criar', () => {
  it('cria no livro em leitura, como rascunho, com número = maior + 1', async () => {
    const { db, supabase } = seed();
    db.tables.reading_sessions![0]!.chapter_from = 1;
    db.tables.reading_sessions![0]!.chapter_to = 3;
    const out = await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: fieldsOf(),
    });
    expect(out).toMatchObject({ kind: 'ok', number: 6, status: 'draft' });
    const created = db.tables.reading_sessions!.at(-1)!;
    expect(created).toMatchObject({ book_id: BOOK, number: 6, status: 'draft', title: 'Faíscas' });
  });

  it('só as colunas da lista chegam ao insert (mais book_id, number e status do servidor)', async () => {
    const { db, supabase } = seed();
    db.tables.reading_sessions!.length = 0;
    await saveSession(supabase, { sessionId: null, expectedUpdatedAt: null, fields: fieldsOf() });
    const payload = db.log.find((l) => l.table === 'reading_sessions' && l.op === 'insert')!
      .payload as Record<string, unknown>;
    expect(Object.keys(payload).sort()).toEqual(
      [
        'body',
        'book_id',
        'chapter_from',
        'chapter_to',
        'comments_open',
        'excerpt',
        'number',
        'rating',
        'read_minutes',
        'status',
        'title',
        'visibility',
      ].sort(),
    );
    expect(payload.status).toBe('draft');
    expect(payload.number).toBe(1);
  });

  it('título vazio grava "Sem título", e a tela recebe o campo vazio de volta', async () => {
    const { db, supabase } = seed();
    db.tables.reading_sessions!.length = 0;
    await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: fieldsOf({ title: '   ' }),
    });
    const row = db.tables.reading_sessions![0]!;
    expect(row.title).toBe(UNTITLED);
    expect(rowToSnapshot(row as never)?.title).toBe('');
  });

  it('sem livro em leitura, recusa', async () => {
    const { db, supabase } = seed();
    db.tables.books![0]!.status = 'queued';
    const out = await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: fieldsOf(),
    });
    expect(out).toMatchObject({ kind: 'rejected' });
    expect((out as { message: string }).message).toContain('livro em leitura');
  });

  it('colisão de número (outra aba criou junto): tenta de novo', async () => {
    const { db, supabase } = seed();
    db.tables.reading_sessions!.length = 0;
    db.failures.set('reading_sessions.insert', { code: '23505', message: 'duplicate' });
    const out = await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: fieldsOf(),
    });
    expect(out.kind).toBe('ok');
    expect(db.log.filter((l) => l.op === 'insert')).toHaveLength(2);
  });

  it('capítulos de outra sessão: diz qual sessão e sugere a próxima faixa livre', async () => {
    const { supabase } = seed();
    const out = await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: fieldsOf({ chapterFrom: 11, chapterTo: 13 }),
    });
    expect(out).toEqual({
      kind: 'rejected',
      message: 'Os capítulos 11 a 12 já pertencem à sessão 5.',
      revert: { chapterFrom: 13, chapterTo: 15 },
    });
  });

  it('o book_id e o número enviados pelo cliente nunca são usados', async () => {
    const { db, supabase } = seed();
    db.tables.reading_sessions!.length = 0;
    const out = await saveSession(supabase, {
      sessionId: null,
      expectedUpdatedAt: null,
      fields: { ...fieldsOf(), book_id: 'outro', number: 99, status: 'published' },
    });
    expect(out.kind).toBe('rejected');
    expect(db.tables.reading_sessions).toHaveLength(0);
  });
});

describe('saveSession: atualizar', () => {
  it('grava, devolve o novo updated_at e só mexe nas colunas da lista', async () => {
    const { db, row, supabase } = seed();
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ title: 'Novo' }),
    });
    expect(out.kind).toBe('ok');
    if (out.kind !== 'ok') return;
    expect(out.updatedAt).not.toBe(T1);
    expect(db.tables.reading_sessions![0]).toMatchObject({
      title: 'Novo',
      status: 'draft',
      number: 5,
      book_id: BOOK,
    });
    const update = db.log.find((l) => l.op === 'update')!.payload as Record<string, unknown>;
    expect(Object.keys(update).sort()).toEqual(
      [
        'body',
        'chapter_from',
        'chapter_to',
        'comments_open',
        'excerpt',
        'rating',
        'read_minutes',
        'title',
        'visibility',
      ].sort(),
    );
    for (const forbidden of ['status', 'published_at', 'book_id', 'number', 'id']) {
      expect(update).not.toHaveProperty(forbidden);
    }
  });

  it('o status não muda por aqui, nem com campo escondido no payload', async () => {
    const { db, row, supabase } = seed();
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: { ...fieldsOf(), status: 'published', published_at: '2026-01-01' },
    });
    expect(out.kind).toBe('rejected');
    expect(db.tables.reading_sessions![0]!.status).toBe('draft');
    expect(db.log.some((l) => l.op === 'update')).toBe(false);
  });

  it('o token é texto: microssegundos diferentes (que o Date confunde) dão conflito', async () => {
    expect(new Date(T1).getTime()).toBe(new Date(T2).getTime());
    const { db, row, supabase } = seed({ updatedAt: T2 });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out.kind).toBe('conflict');
    expect(db.log.some((l) => l.op === 'update')).toBe(false);
    if (out.kind === 'conflict') expect(out.server.updatedAt).toBe(T2);
  });

  it('token igual: grava. Depois, o token antigo conflita', async () => {
    const { row, supabase } = seed();
    const first = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(first.kind).toBe('ok');
    const stale = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ title: 'B' }),
    });
    expect(stale.kind).toBe('conflict');
  });

  it('conflito devolve a versão do servidor para o banner', async () => {
    const { row, supabase } = seed({ updatedAt: T2 });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out).toMatchObject({
      kind: 'conflict',
      server: { updatedAt: T2, snapshot: { title: 'Antigo' } },
    });
  });

  it('alguém grava entre a leitura e a gravação: conflito, não sobrescrita', async () => {
    const { db, row } = seed();
    const base = db.client();
    const supabase = {
      ...base,
      from: (table: string) => {
        const query = (
          base.from as unknown as (t: string) => Record<string, (...a: unknown[]) => unknown>
        )(table);
        if (table !== 'reading_sessions') return query;
        const update = query.update!.bind(query);
        query.update = (payload: unknown) => {
          db.tables.reading_sessions![0]!.updated_at = T2;
          return update(payload);
        };
        return query;
      },
    } as never;
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out.kind).toBe('conflict');
    expect(db.tables.reading_sessions![0]!.title).toBe('Antigo');
  });

  it('sessão apagada em outro lugar', async () => {
    const { db, row, supabase } = seed();
    db.tables.reading_sessions!.length = 0;
    expect(
      await saveSession(supabase, { sessionId: row.id, expectedUpdatedAt: T1, fields: fieldsOf() }),
    ).toEqual({ kind: 'not_found' });
  });

  it('capítulos de outra sessão: mensagem com o número e a faixa antiga de volta', async () => {
    const { db, row, supabase } = seed();
    db.tables.reading_sessions!.push({
      ...row,
      id: '20000000-0000-4000-8000-000000000002',
      number: 4,
      chapter_from: 7,
      chapter_to: 9,
    });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ chapterFrom: 8, chapterTo: 12 }),
    });
    expect(out).toEqual({
      kind: 'rejected',
      message: 'Os capítulos 8 a 9 já pertencem à sessão 4.',
      revert: { chapterFrom: 10, chapterTo: 12 },
    });
    expect(db.tables.reading_sessions!.find((r) => r.id === row.id)!.chapter_from).toBe(10);
  });

  it('corpo inválido (nó desconhecido) é recusado com mensagem em pt-BR', async () => {
    const { row, supabase } = seed();
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: { type: 'doc', content: [{ type: 'image' }] } as never }),
    });
    expect(out).toMatchObject({ kind: 'rejected' });
    expect((out as { message: string }).message).toContain('editor não aceita');
  });

  it('rascunho aceita aviso (divisor fora da faixa) e corpo vazio; grava minutos de leitura', async () => {
    const { db, row, supabase } = seed();
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc(divider(30), divider(20)) }),
    });
    expect(out.kind).toBe('ok');
    expect(db.tables.reading_sessions![0]!.read_minutes).toBe(1);
  });

  it('erro inesperado do banco: "failed", log sem a mensagem do erro', async () => {
    const { db, row, supabase } = seed();
    db.failures.set('reading_sessions.update', {
      code: 'XX000',
      message: 'detalhe com maria@exemplo.com',
    });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out.kind).toBe('failed');
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).not.toContain('maria@exemplo.com');
    expect(logged).toContain('XX000');
  });
});

describe('sessão publicada: o que o público lê precisa estar em ordem', () => {
  it('corpo vazio é recusado', async () => {
    const { row, supabase } = seed({ status: 'published' });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc() }),
    });
    expect(out).toEqual({ kind: 'rejected', message: 'Escreva o relato antes de publicar.' });
  });

  it('título vazio é recusado', async () => {
    const { row, supabase } = seed({ status: 'published' });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ title: ' ' }),
    });
    expect(out).toEqual({ kind: 'rejected', message: 'Dê um título para a sessão.' });
  });

  it('divisor fora de ordem ou fora da faixa é recusado', async () => {
    const { row, supabase } = seed({ status: 'published' });
    const order = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc(p('a'), divider(11), divider(10)) }),
    });
    expect(order).toMatchObject({ kind: 'rejected' });
    const range = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc(p('a'), divider(13)) }),
    });
    expect(range).toMatchObject({ kind: 'rejected' });
  });

  it('capítulo da faixa sem divisor é só aviso: grava e devolve status published', async () => {
    const { row, supabase } = seed({ status: 'published' });
    const out = await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc(p('a'), divider(10)) }),
    });
    expect(out).toMatchObject({ kind: 'ok', status: 'published' });
  });

  it('contentProblem em si', () => {
    expect(
      contentProblem({ title: 'x', chapterFrom: 1, chapterTo: 3 }, doc(p('oi'), divider(1))),
    ).toBeNull();
  });
});

describe('resumo (excerpt)', () => {
  it('vazio = automático; rascunho guarda só o que a pessoa escreveu', async () => {
    const { db, row, supabase } = seed();
    await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ excerpt: '' }),
    });
    expect(db.tables.reading_sessions![0]!.excerpt).toBeNull();
  });

  it('resolveExcerpt: vazio, automático acompanhando o corpo e manual preservado', () => {
    const oldDoc = doc(p('Texto antigo.'));
    const newDoc = doc(p('Texto novo.'));
    expect(resolveExcerpt('', newDoc, null)).toBe('Texto novo.');
    expect(resolveExcerpt('Texto antigo.', newDoc, { doc: oldDoc, excerpt: 'Texto antigo.' })).toBe(
      'Texto novo.',
    );
    expect(resolveExcerpt('Meu resumo.', newDoc, { doc: oldDoc, excerpt: 'Meu resumo.' })).toBe(
      'Meu resumo.',
    );
    expect(resolveExcerpt('   ', doc(), null)).toBeNull();
  });

  it('sessão no ar: o resumo automático acompanha o texto editado', async () => {
    const { db, row, supabase } = seed({ status: 'published' });
    db.tables.reading_sessions![0]!.excerpt = autoExcerpt(
      db.tables.reading_sessions![0]!.body as BodyDoc,
    );
    await saveSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ body: doc(p('Primeiro parágrafo novo.'), divider(10)), excerpt: '' }),
    });
    expect(db.tables.reading_sessions![0]!.excerpt).toBe('Primeiro parágrafo novo.');
  });

  it('o resumo guardado igual ao automático volta como campo vazio', () => {
    const { row } = seed();
    const withAuto = { ...row, excerpt: 'Antigo texto.' };
    expect(rowToSnapshot(withAuto as never)?.excerpt).toBe('');
    expect(rowToSnapshot({ ...row, excerpt: 'Meu' } as never)?.excerpt).toBe('Meu');
  });

  it('corpo ilegível no banco: nada de snapshot', () => {
    const { row } = seed();
    expect(
      rowToSnapshot({ ...row, body: { type: 'doc', content: [{ type: 'image' }] } } as never),
    ).toBeNull();
  });
});

describe('publishSession', () => {
  it('salva o conteúdo, depois chama a função do banco', async () => {
    const { db, row, supabase } = seed();
    db.rpcHandlers.set('publish_session', () => ({ data: { number: 5 }, error: null }));
    const out = await publishSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out).toEqual({ kind: 'published', number: 5 });
    const ops = db.log.map((l) => `${l.table}.${l.op}`);
    expect(ops.indexOf('reading_sessions.update')).toBeLessThan(ops.indexOf('rpc.publish_session'));
    expect(db.tables.reading_sessions![0]!.excerpt).toBe('Abertura.');
  });

  it('chapter_to acima do total do livro: bloqueia ANTES da função, com atalho para o livro', async () => {
    const { db, row, supabase } = seed();
    db.tables.books![0]!.total_chapters = 12;
    const out = await publishSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf({ chapterFrom: 10, chapterTo: 14 }),
    });
    expect(out).toEqual({
      kind: 'rejected',
      message: 'O livro tem 12 capítulos e esta sessão vai até o 14. Corrija o total do livro.',
      fixTotalBookId: BOOK,
    });
    expect(db.log.some((l) => l.table === 'rpc')).toBe(false);
    expect(db.log.some((l) => l.op === 'update')).toBe(false);
    expect(db.tables.reading_sessions![0]!.title).toBe('Antigo');
  });

  it('título, texto vazio e divisores também bloqueiam (sem chamar a função)', async () => {
    const { db, row, supabase } = seed();
    for (const over of [{ title: '' }, { body: doc() }, { body: doc(divider(11), divider(10)) }]) {
      const out = await publishSession(supabase, {
        sessionId: row.id,
        expectedUpdatedAt: T1,
        fields: fieldsOf(over),
      });
      expect(out.kind).toBe('rejected');
    }
    expect(db.log.some((l) => l.table === 'rpc')).toBe(false);
  });

  it('conflito de token: não publica', async () => {
    const { db, row, supabase } = seed({ updatedAt: T2 });
    const out = await publishSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out.kind).toBe('conflict');
    expect(db.log.some((l) => l.table === 'rpc')).toBe(false);
  });

  it.each([
    [
      { code: 'PGRST202', message: 'Could not find the function' },
      'Falta aplicar a atualização do banco',
    ],
    [{ code: '42883', message: 'function does not exist' }, 'Falta aplicar a atualização do banco'],
    [
      { code: 'P0001', message: 'invalid_state: only a draft can be published' },
      'já mudou de estado',
    ],
    [
      { code: '42501', message: 'not_admin: only the administrator can publish a session' },
      'Só a administração',
    ],
    [
      { code: '23514', message: 'chapter_beyond_total: the session goes past' },
      'total de capítulos',
    ],
  ])('erro da função %j vira pt-BR', async (error, text) => {
    const { db, row, supabase } = seed();
    db.rpcHandlers.set('publish_session', () => ({ data: null, error }));
    const out = await publishSession(supabase, {
      sessionId: row.id,
      expectedUpdatedAt: T1,
      fields: fieldsOf(),
    });
    expect(out).toMatchObject({ kind: 'rejected' });
    expect((out as { message: string }).message).toContain(text);
  });
});

describe('unpublishSession e deleteDraftSession', () => {
  it('voltar para rascunho: ok e erros mapeados', async () => {
    const { db, row, supabase } = seed({ status: 'published' });
    expect(await unpublishSession(supabase, row.id)).toEqual({ ok: true });
    db.rpcHandlers.set('unpublish_session', () => ({
      data: null,
      error: {
        code: 'P0001',
        message: 'session_has_comments: a session with comments cannot go back to draft',
      },
    }));
    const refused = await unpublishSession(supabase, row.id);
    expect(refused).toEqual({ ok: false, message: SESSION_MESSAGES.session_has_comments });
    expect(SESSION_MESSAGES.session_has_comments).toContain('Os já removidos não impedem');
    db.rpcHandlers.set('unpublish_session', () => ({
      data: null,
      error: { code: 'PGRST202', message: 'x' },
    }));
    expect(await unpublishSession(supabase, row.id)).toEqual({
      ok: false,
      message: SESSION_MESSAGES.migration_pending,
    });
  });

  it('exclui rascunho e leva notas e perguntas junto (cascata do banco)', async () => {
    const { db, row, supabase } = seed();
    expect(await deleteDraftSession(supabase, row.id)).toEqual({ ok: true });
    expect(db.tables.reading_sessions).toHaveLength(0);
  });

  it('nunca exclui sessão publicada', async () => {
    const { db, row, supabase } = seed({ status: 'published' });
    const out = await deleteDraftSession(supabase, row.id);
    expect(out).toMatchObject({ ok: false });
    expect(db.tables.reading_sessions).toHaveLength(1);
    // O filtro `status = 'draft'` vai na própria instrução de exclusão.
    expect(db.log.find((l) => l.op === 'delete')).toBeTruthy();
  });

  it('rascunho com comentários (FK) vira mensagem em pt-BR', async () => {
    const { db, row, supabase } = seed();
    db.tables.comments!.push({ id: 'c1', session_id: row.id });
    const out = await deleteDraftSession(supabase, row.id);
    expect(out).toEqual({ ok: false, message: SESSION_MESSAGES.has_comments });
  });
});

describe('trechos, anotações e perguntas', () => {
  const SESSION = '20000000-0000-4000-8000-000000000001';

  it('adiciona no fim, na ordem', async () => {
    const { supabase } = seed();
    const a = await addNote(supabase, SESSION, {
      kind: 'quote',
      text: ' Um trecho. ',
      reference: 'Cap. 10, p. 162',
    });
    const b = await addNote(supabase, SESSION, {
      kind: 'note',
      text: 'Minha anotação',
      reference: '',
    });
    expect(a).toMatchObject({
      ok: true,
      item: { kind: 'quote', text: 'Um trecho.', reference: 'Cap. 10, p. 162', position: 0 },
    });
    expect(b).toMatchObject({ ok: true, item: { kind: 'note', reference: '', position: 1 } });
  });

  it.each([
    [{ kind: 'quote', text: '', reference: '' }],
    [{ kind: 'quote', text: 'a'.repeat(4001), reference: '' }],
    [{ kind: 'quote', text: 'x', reference: 'a'.repeat(201) }],
    [{ kind: 'poema', text: 'x', reference: '' }],
    [{ kind: 'quote', text: 'x', reference: '', position: 3 }],
  ])('recusa %j', async (input) => {
    const { db, supabase } = seed();
    const out = await addNote(supabase, SESSION, input);
    expect(out.ok).toBe(false);
    expect(db.tables.session_notes).toHaveLength(0);
  });

  it('aceita o limite de 4000 caracteres e 200 de referência', async () => {
    const { supabase } = seed();
    const out = await addNote(supabase, SESSION, {
      kind: 'note',
      text: 'a'.repeat(4000),
      reference: 'r'.repeat(200),
    });
    expect(out.ok).toBe(true);
  });

  it('edita e remove', async () => {
    const { db, supabase } = seed();
    const added = await addNote(supabase, SESSION, { kind: 'quote', text: 'a', reference: '' });
    if (!added.ok) throw new Error('add');
    const edited = await updateNote(supabase, added.item.id, {
      kind: 'note',
      text: 'b',
      reference: 'p. 3',
    });
    expect(edited).toMatchObject({
      ok: true,
      item: { kind: 'note', text: 'b', reference: 'p. 3' },
    });
    expect(await removeNote(supabase, added.item.id)).toEqual({ ok: true });
    expect(db.tables.session_notes).toHaveLength(0);
    expect(
      (await updateNote(supabase, added.item.id, { kind: 'note', text: 'b', reference: '' })).ok,
    ).toBe(false);
  });

  it('reordena com a lista completa de ids', async () => {
    const { supabase } = seed();
    const ids: string[] = [];
    for (const text of ['um', 'dois', 'três']) {
      const r = await addNote(supabase, SESSION, { kind: 'quote', text, reference: '' });
      if (r.ok) ids.push(r.item.id);
    }
    const out = await reorderNotes(supabase, SESSION, [ids[2], ids[0], ids[1]]);
    expect(out).toMatchObject({ ok: true });
    if (out.ok) expect(out.items.map((i) => i.text)).toEqual(['três', 'um', 'dois']);
  });

  it.each([
    ['faltando um id', (ids: string[]) => ids.slice(1)],
    ['id repetido', (ids: string[]) => [ids[0], ids[0], ids[1]]],
    ['id de fora', (ids: string[]) => [ids[0], ids[1], '30000000-0000-4000-8000-000000000009']],
    ['não é lista de uuid', () => ['a', 'b', 'c']],
  ])('reordenar recusa %s', async (_label, build) => {
    const { db, supabase } = seed();
    const ids: string[] = [];
    for (const text of ['um', 'dois', 'três']) {
      const r = await addNote(supabase, SESSION, { kind: 'quote', text, reference: '' });
      if (r.ok) ids.push(r.item.id);
    }
    const before = db.tables.session_notes!.map((n) => n.position);
    const out = await reorderNotes(supabase, SESSION, build(ids));
    expect(out.ok).toBe(false);
    expect(db.tables.session_notes!.map((n) => n.position)).toEqual(before);
  });

  it('perguntas: limite de 1000, ordem e edição', async () => {
    const { supabase } = seed();
    expect((await addQuestion(supabase, SESSION, { text: 'a'.repeat(1001) })).ok).toBe(false);
    expect((await addQuestion(supabase, SESSION, { text: '  ' })).ok).toBe(false);
    const a = await addQuestion(supabase, SESSION, { text: 'Primeira?' });
    const b = await addQuestion(supabase, SESSION, { text: 'Segunda?' });
    if (!a.ok || !b.ok) throw new Error('add');
    expect(b.item.position).toBe(1);
    const moved = await reorderQuestions(supabase, SESSION, [b.item.id, a.item.id]);
    if (moved.ok) expect(moved.items.map((q) => q.text)).toEqual(['Segunda?', 'Primeira?']);
    expect(await updateQuestion(supabase, a.item.id, { text: 'Mudou?' })).toMatchObject({
      ok: true,
      item: { text: 'Mudou?' },
    });
  });

  it('sessão com id que não é uuid é recusada sem consultar o banco', async () => {
    const { db, supabase } = seed();
    expect((await addNote(supabase, 'abc', { kind: 'quote', text: 'x', reference: '' })).ok).toBe(
      false,
    );
    expect(db.log).toHaveLength(0);
  });

  it('adicionar item não toca a linha da sessão (o token do editor continua valendo)', async () => {
    const { db, supabase } = seed();
    await addNote(supabase, SESSION, { kind: 'quote', text: 'x', reference: '' });
    await addQuestion(supabase, SESSION, { text: 'y?' });
    expect(db.tables.reading_sessions![0]!.updated_at).toBe(T1);
  });
});
