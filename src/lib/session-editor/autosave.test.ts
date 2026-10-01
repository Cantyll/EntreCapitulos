import { describe, expect, it, vi } from 'vitest';

import type { BodyDoc } from '@/lib/session-body';

import {
  AutosaveController,
  DEBOUNCE_MS,
  decideRestore,
  RETRY_DELAYS_MS,
  statusLabel,
  type AutosaveDeps,
  type LocalRecord,
  type SaveRequest,
  type SaveResult,
} from './autosave';
import { sameToken, snapshotKey, type SessionSnapshot } from './snapshot';

const body = (text: string): BodyDoc => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

const base: SessionSnapshot = {
  title: 'Título',
  body: body('um'),
  chapterFrom: 10,
  chapterTo: 12,
  visibility: 'public',
  commentsOpen: true,
  rating: null,
  excerpt: '',
};
const withBody = (text: string, extra: Partial<SessionSnapshot> = {}): SessionSnapshot => ({
  ...base,
  body: body(text),
  ...extra,
});

/** Relógio falso: `advance(ms)` dispara, em ordem, os timers vencidos. */
function fakeScheduler() {
  let now = 0;
  let nextId = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    scheduler: {
      set(fn: () => void, ms: number) {
        const id = nextId++;
        timers.set(id, { at: now + ms, fn });
        return id;
      },
      clear(handle: unknown) {
        timers.delete(handle as number);
      },
    },
    async advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers.entries()]
          .filter(([, t]) => t.at <= end)
          .sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        timers.delete(due[0]);
        now = due[1].at;
        due[1].fn();
        await settle();
      }
      now = end;
    },
    pending: () => timers.size,
  };
}

const settle = async (ticks = 10) => {
  for (let i = 0; i < ticks; i++) await Promise.resolve();
};

function setup(options: Partial<AutosaveDeps> & { results?: SaveResult[] } = {}) {
  const clock = fakeScheduler();
  const calls: SaveRequest[] = [];
  const results = [...(options.results ?? [])];
  let counter = 0;
  const transport = vi.fn(async (request: SaveRequest): Promise<SaveResult> => {
    calls.push(request);
    const next = results.shift();
    if (next) return next;
    counter += 1;
    return {
      kind: 'ok',
      updatedAt: `2026-10-01T12:00:00.${String(counter).padStart(6, '0')}+00:00`,
      sessionId: request.sessionId ?? 'novo-id',
    };
  });
  const records: (LocalRecord | 'remove')[] = [];
  const local = {
    write: vi.fn(async (r: LocalRecord) => void records.push(r)),
    remove: vi.fn(async () => void records.push('remove')),
  };
  const controller = new AutosaveController({
    initial: { snapshot: base, token: '2026-10-01T12:00:00.000000+00:00', sessionId: 'sess-1' },
    mode: 'draft',
    transport,
    local,
    scheduler: clock.scheduler,
    ...options,
  });
  return { controller, clock, calls, transport, local, records };
}

describe('estado inicial', () => {
  it('sessão que já existe abre como salva; a nova abre como "rascunho novo"', () => {
    expect(setup().controller.getState().status).toBe('saved');
    const fresh = setup({ initial: { snapshot: base, token: null, sessionId: null } });
    expect(fresh.controller.getState().status).toBe('idle');
  });
});

describe('debounce do rascunho', () => {
  it('só envia 2 s depois da última alteração', async () => {
    const { controller, clock, calls } = setup();
    controller.edit(withBody('a'));
    await clock.advance(1500);
    controller.edit(withBody('ab'));
    await clock.advance(1500);
    expect(calls).toHaveLength(0);
    await clock.advance(DEBOUNCE_MS - 1500);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.snapshot.body).toEqual(body('ab'));
  });

  it('manda o token do servidor e guarda o novo', async () => {
    const { controller, clock, calls } = setup();
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]!.expectedUpdatedAt).toBe('2026-10-01T12:00:00.000000+00:00');
    expect(controller.getState().token).toBe('2026-10-01T12:00:00.000001+00:00');
    controller.edit(withBody('ab'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls[1]!.expectedUpdatedAt).toBe('2026-10-01T12:00:00.000001+00:00');
  });

  it('status: dirty → saving → saved', async () => {
    const { controller, clock } = setup();
    const seen: string[] = [];
    controller.subscribe((s) => seen.push(s.status));
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(seen).toEqual(['dirty', 'saving', 'saved']);
    expect(controller.getState().dirty).toBe(false);
  });

  it('voltar ao texto salvo cancela o envio', async () => {
    const { controller, clock, calls, records } = setup();
    controller.edit(withBody('a'));
    controller.edit(base);
    await clock.advance(DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(0);
    expect(records.at(-1)).toBe('remove');
  });

  it('alteração igual não faz nada', async () => {
    const { controller, records } = setup();
    controller.edit({ ...base });
    expect(records).toHaveLength(0);
  });

  it('edita durante o envio: manda de novo depois, com o token novo', async () => {
    let release!: (r: SaveResult) => void;
    const first = new Promise<SaveResult>((resolve) => (release = resolve));
    const { controller, clock, calls, transport } = setup();
    transport.mockImplementationOnce(async (r) => {
      calls.push(r);
      return first;
    });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(controller.getState().status).toBe('saving');
    controller.edit(withBody('ab'));
    release({ kind: 'ok', updatedAt: 'T1', sessionId: 'sess-1' });
    await settle();
    expect(controller.getState().dirty).toBe(true);
    expect(controller.getState().status).toBe('dirty');
    await clock.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.expectedUpdatedAt).toBe('T1');
    expect(calls[1]!.snapshot.body).toEqual(body('ab'));
  });

  it('nunca há duas gravações ao mesmo tempo', async () => {
    let active = 0;
    let max = 0;
    const { controller, clock, transport } = setup();
    transport.mockImplementation(async (r) => {
      active++;
      max = Math.max(max, active);
      await settle();
      active--;
      return { kind: 'ok', updatedAt: `T${Math.random()}`, sessionId: r.sessionId ?? 'x' };
    });
    controller.edit(withBody('a'));
    void controller.flush();
    controller.edit(withBody('ab'));
    void controller.flush();
    await clock.advance(DEBOUNCE_MS * 3);
    await settle(100);
    expect(max).toBe(1);
    expect(controller.getState().dirty).toBe(false);
  });
});

describe('ir para segundo plano', () => {
  it('envia na hora, sem esperar o debounce', async () => {
    const { controller, calls } = setup();
    controller.edit(withBody('a'));
    await controller.onBackground();
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('saved');
  });

  it('o timer do debounce não manda de novo depois do envio imediato', async () => {
    const { controller, clock, calls } = setup();
    controller.edit(withBody('a'));
    await controller.onBackground();
    await clock.advance(DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(1);
  });

  it('sem alteração, não envia', async () => {
    const { controller, calls } = setup();
    await controller.onBackground();
    expect(calls).toHaveLength(0);
  });

  it('a cópia local já foi gravada antes do envio terminar', async () => {
    const { controller, records, transport } = setup();
    transport.mockImplementation(() => new Promise(() => {}));
    controller.edit(withBody('a'));
    void controller.onBackground();
    await settle();
    expect(records[0]).toEqual({
      baseUpdatedAt: '2026-10-01T12:00:00.000000+00:00',
      snapshot: withBody('a'),
      dirty: true,
    });
  });
});

describe('cópia local (IndexedDB)', () => {
  it('grava a cada alteração e apaga quando o servidor confirma', async () => {
    const { controller, clock, records } = setup();
    controller.edit(withBody('a'));
    await settle();
    controller.edit(withBody('ab'));
    await settle();
    expect(records.filter((r) => r !== 'remove')).toHaveLength(2);
    await clock.advance(DEBOUNCE_MS);
    expect(records.at(-1)).toBe('remove');
  });

  it('IndexedDB falhando não derruba o salvamento no servidor', async () => {
    const { controller, clock, local, calls } = setup();
    local.write.mockRejectedValue(new Error('quota'));
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('saved');
  });

  it('escritas locais em sequência não se atropelam: a última vence', async () => {
    const { controller, local, records } = setup();
    local.write.mockImplementation(async (r) => {
      await settle();
      records.push(r);
    });
    controller.edit(withBody('a'));
    controller.edit(withBody('ab'));
    controller.edit(withBody('abc'));
    await settle(100);
    const last = records.at(-1) as LocalRecord;
    expect(last.snapshot.body).toEqual(body('abc'));
  });
});

describe('sem conexão', () => {
  it('rede falhando: fica no aparelho e tenta de novo com intervalo crescente', async () => {
    const { controller, clock, calls } = setup({
      results: [{ kind: 'network' }, { kind: 'network' }],
    });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(controller.getState().status).toBe('offline');
    expect(statusLabel(controller.getState())).toBe('Sem conexão: salvo só neste aparelho');
    expect(calls).toHaveLength(1);
    await clock.advance(RETRY_DELAYS_MS[0]!);
    expect(calls).toHaveLength(2);
    await clock.advance(RETRY_DELAYS_MS[1]! - 1);
    expect(calls).toHaveLength(2);
    await clock.advance(1);
    expect(calls).toHaveLength(3);
    expect(controller.getState().status).toBe('saved');
  });

  it('exceção do transporte conta como rede', async () => {
    const { controller, clock, transport } = setup();
    transport.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(controller.getState().status).toBe('offline');
  });

  it('o intervalo para de crescer no limite', async () => {
    const { controller, clock, calls } = setup({
      results: Array.from({ length: 8 }, () => ({ kind: 'network' as const })),
    });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    for (const delay of [2000, 5000, 15_000, 30_000, 30_000, 30_000]) {
      const before = calls.length;
      await clock.advance(delay - 1);
      expect(calls.length).toBe(before);
      await clock.advance(1);
      expect(calls.length).toBe(before + 1);
    }
  });

  it('offline do navegador: não envia e marca o aviso; ao voltar, envia sozinho', async () => {
    const { controller, clock, calls } = setup();
    controller.setOnline(false);
    controller.edit(withBody('a'));
    expect(controller.getState().status).toBe('offline');
    await clock.advance(DEBOUNCE_MS * 3);
    expect(calls).toHaveLength(0);
    controller.edit(withBody('ab'));
    expect(controller.getState().status).toBe('offline');
    controller.setOnline(true);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.snapshot.body).toEqual(body('ab'));
    expect(controller.getState().status).toBe('saved');
  });

  it('só o último conteúdo vai para o servidor (sem fila de versões)', async () => {
    const { controller, clock, calls } = setup();
    controller.setOnline(false);
    for (const t of ['a', 'ab', 'abc']) controller.edit(withBody(t));
    await clock.advance(DEBOUNCE_MS);
    controller.setOnline(true);
    await settle();
    expect(calls).toHaveLength(1);
    expect(calls[0]!.snapshot.body).toEqual(body('abc'));
  });

  it('erro inesperado do servidor também tenta de novo, mas mostra "Erro ao salvar"', async () => {
    const { controller, clock, calls } = setup({ results: [{ kind: 'failed' }] });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    expect(statusLabel(controller.getState())).toBe('Erro ao salvar');
    await clock.advance(RETRY_DELAYS_MS[0]!);
    expect(calls).toHaveLength(2);
    expect(controller.getState().status).toBe('saved');
  });
});

describe('conflito de concorrência', () => {
  const serverSnapshot = withBody('servidor');
  const conflict: SaveResult = {
    kind: 'conflict',
    server: { updatedAt: 'T-servidor', snapshot: serverSnapshot },
  };

  it('para de enviar e guarda a versão do servidor', async () => {
    const { controller, clock, calls } = setup({ results: [conflict] });
    controller.edit(withBody('minha'));
    await clock.advance(DEBOUNCE_MS);
    const state = controller.getState();
    expect(state.status).toBe('conflict');
    expect(state.conflict?.updatedAt).toBe('T-servidor');
    controller.edit(withBody('minha 2'));
    await clock.advance(DEBOUNCE_MS * 5);
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('conflict');
  });

  it('"Carregar a versão do servidor" troca o conteúdo e apaga a cópia local', async () => {
    const { controller, clock, records } = setup({ results: [conflict] });
    controller.edit(withBody('minha'));
    await clock.advance(DEBOUNCE_MS);
    const revision = controller.getState().loadRevision;
    controller.acceptServerVersion();
    const state = controller.getState();
    expect(state.current).toEqual(serverSnapshot);
    expect(state.token).toBe('T-servidor');
    expect(state.dirty).toBe(false);
    expect(state.status).toBe('saved');
    expect(state.loadRevision).toBe(revision + 1);
    await settle();
    expect(records.at(-1)).toBe('remove');
  });

  it('"Sobrescrever com a minha" reenvia com o token do servidor', async () => {
    const { controller, clock, calls } = setup({ results: [conflict] });
    controller.edit(withBody('minha'));
    await clock.advance(DEBOUNCE_MS);
    await controller.overwriteWithMine();
    expect(calls).toHaveLength(2);
    expect(calls[1]!.expectedUpdatedAt).toBe('T-servidor');
    expect(calls[1]!.snapshot.body).toEqual(body('minha'));
    expect(controller.getState().status).toBe('saved');
    expect(controller.getState().conflict).toBeNull();
  });

  it('conflito descoberto fora do autosave (publicar) abre o mesmo banner', async () => {
    const { controller, clock, calls } = setup();
    controller.edit(withBody('minha'));
    controller.reportConflict({ updatedAt: 'T-servidor', snapshot: serverSnapshot });
    expect(controller.getState().status).toBe('conflict');
    await clock.advance(DEBOUNCE_MS * 3);
    expect(calls).toHaveLength(0);
    await controller.overwriteWithMine();
    expect(calls[0]!.expectedUpdatedAt).toBe('T-servidor');
  });

  it('markSaved: a publicação que gravou o texto mas falhou depois não gera conflito consigo mesma', async () => {
    const { controller, clock, calls } = setup();
    controller.edit(withBody('a'));
    controller.markSaved('T-publicar', withBody('a'));
    expect(controller.getState()).toMatchObject({
      token: 'T-publicar',
      dirty: false,
      status: 'saved',
    });
    controller.edit(withBody('ab'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]!.expectedUpdatedAt).toBe('T-publicar');
  });

  it('idle() espera o envio em andamento', async () => {
    let release!: () => void;
    const { controller, transport } = setup();
    transport.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ kind: 'ok', updatedAt: 'T9', sessionId: 'sess-1' });
        }),
    );
    controller.edit(withBody('a'));
    void controller.flush();
    let idle = false;
    void controller.idle().then(() => (idle = true));
    await settle();
    expect(idle).toBe(false);
    release();
    await settle(30);
    expect(idle).toBe(true);
    expect(controller.getState().token).toBe('T9');
  });

  it('sem conflito pendente, as duas escolhas não fazem nada', async () => {
    const { controller, calls } = setup();
    controller.acceptServerVersion();
    await controller.overwriteWithMine();
    expect(calls).toHaveLength(0);
  });
});

describe('recusa do servidor (faixa de capítulos)', () => {
  it('devolve a faixa anterior, mantém o resto e envia só o que sobrou', async () => {
    const { controller, clock, calls } = setup({
      results: [
        {
          kind: 'rejected',
          message: 'Os capítulos 10 a 12 já pertencem à sessão 4.',
          revert: { chapterFrom: 13, chapterTo: 15 },
        },
      ],
    });
    controller.edit(withBody('texto novo', { chapterFrom: 10, chapterTo: 12 }));
    const revision = controller.getState().loadRevision;
    await controller.flush();
    const state = controller.getState();
    expect(state.status).toBe('error');
    expect(state.message).toContain('já pertencem à sessão 4');
    expect(state.current.chapterFrom).toBe(13);
    expect(state.current.body).toEqual(body('texto novo'));
    expect(state.loadRevision).toBe(revision + 1);
    await clock.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
    expect(calls[1]!.snapshot.chapterFrom).toBe(13);
    expect(calls[1]!.snapshot.body).toEqual(body('texto novo'));
  });

  it('recusa sem correção não entra em laço: espera a próxima alteração', async () => {
    const { controller, clock, calls } = setup({
      results: [{ kind: 'rejected', message: 'Título vazio.' }],
    });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS * 5);
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('error');
    controller.edit(withBody('ab'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(2);
  });

  it('sessão apagada em outro lugar: erro claro, sem repetir', async () => {
    const { controller, clock, calls } = setup({ results: [{ kind: 'not_found' }] });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS * 5);
    expect(calls).toHaveLength(1);
    expect(controller.getState().message).toContain('não existe mais');
  });
});

describe('sessão publicada', () => {
  const published = () => setup({ mode: 'published' });

  it('nunca envia sozinha, nem pelo debounce, nem em segundo plano, nem ao voltar a rede', async () => {
    const { controller, clock, calls, records } = published();
    controller.edit(withBody('frase pela metade'));
    await clock.advance(DEBOUNCE_MS * 10);
    await controller.onBackground();
    await controller.flush();
    controller.setOnline(false);
    controller.setOnline(true);
    await settle();
    expect(calls).toHaveLength(0);
    expect(controller.getState().status).toBe('dirty');
    expect(statusLabel(controller.getState())).toBe('Alterações não salvas');
    // A edição continua indo para o IndexedDB.
    expect(records.some((r) => r !== 'remove' && r.dirty)).toBe(true);
  });

  it('"Salvar alterações" envia', async () => {
    const { controller, calls } = published();
    controller.edit(withBody('final'));
    await controller.saveNow();
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('saved');
    expect(statusLabel(controller.getState())).toBe('Salvo');
  });

  it('"Descartar alterações" volta ao servidor e apaga a cópia local', async () => {
    const { controller, records } = published();
    controller.edit(withBody('rascunho meu'));
    controller.discard();
    expect(controller.getState().current).toEqual(base);
    expect(controller.getState().dirty).toBe(false);
    expect(controller.getState().loadRevision).toBe(1);
    await settle();
    expect(records.at(-1)).toBe('remove');
  });

  it('falha de rede ao salvar não agenda tentativas sozinhas', async () => {
    const { controller, clock, calls } = setup({
      mode: 'published',
      results: [{ kind: 'network' }],
    });
    controller.edit(withBody('x'));
    await controller.saveNow();
    await clock.advance(120_000);
    expect(calls).toHaveLength(1);
    expect(controller.getState().status).toBe('offline');
    await controller.saveNow();
    expect(calls).toHaveLength(2);
  });

  it('há alterações não enviadas até salvar (aviso ao fechar)', async () => {
    const { controller } = published();
    expect(controller.hasUnsentChanges()).toBe(false);
    controller.edit(withBody('x'));
    expect(controller.hasUnsentChanges()).toBe(true);
    await controller.saveNow();
    expect(controller.hasUnsentChanges()).toBe(false);
  });

  it('voltar a rascunho (setMode) liga o autosave', async () => {
    const { controller, clock, calls } = published();
    controller.edit(withBody('x'));
    await clock.advance(DEBOUNCE_MS * 2);
    expect(calls).toHaveLength(0);
    controller.setMode('draft');
    await clock.advance(DEBOUNCE_MS);
    expect(calls).toHaveLength(1);
  });
});

describe('sessão ainda não criada', () => {
  const fresh = () =>
    setup({
      initial: {
        snapshot: { ...base, title: '', body: { type: 'doc', content: [] } },
        token: null,
        sessionId: null,
      },
      worthCreating: (s) => s.title.trim() !== '' || s.body.content?.length !== 0,
    });

  it('mudar só a faixa não cria a linha', async () => {
    const { controller, clock, calls } = fresh();
    controller.edit({ ...controller.getState().current, chapterTo: 11 });
    await clock.advance(DEBOUNCE_MS * 3);
    await controller.onBackground();
    expect(calls).toHaveLength(0);
  });

  it('a primeira alteração real cria, sem token, e depois usa o token novo', async () => {
    const created = vi.fn();
    const { controller, clock, calls } = setup({
      initial: { snapshot: { ...base, title: '' }, token: null, sessionId: null },
      onSessionCreated: created,
      worthCreating: (s) => s.title.trim() !== '',
    });
    controller.edit({ ...controller.getState().current, title: 'Oi' });
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]).toMatchObject({ sessionId: null, expectedUpdatedAt: null });
    expect(created).toHaveBeenCalledWith('novo-id');
    controller.edit({ ...controller.getState().current, title: 'Oi!' });
    await clock.advance(DEBOUNCE_MS);
    expect(calls[1]).toMatchObject({ sessionId: 'novo-id' });
    expect(calls[1]!.expectedUpdatedAt).toMatch(/^2026-10-01T12:00:00\.0000/);
  });

  it('rótulo "Rascunho novo" antes de existir', () => {
    expect(statusLabel(fresh().controller.getState())).toBe('Rascunho novo');
  });
});

describe('decideRestore', () => {
  const server = { updatedAt: 'T1', snapshot: base };
  const local = (over: Partial<LocalRecord>): LocalRecord => ({
    baseUpdatedAt: 'T1',
    snapshot: withBody('local'),
    dirty: true,
    ...over,
  });

  it('sem cópia, ou sem alterações não enviadas: nada a perguntar', () => {
    expect(decideRestore(server, null)).toEqual({ kind: 'none' });
    expect(decideRestore(server, local({ dirty: false }))).toEqual({ kind: 'none' });
  });

  it('cópia igual ao servidor: nada a perguntar', () => {
    expect(decideRestore(server, local({ snapshot: base }))).toEqual({ kind: 'none' });
  });

  it('cópia diferente e não enviada: pergunta', () => {
    expect(decideRestore(server, local({}))).toEqual({ kind: 'ask', serverChanged: false });
  });

  it('o servidor mudou depois da base: pergunta com aviso mais forte', () => {
    expect(decideRestore({ ...server, updatedAt: 'T2' }, local({}))).toEqual({
      kind: 'ask',
      serverChanged: true,
    });
  });

  it('não usa relógio do aparelho: só a marca dirty e o token', () => {
    const r = local({}) as LocalRecord & { savedAt?: number };
    r.savedAt = 0;
    expect(decideRestore(server, r).kind).toBe('ask');
  });
});

describe('restaurar a cópia local', () => {
  it('base igual à do servidor: envia normalmente', async () => {
    const { controller, clock, calls } = setup();
    controller.restoreLocal({
      baseUpdatedAt: '2026-10-01T12:00:00.000000+00:00',
      snapshot: withBody('local'),
      dirty: true,
    });
    expect(controller.getState().loadRevision).toBe(1);
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]!.expectedUpdatedAt).toBe('2026-10-01T12:00:00.000000+00:00');
    expect(controller.getState().status).toBe('saved');
  });

  it('servidor mudou depois da base: o envio dá conflito em vez de sobrescrever', async () => {
    const { controller, clock, calls } = setup({
      results: [
        { kind: 'conflict', server: { updatedAt: 'T-novo', snapshot: withBody('outra aba') } },
      ],
    });
    controller.restoreLocal({
      baseUpdatedAt: 'T-antigo',
      snapshot: withBody('local'),
      dirty: true,
    });
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]!.expectedUpdatedAt).toBe('T-antigo');
    expect(controller.getState().status).toBe('conflict');
  });
});

describe('updated_at é texto opaco (microssegundos)', () => {
  const t1 = '2026-10-01T12:00:00.123456+00:00';
  const t2 = '2026-10-01T12:00:00.123457+00:00';

  it('dois tokens que o Date confunde são diferentes por texto', () => {
    // O JavaScript só tem milissegundos: os dois viram o mesmo instante.
    expect(new Date(t1).getTime()).toBe(new Date(t2).getTime());
    expect(sameToken(t1, t2)).toBe(false);
    expect(sameToken(t1, t1)).toBe(true);
    expect(sameToken(null, null)).toBe(false);
  });

  it('o controlador entrega o token ao transporte exatamente como recebeu', async () => {
    const { controller, clock, calls } = setup({
      initial: { snapshot: base, token: t1, sessionId: 'sess-1' },
      results: [{ kind: 'ok', updatedAt: t2, sessionId: 'sess-1' }],
    });
    controller.edit(withBody('a'));
    await clock.advance(DEBOUNCE_MS);
    controller.edit(withBody('ab'));
    await clock.advance(DEBOUNCE_MS);
    expect(calls[0]!.expectedUpdatedAt).toBe(t1);
    expect(calls[1]!.expectedUpdatedAt).toBe(t2);
  });

  it('o código desta pasta nunca converte o token em Date', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const { join } = await import('node:path');
    for (const file of readdirSync(__dirname).filter(
      (f) => /\.tsx?$/.test(f) && !f.includes('.test.'),
    )) {
      expect(readFileSync(join(__dirname, file), 'utf8'), file).not.toMatch(
        /new Date\(|Date\.parse/,
      );
    }
  });
});

describe('comparação ignora a ordem das chaves (jsonb do Postgres)', () => {
  it('o mesmo corpo com as chaves em outra ordem é igual', () => {
    const fromEditor = withBody('oi');
    const fromDatabase: SessionSnapshot = {
      ...base,
      body: JSON.parse(
        '{"content":[{"content":[{"text":"oi","type":"text"}],"type":"paragraph"}],"type":"doc"}',
      ),
    };
    expect(snapshotKey(fromDatabase)).toBe(snapshotKey(fromEditor));
  });

  it('decideRestore: cópia idêntica ao servidor, só com chaves em outra ordem, não pergunta', () => {
    const server = {
      updatedAt: 'T1',
      snapshot: {
        ...base,
        body: JSON.parse(
          '{"content":[{"content":[{"text":"um","type":"text"}],"type":"paragraph"}],"type":"doc"}',
        ),
      },
    };
    expect(decideRestore(server, { baseUpdatedAt: 'T1', snapshot: base, dirty: true })).toEqual({
      kind: 'none',
    });
  });

  it('abrir e voltar ao texto salvo deixa de ser alteração', async () => {
    const serverBody = JSON.parse(
      '{"content":[{"content":[{"text":"um","type":"text"}],"type":"paragraph"}],"type":"doc"}',
    );
    const { controller } = setup({
      initial: { snapshot: { ...base, body: serverBody }, token: 'T1', sessionId: 'sess-1' },
    });
    controller.edit(withBody('um mais'));
    expect(controller.getState().dirty).toBe(true);
    controller.edit(base);
    expect(controller.getState().dirty).toBe(false);
  });
});

describe('snapshotKey', () => {
  it('muda quando qualquer campo da lista muda', () => {
    const keys = new Set([
      snapshotKey(base),
      snapshotKey({ ...base, title: 'x' }),
      snapshotKey({ ...base, body: body('x') }),
      snapshotKey({ ...base, chapterFrom: 11 }),
      snapshotKey({ ...base, chapterTo: 13 }),
      snapshotKey({ ...base, visibility: 'members' }),
      snapshotKey({ ...base, commentsOpen: false }),
      snapshotKey({ ...base, rating: 4.5 }),
      snapshotKey({ ...base, excerpt: 'x' }),
    ]);
    expect(keys.size).toBe(9);
  });
});
