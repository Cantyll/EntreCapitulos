/*
 * Content-Security-Policy. Função PURA (sem acesso a `process.env` nem a cabeçalhos): o proxy lê o ambiente e
 * entrega os valores aqui. Isso permite testar cada combinação.
 *
 * Decisões (ver "Cabeçalhos de segurança e CSP" no README):
 *  - Scripts: só com o nonce da requisição e 'strict-dynamic' (o que um script confiável carrega também é
 *    confiável). NUNCA 'unsafe-inline' em script-src. `'self'` fica só como reserva para navegadores sem
 *    suporte a nonce (com nonce presente os navegadores modernos o ignoram).
 *  - Estilos: 'unsafe-inline' é NECESSÁRIO. O React escreve `style="…"` em vários elementos, o tema da capa
 *    vai no `style` do <html> e o Next injeta <style> próprios. O risco que sobra (CSS injetado) é bem menor
 *    que o de script e não executa código. Se um dia o `style` inline sumir, troque por nonce.
 *  - `form-action` NÃO é definido: o Chrome bloqueia o redirecionamento do login do Google depois do envio do
 *    formulário se `form-action` não listar o destino final, e a lista de destinos do OAuth muda.
 *  - Em desenvolvimento, `'unsafe-eval'` (o React usa eval para remontar pilhas de erro) e WebSocket do HMR.
 */

export type CspOptions = {
  /** Nonce desta requisição (`generateNonce`). */
  nonce: string;
  /** `NODE_ENV === 'production'`. */
  production: boolean;
  /** `NEXT_PUBLIC_SUPABASE_URL`: de lá sai o host liberado para imagens e conexões. */
  supabaseUrl?: string | null;
  /** `VERCEL_ENV`: só `'preview'` libera a barra de comentários da Vercel. */
  vercelEnv?: string | null;
  /** A verificação do Cloudflare Turnstile está ligada (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`). */
  turnstile?: boolean;
  /** `CSP_REPORT_ONLY=true`: só relata, não bloqueia. */
  reportOnly?: boolean;
};

export type CspHeader = {
  name: 'Content-Security-Policy' | 'Content-Security-Policy-Report-Only';
  value: string;
};

const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';

/** Libera a barra de comentários da Vercel (lista da documentação da Vercel para o Toolbar). */
const VERCEL_TOOLBAR = {
  script: ['https://vercel.live'],
  connect: ['https://vercel.live', 'wss://ws-us3.pusher.com'],
  img: ['https://vercel.live', 'https://vercel.com'],
  frame: ['https://vercel.live'],
  style: ['https://vercel.live'],
  font: ['https://vercel.live', 'https://assets.vercel.com'],
} as const;

/** 16 bytes aleatórios em base64: único por requisição, imprevisível, aceito pelo Next. */
export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** `"true"` (sem diferenciar maiúsculas, ignorando espaços) liga o modo só-relatório. */
export function parseReportOnly(value: string | undefined | null): boolean {
  return (value ?? '').trim().toLowerCase() === 'true';
}

/**
 * Origem (`https://host[:porta]`) do Supabase, ou `null` se a variável faltar ou for inválida. Nunca lança:
 * a CSP não pode derrubar o site por causa de uma variável errada. `http:` só vale fora de produção (o
 * Supabase local).
 */
export function supabaseOrigin(url: string | null | undefined, production: boolean): string | null {
  try {
    const raw = url?.trim();
    if (!raw) return null;
    const parsed = new URL(raw);
    if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && !production)) {
      return parsed.origin;
    }
    return null;
  } catch {
    return null;
  }
}

/** Constrói o cabeçalho. O nonce precisa ser o MESMO que o proxy entrega ao Next (cabeçalho da requisição). */
export function buildCsp(options: CspOptions): CspHeader {
  const { nonce, production } = options;
  const supabase = supabaseOrigin(options.supabaseUrl, production);
  const preview = options.vercelEnv === 'preview';
  const toolbar = preview ? VERCEL_TOOLBAR : null;

  // `strict-dynamic` faz o navegador ignorar listas de hosts em script-src. A barra da Vercel é injetada
  // sem o nonce, então no PREVIEW ela precisa da lista de hosts: sem `strict-dynamic` só ali.
  const scriptSrc = [
    "'self'",
    `'nonce-${nonce}'`,
    ...(preview ? [] : ["'strict-dynamic'"]),
    ...(production ? [] : ["'unsafe-eval'"]),
    ...(options.turnstile ? [TURNSTILE_ORIGIN] : []),
    ...(toolbar ? toolbar.script : []),
  ];

  const connectSrc = [
    "'self'",
    ...(supabase ? [supabase] : []),
    ...(production ? [] : ['ws://localhost:*', 'ws://127.0.0.1:*']),
    ...(options.turnstile ? [TURNSTILE_ORIGIN] : []),
    ...(toolbar ? toolbar.connect : []),
  ];

  const frameSrc = [
    ...(options.turnstile ? [TURNSTILE_ORIGIN] : []),
    ...(toolbar ? toolbar.frame : []),
  ];

  const directives: [string, readonly string[]][] = [
    ['default-src', ["'self'"]],
    ['script-src', scriptSrc],
    ['style-src', ["'self'", "'unsafe-inline'", ...(toolbar ? toolbar.style : [])]],
    [
      'img-src',
      [
        "'self'",
        'data:',
        'blob:',
        ...(supabase ? [supabase] : []),
        ...(toolbar ? toolbar.img : []),
      ],
    ],
    ['font-src', ["'self'", ...(toolbar ? toolbar.font : [])]],
    ['connect-src', connectSrc],
    ['frame-src', frameSrc.length > 0 ? frameSrc : ["'none'"]],
    ['frame-ancestors', ["'none'"]],
    ['base-uri', ["'self'"]],
    ['object-src', ["'none'"]],
    ['manifest-src', ["'self'"]],
  ];

  const parts = directives.map(([name, sources]) => `${name} ${sources.join(' ')}`);
  // No modo só-relatório o navegador ignora esta diretiva e avisa no console: só entra quando bloqueia.
  if (production && !options.reportOnly) parts.push('upgrade-insecure-requests');

  return {
    name: options.reportOnly ? 'Content-Security-Policy-Report-Only' : 'Content-Security-Policy',
    value: parts.join('; '),
  };
}
