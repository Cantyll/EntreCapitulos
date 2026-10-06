/*
 * Limites do conteúdo da página Sobre (etapa 8j). Os MESMOS números estão em
 * `supabase/migrations/…_site_about_page.sql` (função `site_page_content_problem`) e nos contadores do editor:
 * mudou aqui, muda lá. O banco tem a última palavra.
 */

export const ABOUT_CONTENT_VERSION = 1;

export const ABOUT_LIMITS = {
  /** O JSON inteiro, em bytes UTF-8 (a CHECK das tabelas confere o mesmo). */
  maxBytes: 128 * 1024,
  title: 120,
  bio: 300,
  photoAlt: 120,
  sectionsMax: 3,
  sectionTitle: 80,
  linksMax: 5,
  linkLabel: 40,
  linkUrl: 2048,
  stepsMin: 1,
  stepsMax: 6,
  stepTitle: 60,
  stepText: 400,
  ctaText: 200,
  /** `doc` > lista > item > parágrafo > texto: bem abaixo disto. Só protege o percurso do JSON. */
  richMaxDepth: 8,
} as const;
