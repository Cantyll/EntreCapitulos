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
  experimental: {
    // Habilita forbidden() e app/forbidden.tsx: página 403 de verdade para quem não tem papel.
    authInterrupts: true,
  },
};

export default nextConfig;
