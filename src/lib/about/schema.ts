import '@/lib/zod-setup';
import * as z from 'zod';

import { ABOUT_CONTENT_VERSION, ABOUT_LIMITS } from './limits';
import {
  canonicalizeRichDoc,
  isRichDocDeepEnough,
  isRichDocEmpty,
  richDocSchema,
  type RichDoc,
} from './rich-text';
import { charCount, normalizeLine, normalizeMultiline } from './text';
import { isSafeLinkUrl, isSitePhotoPath } from './urls';

/*
 * Conteúdo da página Sobre (etapa 8j): ESTRUTURADO, não uma página livre, para o layout nunca quebrar. O servidor
 * valida com este esquema ao salvar e ao ler (o `/sobre` público confere o que vem do banco antes de mostrar); o banco
 * confere o que dá para conferir barato (`site_page_content_problem`: tamanho, chaves, contagens, comprimentos,
 * links https e o caminho da foto). Os limites estão em `limits.ts`.
 *
 *  - `title`: o título da página (o `<h1>`). `intro`: o texto de abertura (texto rico). `bio`: a bio curta da autora.
 *  - `photo`: foto opcional (`site/sobre/<uuid>.webp`, gerada pelo servidor) com texto alternativo OBRIGATÓRIO.
 *  - `sections`: até 3 seções extras (título e texto rico), na ordem escolhida, depois da abertura.
 *  - `links`: até 5 links https (rótulo e URL), na ordem escolhida.
 *  - `stats`, `howItWorks`, `cta`: blocos que se mostram ou se ocultam. Os Combinados e "Leia como aplicativo" NÃO
 *    estão aqui: são do código e não se ocultam.
 * O nome da autora não está aqui: vem de `src/lib/site.ts`.
 */

export type AboutPhoto = { path: string; alt: string };
export type AboutSection = { title: string; body: RichDoc };
export type AboutLink = { label: string; url: string };
export type AboutStep = { title: string; text: string };

export type AboutContent = {
  v: 1;
  title: string;
  intro: RichDoc;
  bio: string;
  photo: AboutPhoto | null;
  sections: AboutSection[];
  links: AboutLink[];
  stats: { visible: boolean };
  howItWorks: { visible: boolean; steps: AboutStep[] };
  cta: { visible: boolean; text: string };
};

/** Texto de 1 linha com tamanho entre `min` e `max` caracteres (por code point, como o banco). */
const sized = (min: number, max: number, empty: string, long: string) =>
  z
    .string({ error: empty })
    .refine((value) => charCount(value) >= min, empty)
    .refine((value) => charCount(value) <= max, long);

const photoSchema = z.strictObject({
  path: z.string().refine(isSitePhotoPath, 'A foto não é válida. Envie a imagem de novo.'),
  alt: sized(
    1,
    ABOUT_LIMITS.photoAlt,
    'Descreva a foto no texto alternativo.',
    `O texto alternativo da foto passa de ${ABOUT_LIMITS.photoAlt} caracteres.`,
  ),
});

const sectionSchema = z.strictObject({
  title: sized(
    1,
    ABOUT_LIMITS.sectionTitle,
    'Escreva o título da seção.',
    `O título da seção passa de ${ABOUT_LIMITS.sectionTitle} caracteres.`,
  ),
  body: richDocSchema,
});

const linkSchema = z.strictObject({
  label: sized(
    1,
    ABOUT_LIMITS.linkLabel,
    'Escreva o texto do link.',
    `O texto do link passa de ${ABOUT_LIMITS.linkLabel} caracteres.`,
  ),
  url: z
    .string({ error: 'Informe o endereço do link.' })
    .refine(isSafeLinkUrl, 'Use um endereço começando com https:// (sem usuário nem senha).'),
});

const stepSchema = z.strictObject({
  title: sized(
    1,
    ABOUT_LIMITS.stepTitle,
    'Escreva o título do passo.',
    `O título do passo passa de ${ABOUT_LIMITS.stepTitle} caracteres.`,
  ),
  text: sized(
    1,
    ABOUT_LIMITS.stepText,
    'Escreva o texto do passo.',
    `O texto do passo passa de ${ABOUT_LIMITS.stepText} caracteres.`,
  ),
});

export const aboutContentSchema = z.strictObject({
  v: z.literal(ABOUT_CONTENT_VERSION),
  title: sized(
    1,
    ABOUT_LIMITS.title,
    'Escreva o título da página.',
    `O título passa de ${ABOUT_LIMITS.title} caracteres.`,
  ),
  intro: richDocSchema,
  bio: sized(0, ABOUT_LIMITS.bio, '', `A bio passa de ${ABOUT_LIMITS.bio} caracteres.`),
  photo: photoSchema.nullable(),
  sections: z
    .array(sectionSchema)
    .max(ABOUT_LIMITS.sectionsMax, `Use no máximo ${ABOUT_LIMITS.sectionsMax} seções extras.`),
  links: z
    .array(linkSchema)
    .max(ABOUT_LIMITS.linksMax, `Use no máximo ${ABOUT_LIMITS.linksMax} links.`),
  stats: z.strictObject({ visible: z.boolean() }),
  howItWorks: z.strictObject({
    visible: z.boolean(),
    steps: z
      .array(stepSchema)
      .min(ABOUT_LIMITS.stepsMin, 'Deixe pelo menos 1 passo em "Como funciona".')
      .max(ABOUT_LIMITS.stepsMax, `Use no máximo ${ABOUT_LIMITS.stepsMax} passos.`),
  }),
  cta: z.strictObject({
    visible: z.boolean(),
    text: sized(
      1,
      ABOUT_LIMITS.ctaText,
      'Escreva o texto da chamada final.',
      `O texto da chamada final passa de ${ABOUT_LIMITS.ctaText} caracteres.`,
    ),
  }),
});

export type AboutIssue = 'too_large' | 'too_deep' | 'invalid';
export type AboutFieldError = { path: string; message: string };

export type ParsedAbout =
  { ok: true; content: AboutContent } | { ok: false; issue: AboutIssue; fields: AboutFieldError[] };

export const ABOUT_ISSUE_MESSAGES: Record<AboutIssue, string> = {
  too_large: 'O conteúdo ficou grande demais (limite de 128 KB). Encurte algum texto.',
  too_deep: 'Algum texto tem listas aninhadas demais.',
  invalid: 'Algum campo não está válido. Confira os avisos nos campos.',
};

/** Tamanho em bytes UTF-8, como o banco o vê. */
export function aboutBytes(input: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(input)).length;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/**
 * Normaliza os textos simples (sem invisíveis, espaços e quebras, NFC) e o `https://` de um link digitado sem
 * esquema, SEM mudar a forma: o que não é do formato esperado passa intacto e o zod o recusa. Idempotente.
 */
export function normalizeAbout(input: unknown): unknown {
  if (!isObject(input)) return input;
  const out: Record<string, unknown> = { ...input };
  const line = (value: unknown) => (typeof value === 'string' ? normalizeLine(value) : value);
  const multi = (value: unknown) => (typeof value === 'string' ? normalizeMultiline(value) : value);
  const list = (value: unknown, each: (item: unknown) => unknown) =>
    Array.isArray(value) ? value.map(each) : value;
  const withKeys = (
    item: unknown,
    fn: (obj: Record<string, unknown>) => Record<string, unknown>,
  ) => (isObject(item) ? fn({ ...item }) : item);

  out.title = line(out.title);
  out.bio = multi(out.bio);
  if (isObject(out.photo)) out.photo = withKeys(out.photo, (p) => ({ ...p, alt: line(p.alt) }));
  out.sections = list(out.sections, (s) => withKeys(s, (o) => ({ ...o, title: line(o.title) })));
  out.links = list(out.links, (l) =>
    withKeys(l, (o) => ({
      ...o,
      label: line(o.label),
      url: typeof o.url === 'string' ? o.url.trim() : o.url,
    })),
  );
  if (isObject(out.howItWorks)) {
    out.howItWorks = withKeys(out.howItWorks, (h) => ({
      ...h,
      steps: list(h.steps, (s) =>
        withKeys(s, (o) => ({ ...o, title: line(o.title), text: multi(o.text) })),
      ),
    }));
  }
  if (isObject(out.cta)) out.cta = withKeys(out.cta, (c) => ({ ...c, text: multi(c.text) }));
  return out;
}

function fieldErrors(error: z.ZodError): AboutFieldError[] {
  const seen = new Set<string>();
  const out: AboutFieldError[] = [];
  for (const issue of error.issues) {
    const path = issue.path.filter((p) => typeof p !== 'symbol').join('.');
    // Um nó ou marca recusado dentro de um texto rico vem com um caminho longo: vale um aviso só, no campo.
    const richAt = /^(intro|sections\.\d+\.body)\b/.exec(path)?.[0];
    const key = richAt ?? path;
    const message = richAt
      ? 'O texto tem algo que o editor não aceita (só parágrafo, negrito, itálico, lista e link).'
      : issue.message;
    if (seen.has(key + message)) continue;
    seen.add(key + message);
    out.push({ path: key, message });
  }
  return out;
}

export type ParseAboutOptions = {
  /**
   * Regras só da publicação: a abertura e o texto de cada seção extra precisam ter texto. O rascunho aceita texto
   * rico vazio (a pessoa ainda está escrevendo).
   */
  forPublish?: boolean;
};

/**
 * Valida o conteúdo vindo do cliente ou do banco. Confere tamanho e profundidade ANTES do zod (um JSON enorme ou
 * fundo demais nunca percorre o esquema), normaliza os textos simples e devolve a forma canônica.
 */
export function parseAbout(input: unknown, options: ParseAboutOptions = {}): ParsedAbout {
  if (!isObject(input)) return { ok: false, issue: 'invalid', fields: [] };
  if (aboutBytes(input) > ABOUT_LIMITS.maxBytes)
    return { ok: false, issue: 'too_large', fields: [] };
  const richDocs = [
    input.intro,
    ...(Array.isArray(input.sections)
      ? input.sections.map((s) => (isObject(s) ? s.body : undefined))
      : []),
  ];
  if (richDocs.some((doc) => doc !== undefined && !isRichDocDeepEnough(doc))) {
    return { ok: false, issue: 'too_deep', fields: [] };
  }

  const parsed = aboutContentSchema.safeParse(normalizeAbout(input));
  if (!parsed.success) return { ok: false, issue: 'invalid', fields: fieldErrors(parsed.error) };

  const content = canonicalizeAbout(parsed.data as AboutContent);
  const extra: AboutFieldError[] = [];
  if (options.forPublish) {
    if (isRichDocEmpty(content.intro)) {
      extra.push({ path: 'intro', message: 'Escreva o texto de abertura antes de publicar.' });
    }
    content.sections.forEach((section, index) => {
      if (isRichDocEmpty(section.body)) {
        extra.push({
          path: `sections.${index}.body`,
          message: 'Escreva o texto da seção ou remova a seção antes de publicar.',
        });
      }
    });
  }
  if (extra.length > 0) return { ok: false, issue: 'invalid', fields: extra };
  // O tamanho final (depois de canonicalizar) também precisa caber.
  if (aboutBytes(content) > ABOUT_LIMITS.maxBytes)
    return { ok: false, issue: 'too_large', fields: [] };
  return { ok: true, content };
}

/** Forma guardada no banco: textos ricos canônicos (links só com `href`, `attrs` em objetos comuns). Idempotente. */
export function canonicalizeAbout(content: AboutContent): AboutContent {
  return {
    ...content,
    intro: canonicalizeRichDoc(content.intro),
    sections: content.sections.map((section) => ({
      ...section,
      body: canonicalizeRichDoc(section.body),
    })),
  };
}
