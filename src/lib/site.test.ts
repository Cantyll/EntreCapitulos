import { describe, expect, it } from 'vitest';

import {
  calendarDateTime,
  formatCalendarDay,
  formatCalendarMonthYear,
  formatDayMonth,
  formatFullDate,
  formatRatingNumber,
  isRecent,
} from './site';

describe('datas em Brasília', () => {
  it('23h30 de Brasília não vira o dia seguinte (02h30 UTC do dia 28)', () => {
    expect(formatDayMonth('2026-09-28T02:30:00Z')).toBe('27 de setembro');
    expect(formatFullDate('2026-09-28T02:30:00Z')).toBe('27 de setembro de 2026');
  });

  it('meia-noite UTC ainda é a noite anterior em Brasília (UTC-3)', () => {
    expect(formatDayMonth('2026-10-01T00:00:00Z')).toBe('30 de setembro');
  });

  it('02h59 UTC é 23h59 de Brasília; 03h00 UTC já é o dia seguinte', () => {
    expect(formatDayMonth('2026-09-28T02:59:59Z')).toBe('27 de setembro');
    expect(formatDayMonth('2026-09-28T03:00:00Z')).toBe('28 de setembro');
  });

  it('o timestamptz do PostgREST (com microssegundos e +00:00)', () => {
    expect(formatDayMonth('2026-09-27T13:00:00.123456+00:00')).toBe('27 de setembro');
  });

  it('aceita Date', () => {
    expect(formatDayMonth(new Date('2026-01-05T15:00:00Z'))).toBe('5 de janeiro');
  });

  it('valor inválido vira texto vazio, nunca "Invalid Date"', () => {
    expect(formatDayMonth('não é data')).toBe('');
    expect(formatFullDate('')).toBe('');
  });
});

describe('datas de calendário (sem fuso)', () => {
  it('"2026-09-02" é sempre 2 de setembro', () => {
    expect(formatCalendarDay('2026-09-02')).toBe('2 de setembro');
    expect(formatCalendarMonthYear('2026-08-30')).toBe('agosto de 2026');
  });

  it('o primeiro dia do mês não volta para o mês anterior', () => {
    expect(formatCalendarMonthYear('2026-09-01')).toBe('setembro de 2026');
    expect(formatCalendarDay('2026-01-01')).toBe('1 de janeiro');
  });

  it.each(['2026-02-30', '2026-13-01', '26-09-02', '', 'ontem', '2026-09-02T10:00:00Z'])(
    'recusa %j',
    (value) => {
      expect(formatCalendarDay(value)).toBe('');
      expect(formatCalendarMonthYear(value)).toBe('');
      expect(calendarDateTime(value)).toBeUndefined();
    },
  );

  it('calendarDateTime devolve o próprio texto válido', () => {
    expect(calendarDateTime('2026-09-02')).toBe('2026-09-02');
  });
});

describe('formatRatingNumber', () => {
  it.each([
    [4.5, '4,5'],
    [5, '5,0'],
    [3, '3,0'],
    [0.5, '0,5'],
  ])('%s → %s', (n, text) => {
    expect(formatRatingNumber(n)).toBe(text);
  });
});

describe('isRecent ("Nova")', () => {
  const now = new Date('2026-10-01T15:00:00Z');
  it('publicada há menos de 7 dias é nova', () => {
    expect(isRecent('2026-09-28T10:00:00Z', now)).toBe(true);
    expect(isRecent('2026-10-01T14:59:00Z', now)).toBe(true);
  });
  it('com 7 dias ou mais, já não é', () => {
    expect(isRecent('2026-09-24T15:00:00Z', now)).toBe(false);
    expect(isRecent('2026-09-01T10:00:00Z', now)).toBe(false);
  });
  it('sem data, data inválida ou no futuro: não é nova', () => {
    expect(isRecent(null, now)).toBe(false);
    expect(isRecent('lixo', now)).toBe(false);
    expect(isRecent('2026-10-05T10:00:00Z', now)).toBe(false);
  });
});
