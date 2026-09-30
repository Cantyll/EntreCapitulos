import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Links com rota inexistente viram erro de tipo (tipos gerados por `next typegen`).
  typedRoutes: true,
  // Desde o Next 16.3 o `next dev` escreve um bloco de instruções para agentes de IA no CLAUDE.md.
  // O CLAUDE.md deste projeto é mantido à mão, então a geração fica desligada.
  agentRules: false,
  experimental: {
    // Libera `forbidden()` e o arquivo `forbidden.tsx` (página 403 de verdade, com status 403).
    // No Next 16.3 ainda é experimental.
    authInterrupts: true,
  },
};

export default nextConfig;
