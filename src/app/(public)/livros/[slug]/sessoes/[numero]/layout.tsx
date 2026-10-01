import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { loadSessionPage } from '@/lib/public/loaders';
import { parseSessionNumber } from '@/lib/public/params';

/**
 * Número inválido e sessão que não existe para quem está logado são 404 de verdade (status HTTP 404),
 * decididos aqui, acima do `loading.tsx`. Visitante deslogado que não pode ler recebe a página "Entre
 * para continuar" (200), a mesma para sessão só para membros e para sessão que não existe. Os dados
 * são os mesmos da página: o `cache` do React evita repetir qualquer consulta.
 */
export default async function SessionLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string; numero: string }>;
}) {
  const { slug, numero } = await params;
  const number = parseSessionNumber(numero);
  if (number === null) notFound();
  const data = await loadSessionPage(slug, number);
  if (data.kind === 'not-found') notFound();
  return children;
}
