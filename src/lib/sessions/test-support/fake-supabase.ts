import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase/database.types';

/*
 * Um Supabase falso, em memória, só para testar as regras de `service.ts` e `items.ts`: filtros
 * `eq/neq/lte/gte`, ordem, limite, insert/update/upsert/delete com `select()`, e as duas
 * restrições que importam (número único por livro e capítulos sem sobreposição). `updated_at` é
 * texto com microssegundos e muda a cada gravação, como o trigger do banco. Não é o PostgREST:
 * a prova de verdade é o teste no Supabase local descrito no PR.
 */

type Row = Record<string, unknown>;
type DbError = { code: string; message: string } | null;

export class FakeDb {
  tables: Record<string, Row[]> = {
    books: [],
    reading_sessions: [],
    session_notes: [],
    session_questions: [],
    comments: [],
  };
  /** Erro para devolver na próxima operação `tabela.op` (consome ao usar). */
  failures = new Map<string, DbError>();
  log: { table: string; op: string; payload?: unknown }[] = [];
  rpcHandlers = new Map<string, (args: Row) => { data: unknown; error: DbError }>();
  private clock = 0;
  private ids = 0;

  /** Texto no formato do PostgREST, com microssegundos que o Date não distingue. */
  tick(): string {
    this.clock += 1;
    return `2026-10-01T12:00:00.${String(this.clock).padStart(6, '0')}+00:00`;
  }

  newId(): string {
    this.ids += 1;
    return `00000000-0000-4000-8000-${String(this.ids).padStart(12, '0')}`;
  }

  insertRow(table: string, row: Row): Row {
    const full: Row = {
      id: this.newId(),
      created_at: this.tick(),
      updated_at: this.tick(),
      ...row,
    };
    this.tables[table]!.push(full);
    return full;
  }

  client(): SupabaseClient<Database> {
    return {
      from: (table: string) => new Query(this, table),
      rpc: async (name: string, args: Row) => {
        this.log.push({ table: 'rpc', op: name, payload: args });
        const handler = this.rpcHandlers.get(name);
        return handler ? handler(args) : { data: null, error: null };
      },
    } as unknown as SupabaseClient<Database>;
  }

  /** Restrições do banco para `reading_sessions`. */
  checkSessionConstraints(candidate: Row, ignoreId?: unknown): DbError {
    const others = this.tables.reading_sessions!.filter(
      (r) => r.book_id === candidate.book_id && r.id !== ignoreId,
    );
    if (others.some((r) => r.number === candidate.number)) {
      return { code: '23505', message: 'duplicate key value violates unique constraint' };
    }
    const from = candidate.chapter_from as number;
    const to = candidate.chapter_to as number;
    if (others.some((r) => (r.chapter_from as number) <= to && (r.chapter_to as number) >= from)) {
      return { code: '23P01', message: 'conflicting key value violates exclusion constraint' };
    }
    return null;
  }
}

type QueryResult = { data: unknown; error: DbError; count?: number | null };

type Filter = { column: string; op: 'eq' | 'neq' | 'lte' | 'gte'; value: unknown };

class Query {
  private filters: Filter[] = [];
  private action: 'select' | 'insert' | 'update' | 'delete' | 'upsert' = 'select';
  private payload: Row | Row[] | null = null;
  private ordering: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private wantsRows = false;
  private mode: 'many' | 'maybe' | 'single' = 'many';
  private head = false;

  constructor(
    private readonly db: FakeDb,
    private readonly table: string,
  ) {}

  select(_columns?: string, options?: { head?: boolean; count?: string }) {
    this.wantsRows = true;
    this.head = options?.head === true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.action = 'insert';
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.action = 'update';
    this.payload = payload;
    return this;
  }
  upsert(payload: Row | Row[]) {
    this.action = 'upsert';
    this.payload = payload;
    return this;
  }
  delete() {
    this.action = 'delete';
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, op: 'eq', value });
    return this;
  }
  neq(column: string, value: unknown) {
    this.filters.push({ column, op: 'neq', value });
    return this;
  }
  lte(column: string, value: unknown) {
    this.filters.push({ column, op: 'lte', value });
    return this;
  }
  gte(column: string, value: unknown) {
    this.filters.push({ column, op: 'gte', value });
    return this;
  }
  order(column: string, options?: { ascending?: boolean }) {
    this.ordering = { column, ascending: options?.ascending ?? true };
    return this;
  }
  limit(n: number) {
    this.max = n;
    return this;
  }
  maybeSingle() {
    this.mode = 'maybe';
    return this;
  }
  single() {
    this.mode = 'single';
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every(({ column, op, value }) => {
      const cell = row[column];
      switch (op) {
        case 'eq':
          return cell === value;
        case 'neq':
          return cell !== value;
        case 'lte':
          return (cell as number) <= (value as number);
        case 'gte':
          return (cell as number) >= (value as number);
      }
    });
  }

  then<R1 = QueryResult, R2 = never>(
    resolve?: ((value: QueryResult) => R1 | PromiseLike<R1>) | null,
    reject?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
  ): Promise<R1 | R2> {
    return Promise.resolve(this.run()).then(resolve, reject);
  }

  private run(): QueryResult {
    const { db, table } = this;
    db.log.push({ table, op: this.action, payload: this.payload ?? undefined });
    const failureKey = `${table}.${this.action}`;
    if (db.failures.has(failureKey)) {
      const error = db.failures.get(failureKey)!;
      db.failures.delete(failureKey);
      return { data: null, error };
    }
    const rows = db.tables[table]!;

    let affected: Row[] = [];
    if (this.action === 'select') {
      affected = rows.filter((r) => this.matches(r));
    } else if (this.action === 'insert') {
      for (const item of [this.payload].flat() as Row[]) {
        if (table === 'reading_sessions') {
          const error = db.checkSessionConstraints(item);
          if (error) return { data: null, error };
        }
        affected.push(db.insertRow(table, item));
      }
    } else if (this.action === 'update') {
      for (const row of rows.filter((r) => this.matches(r))) {
        const next = { ...row, ...(this.payload as Row) };
        if (table === 'reading_sessions') {
          const error = db.checkSessionConstraints(next, row.id);
          if (error) return { data: null, error };
        }
        Object.assign(row, next, { updated_at: db.tick() });
        affected.push(row);
      }
    } else if (this.action === 'upsert') {
      for (const item of [this.payload].flat() as Row[]) {
        const existing = rows.find((r) => r.id === item.id);
        if (existing) {
          Object.assign(existing, item, { updated_at: db.tick() });
          affected.push(existing);
        } else affected.push(db.insertRow(table, item));
      }
    } else if (this.action === 'delete') {
      const doomed = rows.filter((r) => this.matches(r));
      if (table === 'reading_sessions') {
        const hasComments = doomed.find((r) =>
          db.tables.comments!.some((c) => c.session_id === r.id),
        );
        if (hasComments) {
          return {
            data: null,
            error: { code: '23503', message: 'violates foreign key constraint' },
          };
        }
      }
      db.tables[table] = rows.filter((r) => !doomed.includes(r));
      affected = doomed;
    }

    if (this.ordering) {
      const { column, ascending } = this.ordering;
      affected = [...affected].sort((a, b) => {
        const x = a[column] as number | string;
        const y = b[column] as number | string;
        return (x < y ? -1 : x > y ? 1 : 0) * (ascending ? 1 : -1);
      });
    }
    if (this.max !== null) affected = affected.slice(0, this.max);
    const copy = affected.map((r) => ({ ...r }));

    if (this.head) return { data: null, error: null, count: copy.length };
    if (this.mode === 'many')
      return { data: this.wantsRows || this.action === 'select' ? copy : null, error: null };
    if (this.mode === 'maybe') return { data: copy[0] ?? null, error: null };
    return copy[0]
      ? { data: copy[0], error: null }
      : { data: null, error: { code: 'PGRST116', message: 'no rows' } };
  }
}
