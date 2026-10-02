import type { NextConfig } from 'next';

type RemotePatterns = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>;

/**
 * Capas vêm do bucket público `covers` do Supabase. O host sai de NEXT_PUBLIC_SUPABASE_URL e o
 * caminho fica restrito ao bucket. Esta função NUNCA lança: sem a variável (ou com um valor
 * inválido) devolve `[]`, o build segue e a interface usa a capa gerada por CSS. `http://` só vale
 * para o Supabase local, fora de produção.
 */
function coverImagePatterns(): RemotePatterns {
  try {
    const raw = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!raw) return [];
    const url = new URL(raw);
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const https = url.protocol === 'https:';
    if (!https && !(url.protocol === 'http:' && local && process.env.NODE_ENV !== 'production')) {
      return [];
    }
    return [
      {
        protocol: https ? 'https' : 'http',
        hostname: url.hostname,
        ...(url.port ? { port: url.port } : {}),
        pathname: '/storage/v1/object/public/covers/**',
      },
    ];
  } catch {
    return [];
  }
}

/**
 * Cabeçalhos de segurança que não mudam por requisição. A Content-Security-Policy (que leva um nonce por
 * requisição) é montada no `src/proxy.ts`.
 *
 *  - HSTS de 2 anos, SEM `includeSubDomains` e SEM `preload`: o domínio pode ter subdomínios que ainda não
 *    servem HTTPS, e `preload` é praticamente irreversível. Só vale em HTTPS (o navegador ignora em HTTP).
 *  - Permissions-Policy: desliga só o que o site nunca usa (câmera, microfone e localização).
 *  - X-Frame-Options: reserva para navegadores sem `frame-ancestors`; a CSP já proíbe ser embutido.
 */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000' },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Links com rota inexistente viram erro de tipo (tipos gerados por `next typegen`).
  typedRoutes: true,
  // Desde o Next 16.3 o `next dev` escreve um bloco de instruções para agentes de IA no CLAUDE.md.
  // O CLAUDE.md deste projeto é mantido à mão, então a geração fica desligada.
  agentRules: false,
  images: {
    remotePatterns: coverImagePatterns(),
    // O otimizador recusa IPs locais; só o Supabase local (desenvolvimento) precisa disto.
    dangerouslyAllowLocalIP: process.env.NODE_ENV !== 'production',
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  experimental: {
    // Habilita forbidden() e app/forbidden.tsx: página 403 de verdade para quem não tem papel.
    authInterrupts: true,
  },
};

export default nextConfig;
