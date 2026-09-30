'use client';

import { usePathname } from 'next/navigation';

import { getAdminTitle } from '@/lib/navigation';

/** Título da página no topo do painel. O layout persiste entre páginas, então ele lê a rota. */
export function AdminTitle({ className }: { className?: string }) {
  const pathname = usePathname();
  return <h1 className={className}>{getAdminTitle(pathname)}</h1>;
}
