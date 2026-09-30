import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  // Links com rota inexistente viram erro de tipo (tipos gerados por `next typegen`).
  typedRoutes: true,
};

export default nextConfig;
