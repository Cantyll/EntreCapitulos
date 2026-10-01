import { DynamicServerError } from 'next/dist/client/components/hooks-server-context';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SupabaseEnvError } from '@/lib/supabase/env';

import { deriveTheme } from './derive';
import { coverLike } from './fixtures';
import { extractPalette } from './palette';

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createClient = vi.fn((...args: unknown[]) => {
  void args;
  return { from };
});

vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: (...a: unknown[]) => createClient(...a) }));
// `cache` do React: aqui cada teste importa o módulo de novo, então não há memória entre eles.

const img = coverLike([
  [200, 40, 70],
  [30, 40, 120],
]);
const good = deriveTheme(extractPalette(img.data, img.width, img.height))!.tokens;

async function load() {
  vi.resetModules();
  return (await import('./server')).getSiteTheme;
}

describe('getSiteTheme', () => {
  let errorLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://abcdefghijklmnopqrst.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'sb_publishable_AbCdEfGhIjKlMnOpQrStUvWx');
    errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('devolve os tokens do livro em leitura', async () => {
    maybeSingle.mockResolvedValue({ data: { theme_tokens: good, theme_auto: true }, error: null });
    expect(await (await load())()).toEqual(good);
    expect(eq).toHaveBeenCalledWith('status', 'reading');
  });

  it('usa um cliente sem sessão e com cache por tag', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    await (
      await load()
    )();
    const options = createClient.mock.calls[0]![2] as { auth: Record<string, boolean> };
    expect(options.auth).toMatchObject({ persistSession: false, autoRefreshToken: false });
  });

  it.each([
    ['sem livro em leitura', { data: null, error: null }],
    ['tema automático desligado', { data: { theme_tokens: good, theme_auto: false }, error: null }],
    ['tokens nulos', { data: { theme_tokens: null, theme_auto: true }, error: null }],
    [
      'chave desconhecida só é ignorada, mas valor inválido anula',
      { data: { theme_tokens: { ...good, '--rose': 'url(x)' }, theme_auto: true }, error: null },
    ],
    [
      'faltando token',
      { data: { theme_tokens: { '--bg': '#FFFFFF' }, theme_auto: true }, error: null },
    ],
    [
      'sem contraste',
      { data: { theme_tokens: { ...good, '--ink': '#FFFFFF' }, theme_auto: true }, error: null },
    ],
  ])('tema padrão: %s', async (_label, result) => {
    maybeSingle.mockResolvedValue(result);
    expect(await (await load())()).toBeNull();
  });

  it('erro do banco: tema padrão, registrando só o resumo', async () => {
    maybeSingle.mockResolvedValue({
      data: null,
      error: Object.assign(new Error('segredo do banco'), {
        name: 'PostgrestError',
        code: 'PGRST301',
      }),
    });
    expect(await (await load())()).toBeNull();
    expect(errorLog).toHaveBeenCalledWith(
      'theme: getSiteTheme falhou',
      expect.objectContaining({ code: 'PGRST301' }),
    );
    expect(JSON.stringify(errorLog.mock.calls)).not.toContain('segredo');
  });

  it('exceção de rede: tema padrão', async () => {
    maybeSingle.mockRejectedValue(new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } }));
    expect(await (await load())()).toBeNull();
  });

  it('variável de ambiente ausente: tema padrão, sem derrubar nada', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '');
    expect(await (await load())()).toBeNull();
    expect(createClient).not.toHaveBeenCalled();
    expect(errorLog).toHaveBeenCalledWith(
      'theme: getSiteTheme falhou',
      expect.objectContaining({ name: 'SupabaseEnvError' }),
    );
    void SupabaseEnvError;
  });

  it('os erros internos do Next não são engolidos', async () => {
    const bailout = new DynamicServerError('Dynamic server usage');
    maybeSingle.mockRejectedValue(bailout);
    await expect((await load())()).rejects.toBe(bailout);
  });
});
