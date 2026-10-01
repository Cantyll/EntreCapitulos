import { describe, expect, it } from 'vitest';

import { deriveTheme } from './derive';
import { coverLike, solid } from './fixtures';
import { extractPalette } from './palette';
import { parsePalette, parseTokens, THEME_KEYS, tokensToStyle } from './tokens';

const valid = () => {
  const img = coverLike([
    [200, 40, 70],
    [30, 40, 120],
  ]);
  return deriveTheme(extractPalette(img.data, img.width, img.height))!.tokens;
};

describe('parseTokens (allow-list)', () => {
  it('aceita o conjunto completo e normaliza para maiúsculas', () => {
    const tokens = valid();
    const lower = Object.fromEntries(Object.entries(tokens).map(([k, v]) => [k, v.toLowerCase()]));
    expect(parseTokens(lower)).toEqual(tokens);
  });

  it('ignora chaves desconhecidas', () => {
    const parsed = parseTokens({ ...valid(), '--evil': '#000000', background: 'url(x)' })!;
    expect(Object.keys(parsed).sort()).toEqual([...THEME_KEYS].sort());
  });

  it.each([
    'red',
    '#FFF',
    '#GGGGGG',
    '#12345',
    '#1234567',
    'url(http://x)',
    'rgb(0,0,0)',
    '#FF0000;color:red',
    '',
    5,
    null,
    undefined,
  ])('rejeita o valor %j', (value) => {
    expect(parseTokens({ ...valid(), '--rose': value })).toBeNull();
  });

  it('rejeita quando falta uma chave', () => {
    const { '--ink': _ink, ...rest } = valid();
    void _ink;
    expect(parseTokens(rest)).toBeNull();
  });

  it.each([null, undefined, 'x', 5, [], [valid()]])('rejeita entrada %j', (input) => {
    expect(parseTokens(input)).toBeNull();
  });

  it('não confia em propriedade herdada', () => {
    const proto = Object.create(valid());
    expect(parseTokens(proto)).toBeNull();
  });

  it('o objeto de style só tem as 17 chaves', () => {
    expect(Object.keys(tokensToStyle(valid())).sort()).toEqual([...THEME_KEYS].sort());
  });

  it('a capa em cinza nem chega a ter tokens', () => {
    const img = solid([120, 120, 120]);
    expect(deriveTheme(extractPalette(img.data, img.width, img.height))).toBeNull();
  });
});

describe('parsePalette', () => {
  it('aceita e limpa', () => {
    expect(
      parsePalette({
        accent: '#aa2244',
        colors: [
          { hex: '#aa2244', share: 0.6 },
          { hex: 'bad', share: 0.2 },
          { hex: '#112233', share: 5 },
        ],
      }),
    ).toEqual({ accent: '#AA2244', colors: [{ hex: '#AA2244', share: 0.6 }] });
  });

  it.each([
    null,
    [],
    { colors: [], accent: '#AA2244' },
    { colors: [{ hex: '#AA2244', share: 1 }], accent: 'x' },
  ])('rejeita %j', (v) => {
    expect(parsePalette(v)).toBeNull();
  });
});
