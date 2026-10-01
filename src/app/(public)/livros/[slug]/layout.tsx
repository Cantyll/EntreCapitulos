import { notFound } from 'next/navigation';
import type { ReactNode } from 'react';

import { getBookBySlug } from '@/lib/public/loaders';

/**
 * Livro que não existe é 404 de verdade (status HTTP 404). A checagem fica no layout, acima do
 * `loading.tsx`: dentro da página, o esqueleto já teria sido enviado com status 200.
 */
export default async function BookLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  if (!(await getBookBySlug(slug))) notFound();
  return children;
}
