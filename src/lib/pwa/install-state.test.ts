import { describe, expect, it, vi } from 'vitest';

import { INSTALL_RULES } from '@/content/install';

import {
  EMPTY_INSTALL_STATE,
  decide,
  dismissForever,
  dismissLater,
  isDismissed,
  isExcludedPath,
  isPreviewRequest,
  loadInstallState,
  localDay,
  parseInstallState,
  parseInstallStateDetailed,
  saveInstallState,
  serializeInstallState,
  type DecideInput,
  type InstallState,
  type StorageLike,
} from './install-state';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const KEY = 'ec:install:v1';

function valid(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    v: 1,
    visits: 2,
    lastDay: '2026-06-10',
    dismissedAt: null,
    never: false,
    ...overrides,
  });
}

function without(key: string): string {
  const record: Record<string, unknown> = JSON.parse(valid());
  delete record[key];
  return JSON.stringify(record);
}

describe('parseInstallState: o que vale', () => {
  it('lê um estado válido', () => {
    expect(parseInstallState(valid())).toEqual({
      visits: 2,
      lastDay: '2026-06-10',
      dismissedAt: null,
      never: false,
    });
  });

  it('lê todos os campos preenchidos', () => {
    expect(
      parseInstallState(
        valid({ visits: 7, lastDay: '2024-02-29', dismissedAt: 1_780_000_000_000, never: true }),
      ),
    ).toEqual({ visits: 7, lastDay: '2024-02-29', dismissedAt: 1_780_000_000_000, never: true });
  });

  it('aceita o estado inicial (zero visitas, sem dia) e o dismissedAt zero', () => {
    expect(parseInstallState(valid({ visits: 0, lastDay: null }))).toEqual({
      visits: 0,
      lastDay: null,
      dismissedAt: null,
      never: false,
    });
    expect(parseInstallState(valid({ dismissedAt: 0 })).dismissedAt).toBe(0);
  });

  it('o resultado não carrega campos extras (o `v` fica de fora)', () => {
    expect(Object.keys(parseInstallState(valid())).sort()).toEqual(
      ['dismissedAt', 'lastDay', 'never', 'visits'].sort(),
    );
  });

  it('o limite de visitas (1 milhão) vale; um a mais, não', () => {
    expect(parseInstallState(valid({ visits: 1_000_000 })).visits).toBe(1_000_000);
    expect(parseInstallState(valid({ visits: 1_000_001 }))).toBe(EMPTY_INSTALL_STATE);
  });
});

describe('parseInstallState: ausência e texto quebrado', () => {
  it.each([null, undefined, ''])('%j vira o estado vazio, sem falha', (raw) => {
    const result = parseInstallStateDetailed(raw);
    expect(result).toEqual({ state: EMPTY_INSTALL_STATE, error: undefined, failed: false });
  });

  it('um valor que não é texto vira o estado vazio, sem falha', () => {
    expect(parseInstallStateDetailed(42 as unknown as string)).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: undefined,
      failed: false,
    });
  });

  it('JSON quebrado: estado vazio e falha com o erro do JSON.parse', () => {
    const result = parseInstallStateDetailed('{"v":1,"visits":');
    expect(result.failed).toBe(true);
    expect(result.state).toEqual(EMPTY_INSTALL_STATE);
    expect(result.error).toBeInstanceOf(SyntaxError);
  });

  it.each(['not json', '{', '{"v":1,}', "{'v':1}", 'undefined', 'NaN'])(
    'texto quebrado %j: falha, nunca lança',
    (raw) => {
      expect(() => parseInstallStateDetailed(raw)).not.toThrow();
      const result = parseInstallStateDetailed(raw);
      expect(result.failed).toBe(true);
      expect(result.state).toEqual(EMPTY_INSTALL_STATE);
    },
  );

  it('JSON válido com outro formato não é falha: só volta ao zero', () => {
    for (const raw of ['null', '[]', '"texto"', '42', 'true', '[1,2,3]']) {
      expect(parseInstallStateDetailed(raw)).toEqual({
        state: EMPTY_INSTALL_STATE,
        error: undefined,
        failed: false,
      });
    }
  });

  it('parseInstallState devolve só o estado (sem lançar) para texto quebrado', () => {
    expect(parseInstallState('{')).toEqual(EMPTY_INSTALL_STATE);
  });
});

describe('parseInstallState: formato estrito', () => {
  it('campo a mais é recusado', () => {
    expect(parseInstallState(valid({ extra: 1 }))).toEqual(EMPTY_INSTALL_STATE);
    expect(parseInstallState(valid({ email: 'a@b.c' }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each(['v', 'visits', 'lastDay', 'dismissedAt', 'never'])(
    'campo faltando (%s) é recusado',
    (key) => {
      expect(parseInstallState(without(key))).toEqual(EMPTY_INSTALL_STATE);
    },
  );

  it('um campo a mais no lugar de um que falta (mesma contagem de chaves) é recusado', () => {
    const record: Record<string, unknown> = JSON.parse(valid());
    delete record.never;
    record.outro = false;
    expect(parseInstallState(JSON.stringify(record))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each([2, 0, -1, '1', null, true, 1.5])('versão %j (diferente de 1) é recusada', (v) => {
    expect(parseInstallState(valid({ v }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each([
    ['visits como texto', { visits: '2' }],
    ['visits nulo', { visits: null }],
    ['visits booleano', { visits: true }],
    ['lastDay numérico', { lastDay: 20260610 }],
    ['lastDay booleano', { lastDay: false }],
    ['lastDay objeto', { lastDay: {} }],
    ['dismissedAt como texto', { dismissedAt: '1780000000000' }],
    ['dismissedAt booleano', { dismissedAt: false }],
    ['never como texto', { never: 'true' }],
    ['never como número', { never: 1 }],
    ['never nulo', { never: null }],
  ])('tipo errado: %s', (_label, overrides) => {
    expect(parseInstallState(valid(overrides))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each([
    ['visits negativo', -1],
    ['visits fracionado', 1.5],
    ['visits fracionado perto de inteiro', 2.0000001],
    ['visits enorme', 1e21],
    ['visits acima de um milhão', 5_000_000],
    ['visits infinito (JSON vira null)', Number.POSITIVE_INFINITY],
    ['visits NaN (JSON vira null)', Number.NaN],
  ])('%s é recusado', (_label, visits) => {
    expect(parseInstallState(valid({ visits }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each([
    ['dia inexistente 2026-02-31', '2026-02-31'],
    ['29 de fevereiro de ano comum', '2025-02-29'],
    ['mês 13', '2026-13-01'],
    ['mês 00', '2026-00-10'],
    ['dia 00', '2026-06-00'],
    ['dia 32', '2026-01-32'],
    ['31 de abril', '2026-04-31'],
    ['sem zero à esquerda', '2026-6-1'],
    ['ano de dois dígitos', '26-06-10'],
    ['barra no lugar do hífen', '2026/06/10'],
    ['espaço sobrando', ' 2026-06-10'],
    ['hora junto', '2026-06-10T00:00:00'],
    ['texto vazio', ''],
    ['texto qualquer', 'ontem'],
  ])('lastDay inválido: %s', (_label, lastDay) => {
    expect(parseInstallState(valid({ lastDay }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it('29 de fevereiro de ano bissexto vale', () => {
    expect(parseInstallState(valid({ lastDay: '2024-02-29' })).lastDay).toBe('2024-02-29');
    expect(parseInstallState(valid({ lastDay: '2000-02-29' })).lastDay).toBe('2000-02-29');
    expect(parseInstallState(valid({ lastDay: '1900-02-29' }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it.each([
    ['negativo', -1],
    ['fracionado', 1.5],
    ['maior que o maior inteiro seguro', 2 ** 53],
    ['enorme', 1e300],
  ])('dismissedAt %s é recusado', (_label, dismissedAt) => {
    expect(parseInstallState(valid({ dismissedAt }))).toEqual(EMPTY_INSTALL_STATE);
  });

  it('o objeto não é reaproveitado entre leituras (cada leitura devolve o seu)', () => {
    const a = parseInstallState(valid());
    const b = parseInstallState(valid());
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
});

describe('serializeInstallState', () => {
  it('escreve exatamente o formato guardado (v, visits, lastDay, dismissedAt, never)', () => {
    expect(serializeInstallState(EMPTY_INSTALL_STATE)).toBe(
      '{"v":1,"visits":0,"lastDay":null,"dismissedAt":null,"never":false}',
    );
    expect(
      serializeInstallState({
        visits: 3,
        lastDay: '2026-06-10',
        dismissedAt: 1_780_000_000_000,
        never: true,
      }),
    ).toBe('{"v":1,"visits":3,"lastDay":"2026-06-10","dismissedAt":1780000000000,"never":true}');
  });

  it('ida e volta devolve o mesmo estado', () => {
    const states: InstallState[] = [
      EMPTY_INSTALL_STATE,
      { visits: 1, lastDay: '2026-06-10', dismissedAt: null, never: false },
      { visits: 9, lastDay: '2024-02-29', dismissedAt: 1_780_000_000_000, never: false },
      { visits: 1_000_000, lastDay: '2026-12-31', dismissedAt: 0, never: true },
    ];
    for (const state of states) {
      expect(parseInstallState(serializeInstallState(state))).toEqual(state);
      expect(parseInstallStateDetailed(serializeInstallState(state)).failed).toBe(false);
    }
  });

  it('só grava os quatro campos do estado: um campo de fora do tipo não vai junto', () => {
    const dirty = { ...EMPTY_INSTALL_STATE, email: 'a@b.c', nome: 'Ana' } as InstallState;
    expect(Object.keys(JSON.parse(serializeInstallState(dirty))).sort()).toEqual(
      ['dismissedAt', 'lastDay', 'never', 'v', 'visits'].sort(),
    );
    expect(serializeInstallState(dirty)).not.toContain('a@b.c');
  });

  it('o texto gravado sempre passa pela leitura estrita (visitas no limite)', () => {
    const text = serializeInstallState({
      visits: 1_000_000,
      lastDay: null,
      dismissedAt: null,
      never: false,
    });
    expect(parseInstallStateDetailed(text).failed).toBe(false);
    expect(parseInstallState(text).visits).toBe(1_000_000);
  });
});

/** Roda com outro fuso horário (Node relê `process.env.TZ` ao vivo); sem efeito, o teste é pulado. */
function withTimeZone(
  zone: string,
  probe: Date,
  expectedHour: number,
  run: () => void,
  skip: () => void,
) {
  const previous = process.env.TZ;
  process.env.TZ = zone;
  try {
    if (probe.getHours() !== expectedHour) return skip();
    run();
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
}

describe('localDay: dia do calendário LOCAL', () => {
  it('usa ano-mês-dia com zeros à esquerda', () => {
    expect(localDay(new Date(2026, 0, 5, 9))).toBe('2026-01-05');
    expect(localDay(new Date(2026, 11, 31, 23))).toBe('2026-12-31');
    expect(localDay(new Date(2024, 1, 29, 12))).toBe('2024-02-29');
  });

  it('um ano de menos de quatro dígitos recebe zeros à esquerda', () => {
    const date = new Date(2000, 0, 1);
    date.setFullYear(900);
    expect(localDay(date)).toBe('0900-01-01');
  });

  it('vira o dia exatamente à meia-noite local', () => {
    expect(localDay(new Date(2026, 5, 10, 23, 59, 59, 999))).toBe('2026-06-10');
    expect(localDay(new Date(2026, 5, 11, 0, 0, 0, 0))).toBe('2026-06-11');
  });

  it('vira o mês e o ano', () => {
    expect(localDay(new Date(2026, 0, 31, 23, 59))).toBe('2026-01-31');
    expect(localDay(new Date(2026, 1, 1, 0, 0))).toBe('2026-02-01');
    expect(localDay(new Date(2026, 11, 31, 23, 59, 59))).toBe('2026-12-31');
    expect(localDay(new Date(2027, 0, 1, 0, 0, 1))).toBe('2027-01-01');
  });

  it('o mesmo instante dá o dia do fuso do aparelho, não o do UTC (Brasil, UTC-3)', (ctx) => {
    const instant = new Date('2026-03-10T02:00:00Z'); // 23h do dia 9 em Brasília
    withTimeZone(
      'America/Sao_Paulo',
      instant,
      23,
      () => expect(localDay(instant)).toBe('2026-03-09'),
      () => ctx.skip(),
    );
  });

  it('o mesmo instante dá o dia do fuso do aparelho, não o do UTC (Nova Zelândia, UTC+13)', (ctx) => {
    const instant = new Date('2026-01-15T12:00:00Z'); // 1h do dia 16 em Auckland
    withTimeZone(
      'Pacific/Auckland',
      instant,
      1,
      () => expect(localDay(instant)).toBe('2026-01-16'),
      () => ctx.skip(),
    );
  });

  it('o formato sempre é AAAA-MM-DD e é um dia real para a leitura estrita', () => {
    for (const date of [
      new Date(2026, 5, 10, 8),
      new Date(2024, 1, 29, 23),
      new Date(2026, 0, 1, 0),
    ]) {
      const day = localDay(date);
      expect(day).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(parseInstallState(valid({ lastDay: day })).lastDay).toBe(day);
    }
  });
});

describe('isExcludedPath', () => {
  it.each([
    '/entrar',
    '/entrar/',
    '/entrar?x=1',
    '/entrar/?next=%2Fsessoes',
    '/entrar#codigo',
    '/entrar//',
    '/entrar/codigo',
    '/boas-vindas',
    '/boas-vindas/',
    '/boas-vindas?next=%2F',
    '/conta/excluida',
    '/conta/excluida/',
    '/conta/excluida?x=1',
    '/conta/excluida/detalhe',
  ])('%s é excluída', (path) => {
    expect(isExcludedPath(path)).toBe(true);
  });

  it.each([
    '/',
    '',
    '/conta',
    '/conta/',
    '/conta/dados',
    '/conta/excluidas',
    '/conta/excluida-x',
    '/entrarxyz',
    '/entrar-x',
    '/boas-vindas2',
    '/boas-vindasx/y',
    '/livros/entrar',
    '/livros/boas-vindas/sessoes/1',
    '/sobre',
    '/sessoes',
    '/painel',
    '/painel/comentarios',
    '/livros/nao-existe',
  ])('%s não é excluída', (path) => {
    expect(isExcludedPath(path)).toBe(false);
  });

  it('segue a lista de INSTALL_RULES.excludedPaths (a raiz e um subcaminho de cada uma)', () => {
    for (const path of INSTALL_RULES.excludedPaths) {
      expect(isExcludedPath(path)).toBe(true);
      expect(isExcludedPath(`${path}/filho`)).toBe(true);
      expect(isExcludedPath(`${path}x`)).toBe(false);
    }
  });
});

describe('isPreviewRequest', () => {
  it.each([
    '?instalacao=ver',
    'instalacao=ver',
    '?instalacao=ver&x=1',
    '?x=1&instalacao=ver',
    '?a=1&instalacao=ver&b=2',
  ])('%s liga a pré-visualização', (search) => {
    expect(isPreviewRequest(search)).toBe(true);
  });

  it.each([
    '',
    '?',
    '?instalacao=',
    '?instalacao',
    '?instalacao=VER',
    '?instalacao=ver2',
    '?instalacao=nao',
    '?instalacao=%20ver',
    '?Instalacao=ver',
    '?instalacao[]=ver',
    '?x=ver',
    '?ver=instalacao',
  ])('%j não liga', (search) => {
    expect(isPreviewRequest(search)).toBe(false);
  });
});

describe('isDismissed', () => {
  const now = new Date(Date.UTC(2026, 5, 1, 12, 0, 0));
  const state = (overrides: Partial<InstallState>): InstallState => ({
    ...EMPTY_INSTALL_STATE,
    ...overrides,
  });

  it('sem dispensa e sem "já instalei": não', () => {
    expect(isDismissed(EMPTY_INSTALL_STATE, now)).toBe(false);
  });

  it('"Já instalei" (never) vale para sempre, mesmo sem data', () => {
    expect(isDismissed(state({ never: true }), now)).toBe(true);
    expect(isDismissed(state({ never: true, dismissedAt: now.getTime() - 400 * DAY }), now)).toBe(
      true,
    );
  });

  it('"Agora não" feito agora vale', () => {
    expect(isDismissed(state({ dismissedAt: now.getTime() }), now)).toBe(true);
  });

  it('um dia, uma semana e um mês depois ainda vale', () => {
    for (const days of [1, 7, 30]) {
      expect(isDismissed(state({ dismissedAt: now.getTime() - days * DAY }), now)).toBe(true);
    }
  });

  it('59 dias e 23 horas depois ainda vale', () => {
    expect(isDismissed(state({ dismissedAt: now.getTime() - (59 * DAY + 23 * HOUR) }), now)).toBe(
      true,
    );
  });

  it('por 1 milissegundo a menos de 60 dias ainda vale; com 60 dias exatos, não', () => {
    expect(isDismissed(state({ dismissedAt: now.getTime() - (60 * DAY - 1) }), now)).toBe(true);
    expect(isDismissed(state({ dismissedAt: now.getTime() - 60 * DAY }), now)).toBe(false);
  });

  it('depois de 60 dias não vale mais', () => {
    expect(isDismissed(state({ dismissedAt: now.getTime() - (60 * DAY + 1) }), now)).toBe(false);
    expect(isDismissed(state({ dismissedAt: now.getTime() - 61 * DAY }), now)).toBe(false);
    expect(isDismissed(state({ dismissedAt: now.getTime() - 365 * DAY }), now)).toBe(false);
  });

  it('dismissedAt no futuro (o relógio do aparelho voltou) é ignorado', () => {
    expect(isDismissed(state({ dismissedAt: now.getTime() + 1 }), now)).toBe(false);
    expect(isDismissed(state({ dismissedAt: now.getTime() + 30 * DAY }), now)).toBe(false);
  });

  it('o prazo é o de INSTALL_RULES.dismissDays', () => {
    const edge = INSTALL_RULES.dismissDays * DAY;
    expect(isDismissed(state({ dismissedAt: now.getTime() - (edge - 1) }), now)).toBe(true);
    expect(isDismissed(state({ dismissedAt: now.getTime() - edge }), now)).toBe(false);
  });
});

describe('decide', () => {
  const now = new Date(2026, 5, 10, 14, 30); // 10 de junho de 2026, 14h30 locais
  const today = '2026-06-10';
  const yesterday = '2026-06-09';

  function input(overrides: Partial<DecideInput> = {}): DecideInput {
    return {
      eligibility: 'card',
      surface: 'public',
      pathname: '/',
      preview: false,
      now,
      state: EMPTY_INSTALL_STATE,
      ...overrides,
    };
  }

  const seen = (overrides: Partial<InstallState> = {}): InstallState => ({
    visits: 1,
    lastDay: yesterday,
    dismissedAt: null,
    never: false,
    ...overrides,
  });

  describe('aparelho inelegível', () => {
    it.each(['public', 'panel'] as const)(
      '"none" no %s: nada, nenhuma visita contada, nada a gravar',
      (surface) => {
        const state = seen({ lastDay: yesterday, visits: 5 });
        const result = decide(input({ eligibility: 'none', surface, state }));
        expect(result.view).toBeNull();
        expect(result.persist).toBe(false);
        expect(result.state).toBe(state);
      },
    );

    it('"none" com estado vazio continua vazio (não vira "1 visita")', () => {
      const result = decide(input({ eligibility: 'none' }));
      expect(result.state).toEqual(EMPTY_INSTALL_STATE);
      expect(result.state.visits).toBe(0);
      expect(result.persist).toBe(false);
    });

    it('"none" com ?instalacao=ver também não mostra nada', () => {
      expect(decide(input({ eligibility: 'none', preview: true })).view).toBeNull();
    });
  });

  describe('contagem de visitas (no máximo +1 por dia do calendário local)', () => {
    it('a primeira visita conta 1, grava o dia e não mostra no site público', () => {
      const result = decide(input());
      expect(result.view).toBeNull();
      expect(result.persist).toBe(true);
      expect(result.state).toEqual({ visits: 1, lastDay: today, dismissedAt: null, never: false });
    });

    it('recarregar no mesmo dia não conta de novo e não grava', () => {
      const state = seen({ visits: 1, lastDay: today });
      const result = decide(input({ state }));
      expect(result.view).toBeNull();
      expect(result.persist).toBe(false);
      expect(result.state).toBe(state);
      expect(result.state.visits).toBe(1);
    });

    it('um dia depois conta a 2ª visita', () => {
      const result = decide(input({ state: seen() }));
      expect(result.state.visits).toBe(2);
      expect(result.state.lastDay).toBe(today);
      expect(result.persist).toBe(true);
    });

    it('duas aberturas no mesmo dia (de manhã e à noite) contam uma só', () => {
      const morning = new Date(2026, 5, 10, 8, 0);
      const night = new Date(2026, 5, 10, 22, 0);
      const first = decide(input({ now: morning }));
      const second = decide(input({ now: night, state: first.state }));
      expect(second.state.visits).toBe(1);
      expect(second.persist).toBe(false);
    });

    it('a virada de dia é a da meia-noite LOCAL: 23h59 e 0h01 são dias diferentes', () => {
      const late = new Date(2026, 5, 10, 23, 59);
      const early = new Date(2026, 5, 11, 0, 1);
      const first = decide(input({ now: late }));
      expect(first.state).toMatchObject({ visits: 1, lastDay: '2026-06-10' });
      const second = decide(input({ now: early, state: first.state }));
      expect(second.state).toMatchObject({ visits: 2, lastDay: '2026-06-11' });
      expect(second.view).toBe('card');
    });

    it('muitos dias seguidos contam um por dia', () => {
      let state: InstallState = EMPTY_INSTALL_STATE;
      for (let day = 1; day <= 5; day += 1) {
        state = decide(input({ now: new Date(2026, 5, day, 12), state })).state;
      }
      expect(state.visits).toBe(5);
      expect(state.lastDay).toBe('2026-06-05');
    });

    it('pular dias não acumula: um dia depois de semanas ainda conta só +1', () => {
      const result = decide(input({ state: seen({ visits: 1, lastDay: '2026-04-01' }) }));
      expect(result.state.visits).toBe(2);
    });

    it('o contador para no limite de 1 milhão', () => {
      const result = decide(input({ state: seen({ visits: 1_000_000 }) }));
      expect(result.state.visits).toBe(1_000_000);
      expect(result.state.lastDay).toBe(today);
      expect(result.persist).toBe(true);
    });

    it('não altera o estado recebido', () => {
      const state = Object.freeze(seen());
      const before = { ...state };
      expect(() => decide(input({ state }))).not.toThrow();
      expect(state).toEqual(before);
    });
  });

  describe('site público: a partir da 2ª visita', () => {
    it('1ª visita: não mostra', () => {
      expect(decide(input()).view).toBeNull();
    });

    it('2ª visita (outro dia): mostra o cartão', () => {
      expect(decide(input({ state: seen() })).view).toBe('card');
    });

    it('3ª visita e as seguintes: mostra', () => {
      expect(decide(input({ state: seen({ visits: 2 }) })).view).toBe('card');
      expect(decide(input({ state: seen({ visits: 40 }) })).view).toBe('card');
    });

    it('depois de mostrar, recarregar no mesmo dia continua mostrando e não grava', () => {
      const shown = decide(input({ state: seen() }));
      const reload = decide(input({ state: shown.state }));
      expect(reload.view).toBe('card');
      expect(reload.persist).toBe(false);
    });

    it('mostra só depois de 2 dias DIFERENTES: dois acessos no mesmo dia não bastam', () => {
      const first = decide(input({ now: new Date(2026, 5, 10, 8) }));
      const sameDay = decide(input({ now: new Date(2026, 5, 10, 20), state: first.state }));
      expect(sameDay.view).toBeNull();
      const nextDay = decide(input({ now: new Date(2026, 5, 11, 8), state: sameDay.state }));
      expect(nextDay.view).toBe('card');
    });

    it('o mínimo é o de INSTALL_RULES.minVisitsPublic', () => {
      const needed = INSTALL_RULES.minVisitsPublic;
      expect(decide(input({ state: seen({ visits: needed - 2 }) })).view).toBeNull();
      expect(decide(input({ state: seen({ visits: needed - 1 }) })).view).toBe('card');
    });
  });

  describe('painel: desde o primeiro acesso', () => {
    it('1º acesso: mostra e conta a visita', () => {
      const result = decide(input({ surface: 'panel' }));
      expect(result.view).toBe('card');
      expect(result.state.visits).toBe(1);
      expect(result.persist).toBe(true);
    });

    it('acessos seguintes também mostram', () => {
      expect(decide(input({ surface: 'panel', state: seen() })).view).toBe('card');
      expect(decide(input({ surface: 'panel', state: seen({ lastDay: today }) })).view).toBe(
        'card',
      );
    });

    it('"Já instalei" e "Agora não" valem no painel', () => {
      expect(decide(input({ surface: 'panel', state: seen({ never: true }) })).view).toBeNull();
      expect(
        decide(input({ surface: 'panel', state: seen({ dismissedAt: now.getTime() - DAY }) })).view,
      ).toBeNull();
    });
  });

  describe('"Já instalei" (never)', () => {
    it.each(['public', 'panel'] as const)('esconde para sempre no %s', (surface) => {
      for (const visits of [1, 2, 50]) {
        const result = decide(input({ surface, state: seen({ visits, never: true }) }));
        expect(result.view).toBeNull();
        expect(result.state.never).toBe(true);
      }
    });

    it('esconde também a dica do navegador embutido', () => {
      expect(decide(input({ eligibility: 'hint', state: seen({ never: true }) })).view).toBeNull();
    });
  });

  describe('"Agora não": 60 dias', () => {
    it('esconde logo depois', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - 1000 });
      expect(decide(input({ state })).view).toBeNull();
    });

    it('59 dias e 23 horas depois ainda esconde', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - (59 * DAY + 23 * HOUR) });
      expect(decide(input({ state })).view).toBeNull();
    });

    it('com 60 dias exatos o cartão volta', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - 60 * DAY });
      expect(decide(input({ state })).view).toBe('card');
    });

    it('depois de 60 dias o cartão volta (e a visita do dia continua sendo contada)', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - 61 * DAY });
      const result = decide(input({ state }));
      expect(result.view).toBe('card');
      expect(result.state.visits).toBe(4);
    });

    it('a visita é contada mesmo enquanto o cartão está escondido', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - DAY });
      const result = decide(input({ state }));
      expect(result.state.visits).toBe(4);
      expect(result.persist).toBe(true);
    });

    it('depois de voltar, uma nova dispensa esconde por mais 60 dias', () => {
      const first = decide(
        input({ state: seen({ visits: 3, dismissedAt: now.getTime() - 61 * DAY }) }),
      );
      const dismissed = dismissLater(first.state, now);
      const later = new Date(now.getTime() + 30 * DAY);
      expect(decide(input({ now: later, state: dismissed })).view).toBeNull();
      const muchLater = new Date(now.getTime() + 61 * DAY);
      expect(decide(input({ now: muchLater, state: dismissed })).view).toBe('card');
    });

    it('relógio que voltou (dismissedAt no futuro): a dispensa é ignorada', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() + 5 * DAY });
      expect(decide(input({ state })).view).toBe('card');
    });

    it('vale também no painel e para a dica do navegador embutido', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - 5 * DAY });
      expect(decide(input({ surface: 'panel', state })).view).toBeNull();
      expect(decide(input({ eligibility: 'hint', state })).view).toBeNull();
    });
  });

  describe('rotas excluídas: a visita conta, nada aparece', () => {
    it.each([
      '/entrar',
      '/entrar/',
      '/entrar?next=%2F',
      '/boas-vindas',
      '/conta/excluida',
      '/conta/excluida/detalhe',
    ])('%s', (pathname) => {
      for (const surface of ['public', 'panel'] as const) {
        const result = decide(input({ surface, pathname, state: seen({ visits: 5 }) }));
        expect(result.view).toBeNull();
        expect(result.state.visits).toBe(6);
        expect(result.persist).toBe(true);
      }
    });

    it('a 1ª visita pode ser numa rota excluída: conta, e a próxima mostra', () => {
      const first = decide(input({ pathname: '/entrar' }));
      expect(first.view).toBeNull();
      expect(first.state.visits).toBe(1);
      const second = decide(
        input({ now: new Date(2026, 5, 11, 9), state: first.state, pathname: '/' }),
      );
      expect(second.view).toBe('card');
    });

    it('/conta (que não é excluída) mostra normalmente', () => {
      expect(decide(input({ pathname: '/conta', state: seen() })).view).toBe('card');
    });

    it('a dica do navegador embutido também respeita as rotas excluídas', () => {
      expect(
        decide(input({ eligibility: 'hint', pathname: '/entrar', state: seen() })).view,
      ).toBeNull();
    });
  });

  describe('?instalacao=ver (pré-visualização do cartão)', () => {
    it('mostra o cartão já na 1ª visita, sem contar e sem gravar', () => {
      const result = decide(input({ preview: true }));
      expect(result.view).toBe('card');
      expect(result.persist).toBe(false);
      expect(result.state).toBe(EMPTY_INSTALL_STATE);
      expect(result.state.visits).toBe(0);
      expect(result.state.lastDay).toBeNull();
    });

    it('ignora a dispensa de 60 dias', () => {
      const state = seen({ visits: 3, dismissedAt: now.getTime() - DAY });
      const result = decide(input({ preview: true, state }));
      expect(result.view).toBe('card');
      expect(result.persist).toBe(false);
      expect(result.state).toBe(state);
    });

    it('ignora o "Já instalei"', () => {
      const state = seen({ never: true });
      const result = decide(input({ preview: true, state }));
      expect(result.view).toBe('card');
      expect(result.persist).toBe(false);
      expect(result.state).toBe(state);
    });

    it('vale no painel também', () => {
      expect(decide(input({ preview: true, surface: 'panel' })).view).toBe('card');
    });

    it('a rota excluída continua valendo: nada aparece e nada grava', () => {
      for (const pathname of ['/entrar', '/boas-vindas', '/conta/excluida', '/conta/excluida/x']) {
        const result = decide(input({ preview: true, pathname }));
        expect(result.view).toBeNull();
        expect(result.persist).toBe(false);
        expect(result.state).toBe(EMPTY_INSTALL_STATE);
      }
    });

    it('não mostra nada num aparelho inelegível', () => {
      expect(decide(input({ preview: true, eligibility: 'none' })).view).toBeNull();
    });

    it('não mexe no dia da última visita (o estado voltado é o recebido)', () => {
      const state = seen({ visits: 2, lastDay: '2026-06-01' });
      expect(decide(input({ preview: true, state })).state).toBe(state);
    });
  });

  describe('dica do navegador embutido (eligibility "hint")', () => {
    it('segue as regras normais do site público: só na 2ª visita', () => {
      expect(decide(input({ eligibility: 'hint' })).view).toBeNull();
      expect(decide(input({ eligibility: 'hint', state: seen() })).view).toBe('hint');
    });

    it('no painel aparece já no 1º acesso', () => {
      expect(decide(input({ eligibility: 'hint', surface: 'panel' })).view).toBe('hint');
    });

    it('conta a visita do dia como o cartão', () => {
      const result = decide(input({ eligibility: 'hint' }));
      expect(result.state.visits).toBe(1);
      expect(result.persist).toBe(true);
    });

    it('?instalacao=ver NÃO a força: ela segue as regras normais', () => {
      const first = decide(input({ eligibility: 'hint', preview: true }));
      expect(first.view).toBeNull();
      expect(first.persist).toBe(true);
      expect(first.state.visits).toBe(1);
      expect(decide(input({ eligibility: 'hint', preview: true, state: seen() })).view).toBe(
        'hint',
      );
      expect(
        decide(input({ eligibility: 'hint', preview: true, state: seen({ never: true }) })).view,
      ).toBeNull();
      expect(
        decide(
          input({
            eligibility: 'hint',
            preview: true,
            state: seen({ dismissedAt: now.getTime() - DAY }),
          }),
        ).view,
      ).toBeNull();
    });
  });
});

describe('dismissLater e dismissForever', () => {
  const base: InstallState = {
    visits: 4,
    lastDay: '2026-06-10',
    dismissedAt: null,
    never: false,
  };

  it('dismissLater guarda o instante e preserva o resto', () => {
    const at = new Date(2026, 5, 10, 14, 30);
    expect(dismissLater(base, at)).toEqual({ ...base, dismissedAt: at.getTime() });
  });

  it('dismissLater não altera o estado original', () => {
    const frozen = Object.freeze({ ...base });
    expect(() => dismissLater(frozen, new Date())).not.toThrow();
    expect(frozen.dismissedAt).toBeNull();
  });

  it('dismissLater não desfaz o "Já instalei"', () => {
    expect(dismissLater({ ...base, never: true }, new Date(5)).never).toBe(true);
  });

  it('dismissLater mais recente substitui a anterior', () => {
    const first = dismissLater(base, new Date(1000));
    expect(dismissLater(first, new Date(2000)).dismissedAt).toBe(2000);
  });

  it('dismissForever marca "never" e preserva o resto', () => {
    expect(dismissForever(base)).toEqual({ ...base, never: true });
    expect(dismissForever({ ...base, dismissedAt: 123 })).toEqual({
      ...base,
      dismissedAt: 123,
      never: true,
    });
  });

  it('dismissForever não altera o estado original', () => {
    const frozen = Object.freeze({ ...base });
    expect(() => dismissForever(frozen)).not.toThrow();
    expect(frozen.never).toBe(false);
  });

  it('o resultado de cada uma passa pela leitura estrita e esconde o cartão', () => {
    const now = new Date(2026, 5, 10, 14, 30);
    const later = dismissLater(base, now);
    const forever = dismissForever(base);
    expect(parseInstallState(serializeInstallState(later))).toEqual(later);
    expect(parseInstallState(serializeInstallState(forever))).toEqual(forever);
    expect(isDismissed(later, now)).toBe(true);
    expect(isDismissed(forever, now)).toBe(true);
  });
});

/** Um `localStorage` de mentira, na memória. */
function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  const storage = {
    getItem: vi.fn((key: string) => data.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => {
      data.set(key, value);
    }),
  } satisfies StorageLike;
  return { storage, data };
}

describe('loadInstallState', () => {
  it('lê o estado guardado na chave versionada, uma vez', () => {
    const { storage } = memoryStorage({ [KEY]: valid({ visits: 3 }) });
    const result = loadInstallState(() => storage);
    expect(result).toEqual({
      state: { visits: 3, lastDay: '2026-06-10', dismissedAt: null, never: false },
      error: undefined,
      failed: false,
      writable: true,
    });
    expect(storage.getItem).toHaveBeenCalledTimes(1);
    expect(storage.getItem).toHaveBeenCalledWith(KEY);
  });

  it('sem nada guardado: estado vazio, sem falha', () => {
    const { storage } = memoryStorage();
    expect(loadInstallState(() => storage)).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: undefined,
      failed: false,
      writable: true,
    });
  });

  it('armazenamento nulo (não existe): estado vazio, sem falha, nada lido', () => {
    expect(loadInstallState(() => null)).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: undefined,
      failed: false,
      writable: true,
    });
  });

  it('o getter do localStorage lança SecurityError (cookies bloqueados): o erro volta ao chamador', () => {
    const error = new DOMException('The operation is insecure.', 'SecurityError');
    const result = loadInstallState(() => {
      throw error;
    });
    expect(result.failed).toBe(true);
    expect(result.writable).toBe(false);
    expect(result.error).toBe(error);
    expect(result.state).toEqual(EMPTY_INSTALL_STATE);
  });

  it('getItem lança: o erro volta ao chamador e o estado volta ao zero', () => {
    const error = new Error('falha ao ler');
    const storage: StorageLike = {
      getItem: () => {
        throw error;
      },
      setItem: () => {},
    };
    const result = loadInstallState(() => storage);
    expect(result.failed).toBe(true);
    expect(result.writable).toBe(false);
    expect(result.error).toBe(error);
    expect(result.state).toEqual(EMPTY_INSTALL_STATE);
  });

  it('o que foi lançado nem precisa ser um Error (throw de texto)', () => {
    const result = loadInstallState(() => {
      throw 'recusado';
    });
    expect(result).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: 'recusado',
      failed: true,
      writable: false,
    });
  });

  it('texto guardado quebrado: falha com o SyntaxError e estado vazio, mas dá para gravar', () => {
    const { storage } = memoryStorage({ [KEY]: '{"v":1,"visits":' });
    const result = loadInstallState(() => storage);
    expect(result.failed).toBe(true);
    expect(result.writable).toBe(true);
    expect(result.error).toBeInstanceOf(SyntaxError);
    expect(result.state).toEqual(EMPTY_INSTALL_STATE);
  });

  it('texto guardado quebrado se conserta sozinho: a visita contada regrava e a leitura seguinte vem limpa', () => {
    const { storage, data } = memoryStorage({ [KEY]: '{quebrado' });
    const first = loadInstallState(() => storage);
    expect(first.failed).toBe(true);
    const decision = decide({
      eligibility: 'card',
      surface: 'public',
      pathname: '/',
      preview: false,
      now: new Date(2026, 5, 10, 12),
      state: first.state,
    });
    // O estado voltou ao zero, então a visita do dia é contada e há o que gravar.
    expect(decision.persist).toBe(true);
    expect(saveInstallState(() => storage, decision.state).failed).toBe(false);
    expect(parseInstallState(data.get(KEY)!)).toEqual(decision.state);
    const second = loadInstallState(() => storage);
    expect(second).toEqual({
      state: decision.state,
      error: undefined,
      failed: false,
      writable: true,
    });
    expect(second.state.visits).toBe(1);
  });

  it('texto guardado fora do formato: estado vazio, sem falha', () => {
    const { storage } = memoryStorage({ [KEY]: valid({ extra: true }) });
    expect(loadInstallState(() => storage)).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: undefined,
      failed: false,
      writable: true,
    });
  });

  it('só lê a chave do cartão, nunca outra', () => {
    const { storage } = memoryStorage({ outra: valid({ visits: 9 }) });
    expect(loadInstallState(() => storage).state).toEqual(EMPTY_INSTALL_STATE);
    expect(storage.getItem).not.toHaveBeenCalledWith('outra');
  });

  it('getItem que devolve algo que não é texto nem nulo: estado vazio, sem falha', () => {
    const storage = { getItem: () => undefined, setItem: () => {} } as unknown as StorageLike;
    expect(loadInstallState(() => storage)).toEqual({
      state: EMPTY_INSTALL_STATE,
      error: undefined,
      failed: false,
      writable: true,
    });
  });
});

describe('saveInstallState', () => {
  const state: InstallState = { visits: 2, lastDay: '2026-06-10', dismissedAt: null, never: false };

  it('grava o texto serializado na chave versionada', () => {
    const { storage, data } = memoryStorage();
    expect(saveInstallState(() => storage, state)).toEqual({ error: undefined, failed: false });
    expect(storage.setItem).toHaveBeenCalledTimes(1);
    expect(storage.setItem).toHaveBeenCalledWith(KEY, serializeInstallState(state));
    expect(data.get(KEY)).toBe(serializeInstallState(state));
  });

  it('o que se grava volta igual na leitura (ida e volta pelo armazenamento)', () => {
    const { storage } = memoryStorage();
    const saved: InstallState = { visits: 5, lastDay: '2024-02-29', dismissedAt: 99, never: true };
    saveInstallState(() => storage, saved);
    expect(loadInstallState(() => storage)).toEqual({
      state: saved,
      error: undefined,
      failed: false,
      writable: true,
    });
  });

  it('setItem lança QuotaExceededError: nunca lança, devolve o erro ao chamador', () => {
    const error = new DOMException('Quota exceeded', 'QuotaExceededError');
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw error;
      },
    };
    let result: ReturnType<typeof saveInstallState> | undefined;
    expect(() => {
      result = saveInstallState(() => storage, state);
    }).not.toThrow();
    expect(result).toEqual({ error, failed: true });
    expect(result?.error).toBe(error);
  });

  it('o getter do localStorage lança SecurityError: devolve o erro, nada é gravado', () => {
    const error = new DOMException('The operation is insecure.', 'SecurityError');
    const result = saveInstallState(() => {
      throw error;
    }, state);
    expect(result.failed).toBe(true);
    expect(result.error).toBe(error);
  });

  it('armazenamento nulo: não grava e não falha', () => {
    expect(saveInstallState(() => null, state)).toEqual({ error: undefined, failed: false });
  });

  it('depois de uma falha de gravação, a leitura continua dando o estado anterior (zero)', () => {
    const storage: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('Quota exceeded', 'QuotaExceededError');
      },
    };
    expect(saveInstallState(() => storage, state).failed).toBe(true);
    expect(loadInstallState(() => storage).state).toEqual(EMPTY_INSTALL_STATE);
  });

  it('o texto gravado não leva nada além dos cinco campos do formato', () => {
    const { data, storage } = memoryStorage();
    saveInstallState(() => storage, { ...state, email: 'a@b.c' } as InstallState);
    expect(Object.keys(JSON.parse(data.get(KEY)!)).sort()).toEqual(
      ['dismissedAt', 'lastDay', 'never', 'v', 'visits'].sort(),
    );
  });
});
