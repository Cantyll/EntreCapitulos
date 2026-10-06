import { beforeEach, describe, expect, it, vi } from 'vitest';

const logFailure = vi.fn();
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/log', () => ({ logFailure: (...args: unknown[]) => logFailure(...args) }));

const {
  INCOMING_MIN_AGE_MS,
  MAX_DELETIONS,
  PHOTO_MIN_AGE_MS,
  selectStalePhotos,
  sweepAboutPhotos,
} = await import('./photo-gc');

/*
 * Varredura das fotos: só sai o que NADA referencia (rascunho, publicado, as 20 versões) E já é velho (não é um envio
 * em andamento). Falhou ler as referências? Não apaga nada. A foto anterior só some depois que nenhuma versão a usa.
 */

const NOW = Date.parse('2026-10-06T18:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const final = (n: number) => `site/sobre/${id(n)}.webp`;
const file = (n: number, age: number | null) => ({
  name: `${id(n)}.webp`,
  createdAt: age === null ? null : ago(age),
});

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('selectStalePhotos (puro)', () => {
  const select = (
    finals: ReturnType<typeof file>[],
    referenced: string[] = [],
    incoming: { name: string; createdAt: string | null }[] = [],
  ) => selectStalePhotos({ finals, incoming, referenced: new Set(referenced), now: NOW });

  it('apaga a foto velha que nenhuma versão referencia', () => {
    expect(select([file(1, 2 * DAY)])).toEqual([final(1)]);
  });

  it('NÃO apaga a foto referenciada (rascunho, publicado ou histórico), por mais velha que seja', () => {
    expect(select([file(1, 30 * DAY), file(2, 30 * DAY)], [final(1), final(2)])).toEqual([]);
  });

  it('NÃO apaga a foto recente: pode ser um envio ainda não salvo no rascunho', () => {
    expect(select([file(1, 5 * 60 * 1000), file(2, PHOTO_MIN_AGE_MS - 1)])).toEqual([]);
    expect(select([file(3, PHOTO_MIN_AGE_MS)])).toEqual([final(3)]);
  });

  it('data ilegível ou ausente vale "nova demais": não apaga', () => {
    expect(select([file(1, null), { name: `${id(2)}.webp`, createdAt: 'lixo' }])).toEqual([]);
  });

  it('data no futuro (relógio diferente): não apaga', () => {
    expect(
      select([{ name: `${id(1)}.webp`, createdAt: new Date(NOW + DAY).toISOString() }]),
    ).toEqual([]);
  });

  it('só mexe em arquivos com o nome que o servidor gera: qualquer outro nome fica como está', () => {
    expect(
      select([
        { name: 'minha-foto.webp', createdAt: ago(9 * DAY) },
        { name: `${id(1)}.png`, createdAt: ago(9 * DAY) },
        { name: 'incoming', createdAt: ago(9 * DAY) },
        { name: `${id(2)}.webp`, createdAt: ago(9 * DAY) },
      ]),
    ).toEqual([final(2)]);
  });

  it('envios (site/sobre/incoming/) esquecidos saem com um prazo mais curto', () => {
    const incoming = [
      { name: `${id(1)}.jpg`, createdAt: ago(INCOMING_MIN_AGE_MS) },
      { name: `${id(2)}.jpg`, createdAt: ago(INCOMING_MIN_AGE_MS - 1000) },
    ];
    expect(select([], [], incoming)).toEqual([`site/sobre/incoming/${id(1)}.jpg`]);
    expect(INCOMING_MIN_AGE_MS).toBeLessThan(PHOTO_MIN_AGE_MS);
  });
});

// ---------------------------------------------------------------------------------------------
// A varredura completa, com um banco e um Storage de mentira.
// ---------------------------------------------------------------------------------------------

type World = {
  drafts: (string | null)[];
  published: (string | null)[];
  revisions: (string | null)[];
  finals: ReturnType<typeof file>[];
  incoming: { name: string; createdAt: string | null }[];
  failTable: string | null;
  failList: boolean;
  failRemove: boolean;
  removed: string[];
};
let world: World;

const client = () =>
  ({
    from: (table: string) => {
      const rows =
        table === 'site_page_drafts'
          ? world.drafts
          : table === 'site_pages'
            ? world.published
            : world.revisions;
      const result = () =>
        world.failTable === table
          ? { data: null, error: { code: 'XX000', message: 'texto do conteúdo' } }
          : { data: rows.map((path) => ({ path })), error: null };
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.limit = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(result()).then(resolve);
      return chain;
    },
    storage: {
      from: () => ({
        list: async (folder: string) => {
          if (world.failList)
            return { data: null, error: { name: 'StorageApiError', message: 'x' } };
          const entries =
            folder === 'site/sobre'
              ? [
                  { name: 'incoming', id: null, created_at: null },
                  ...world.finals.map((f) => ({
                    name: f.name,
                    id: f.name,
                    created_at: f.createdAt,
                  })),
                ]
              : world.incoming.map((f) => ({ name: f.name, id: f.name, created_at: f.createdAt }));
          return { data: entries, error: null };
        },
        remove: async (paths: string[]) => {
          if (world.failRemove)
            return { data: null, error: { name: 'StorageApiError', message: 'x' } };
          world.removed.push(...paths);
          return { data: [], error: null };
        },
      }),
    },
  }) as never;

beforeEach(() => {
  world = {
    drafts: [],
    published: [],
    revisions: [],
    finals: [],
    incoming: [],
    failTable: null,
    failList: false,
    failRemove: false,
    removed: [],
  };
  logFailure.mockClear();
});

describe('sweepAboutPhotos', () => {
  it('a foto anterior só é apagada quando NENHUMA versão a usa: o publicado e o histórico a protegem', async () => {
    const OLD = final(1);
    const NEW = final(2);
    world.finals = [file(1, 3 * DAY), file(2, 3 * DAY)];

    // O rascunho já aponta para a foto nova, mas a anterior ainda está no PUBLICADO: fica.
    world.drafts = [NEW];
    world.published = [OLD];
    world.revisions = [OLD];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(0);
    expect(world.removed).toEqual([]);

    // Publicou a nova: a anterior ainda está no HISTÓRICO (restaurar precisa dela): fica.
    world.published = [NEW];
    world.revisions = [NEW, OLD];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(0);

    // A versão antiga saiu das 20 últimas: agora ninguém referencia a anterior.
    world.revisions = [NEW];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(1);
    expect(world.removed).toEqual([OLD]);
  });

  it('uma foto enviada e ainda não salva (recente, sem referência) NÃO é apagada', async () => {
    world.finals = [file(1, 10 * 60 * 1000)];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(0);
    expect(world.removed).toEqual([]);
  });

  it('FALHA FECHADA: se qualquer leitura das referências falhar, nada é apagado e só o erro é registrado', async () => {
    world.finals = [file(1, 9 * DAY)];
    for (const table of ['site_page_drafts', 'site_pages', 'site_page_revisions']) {
      world.failTable = table;
      expect(await sweepAboutPhotos(client(), NOW)).toBe(0);
      expect(world.removed).toEqual([]);
    }
    expect(logFailure).toHaveBeenCalledTimes(3);
    for (const call of logFailure.mock.calls) expect(call[0]).toBe('about.photo.referencias');
  });

  it('falha ao listar o Storage: nada é apagado', async () => {
    world.finals = [file(1, 9 * DAY)];
    world.failList = true;
    expect(await sweepAboutPhotos(client(), NOW)).toBe(0);
    expect(world.removed).toEqual([]);
    expect(logFailure).toHaveBeenCalled();
  });

  it('falha ao apagar: devolve 0 e só registra o erro (nunca derruba a ação que a chamou)', async () => {
    world.finals = [file(1, 9 * DAY)];
    world.failRemove = true;
    await expect(sweepAboutPhotos(client(), NOW)).resolves.toBe(0);
    expect(logFailure).toHaveBeenCalledWith('about.photo.apagar', expect.anything());
  });

  it('apaga também os envios esquecidos em site/sobre/incoming/ (com EXIF) depois do prazo curto', async () => {
    world.incoming = [
      { name: `${id(7)}.png`, createdAt: ago(INCOMING_MIN_AGE_MS + 1000) },
      { name: `${id(8)}.png`, createdAt: ago(60 * 1000) },
    ];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(1);
    expect(world.removed).toEqual([`site/sobre/incoming/${id(7)}.png`]);
  });

  it(`nunca apaga mais de ${MAX_DELETIONS} arquivos de uma vez`, async () => {
    world.finals = Array.from({ length: MAX_DELETIONS + 40 }, (_, n) => file(n + 1, 5 * DAY));
    expect(await sweepAboutPhotos(client(), NOW)).toBe(MAX_DELETIONS);
    expect(world.removed).toHaveLength(MAX_DELETIONS);
  });

  it('referências nulas (foto removida do conteúdo) não protegem nada', async () => {
    world.finals = [file(1, 5 * DAY)];
    world.drafts = [null];
    world.published = [null];
    world.revisions = [null, null];
    expect(await sweepAboutPhotos(client(), NOW)).toBe(1);
  });
});
