import { describe, expect, it } from 'vitest';

import { buildCsp, generateNonce, parseReportOnly, supabaseOrigin, type CspOptions } from './csp';

const base: CspOptions = {
  nonce: 'abc123+/=',
  production: true,
  supabaseUrl: 'https://abcdefghijklmnopqrst.supabase.co',
};

const directive = (value: string, name: string): string[] => {
  const found = value.split('; ').find((part) => part === name || part.startsWith(`${name} `));
  return found ? found.split(' ').slice(1) : [];
};

describe('generateNonce', () => {
  it('muda a cada chamada e é base64 aceito pelo Next', () => {
    const nonces = new Set(Array.from({ length: 200 }, () => generateNonce()));
    expect(nonces.size).toBe(200);
    for (const nonce of nonces) {
      expect(nonce).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(atob(nonce)).toHaveLength(16);
    }
  });
});

describe('buildCsp (produção)', () => {
  const { name, value } = buildCsp(base);

  it('usa o cabeçalho que bloqueia', () => {
    expect(name).toBe('Content-Security-Policy');
  });

  it('scripts: nonce e strict-dynamic, SEM unsafe-inline e SEM unsafe-eval', () => {
    const script = directive(value, 'script-src');
    expect(script).toContain("'nonce-abc123+/='");
    expect(script).toContain("'strict-dynamic'");
    expect(script).not.toContain("'unsafe-inline'");
    expect(script).not.toContain("'unsafe-eval'");
  });

  it('estilos: unsafe-inline (o React e o tema usam style inline)', () => {
    expect(directive(value, 'style-src')).toEqual(["'self'", "'unsafe-inline'"]);
  });

  it('não define form-action (o login do Google precisa redirecionar)', () => {
    expect(value).not.toContain('form-action');
  });

  it('não ser embutido, base, objetos e manifesto', () => {
    expect(directive(value, 'frame-ancestors')).toEqual(["'none'"]);
    expect(directive(value, 'base-uri')).toEqual(["'self'"]);
    expect(directive(value, 'object-src')).toEqual(["'none'"]);
    expect(directive(value, 'manifest-src')).toEqual(["'self'"]);
    expect(directive(value, 'default-src')).toEqual(["'self'"]);
    expect(directive(value, 'font-src')).toEqual(["'self'"]);
    expect(directive(value, 'frame-src')).toEqual(["'none'"]);
  });

  it('imagens e conexões: o próprio site, blob/data nas imagens e SÓ o host do Supabase', () => {
    expect(directive(value, 'img-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://abcdefghijklmnopqrst.supabase.co',
    ]);
    expect(directive(value, 'connect-src')).toEqual([
      "'self'",
      'https://abcdefghijklmnopqrst.supabase.co',
    ]);
  });

  it('upgrade-insecure-requests só em produção', () => {
    expect(value.split('; ')).toContain('upgrade-insecure-requests');
    expect(buildCsp({ ...base, production: false }).value).not.toContain(
      'upgrade-insecure-requests',
    );
  });

  it('nada da Vercel nem da Cloudflare em produção sem Turnstile', () => {
    expect(value).not.toContain('vercel.live');
    expect(value).not.toContain('cloudflare');
    expect(value).not.toContain('pusher');
  });

  it('nenhum curinga solto', () => {
    expect(value).not.toMatch(/(^|\s)\*(\s|;|$)/);
    expect(value).not.toMatch(/\shttps:(\s|;|$)/);
  });
});

describe('buildCsp (variações)', () => {
  it('só-relatório: outro cabeçalho, mesma política', () => {
    const blocking = buildCsp(base);
    const report = buildCsp({ ...base, reportOnly: true });
    expect(report.name).toBe('Content-Security-Policy-Report-Only');
    expect(report.value).toBe(blocking.value);
  });

  it('desenvolvimento: unsafe-eval e WebSocket do HMR, sem upgrade-insecure-requests', () => {
    const dev = buildCsp({ ...base, production: false, supabaseUrl: 'http://127.0.0.1:54321' });
    expect(directive(dev.value, 'script-src')).toContain("'unsafe-eval'");
    expect(directive(dev.value, 'connect-src')).toEqual(
      expect.arrayContaining(['ws://localhost:*', 'ws://127.0.0.1:*', 'http://127.0.0.1:54321']),
    );
    expect(directive(dev.value, 'script-src')).not.toContain("'unsafe-inline'");
  });

  it('a barra de comentários da Vercel só em preview', () => {
    const preview = buildCsp({ ...base, vercelEnv: 'preview' });
    expect(directive(preview.value, 'script-src')).toContain('https://vercel.live');
    expect(directive(preview.value, 'connect-src')).toEqual(
      expect.arrayContaining(['https://vercel.live', 'wss://ws-us3.pusher.com']),
    );
    expect(directive(preview.value, 'frame-src')).toEqual(['https://vercel.live']);
    expect(directive(preview.value, 'font-src')).toContain('https://assets.vercel.com');
    // A barra é injetada sem nonce: no preview, sem strict-dynamic (que ignoraria a lista de hosts).
    expect(directive(preview.value, 'script-src')).not.toContain("'strict-dynamic'");
    expect(directive(preview.value, 'script-src')).not.toContain("'unsafe-inline'");
    for (const env of ['production', 'development', undefined, null, '']) {
      expect(buildCsp({ ...base, vercelEnv: env }).value).not.toContain('vercel.live');
    }
  });

  it('Turnstile só quando habilitado: script, frame e conexão', () => {
    const on = buildCsp({ ...base, turnstile: true });
    expect(directive(on.value, 'script-src')).toContain('https://challenges.cloudflare.com');
    expect(directive(on.value, 'frame-src')).toEqual(['https://challenges.cloudflare.com']);
    expect(directive(on.value, 'connect-src')).toContain('https://challenges.cloudflare.com');
    expect(directive(on.value, 'script-src')).toContain("'strict-dynamic'");
    expect(buildCsp({ ...base, turnstile: false }).value).not.toContain('cloudflare');
  });

  it('o nonce vai exatamente como foi pedido, e só no script-src', () => {
    const { value } = buildCsp({ ...base, nonce: 'XYZ' });
    expect(value.match(/nonce-/g)).toHaveLength(1);
    expect(directive(value, 'script-src')).toContain("'nonce-XYZ'");
  });

  it('um nonce diferente por requisição gera políticas diferentes só nesse ponto', () => {
    const a = buildCsp({ ...base, nonce: generateNonce() }).value;
    const b = buildCsp({ ...base, nonce: generateNonce() }).value;
    expect(a).not.toBe(b);
    expect(a.replace(/nonce-[^']+/, '')).toBe(b.replace(/nonce-[^']+/, ''));
  });
});

describe('supabaseOrigin', () => {
  it.each([
    ['https://abc.supabase.co', true, 'https://abc.supabase.co'],
    ['https://abc.supabase.co/rest/v1/', true, 'https://abc.supabase.co'],
    ['https://localhost:54443', true, 'https://localhost:54443'],
    ['http://127.0.0.1:54321', false, 'http://127.0.0.1:54321'],
    ['http://127.0.0.1:54321', true, null],
    ['javascript:alert(1)', false, null],
    ['não é uma url', false, null],
    ['', false, null],
    [undefined, false, null],
    [null, true, null],
  ])('%s (produção=%s) → %s', (url, production, expected) => {
    expect(supabaseOrigin(url, production)).toBe(expected);
  });

  it('sem o host do Supabase a CSP continua válida (sem lançar)', () => {
    const { value } = buildCsp({ ...base, supabaseUrl: undefined });
    expect(directive(value, 'connect-src')).toEqual(["'self'"]);
    expect(directive(value, 'img-src')).toEqual(["'self'", 'data:', 'blob:']);
  });
});

describe('parseReportOnly', () => {
  it.each([
    ['true', true],
    ['TRUE', true],
    [' true ', true],
    ['false', false],
    ['1', false],
    ['', false],
    [undefined, false],
    [null, false],
  ])('%j → %s', (value, expected) => {
    expect(parseReportOnly(value)).toBe(expected);
  });
});
