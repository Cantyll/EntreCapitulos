/*
 * Lógica da fita de capítulos, sem React nem DOM. Recebe o total do livro, o capítulo em que a
 * Agatha está (`current_chapter`) e as sessões publicadas VISÍVEIS para a pessoa (quem monta a lista
 * já aplicou o RLS: uma sessão só para membros não entra para um visitante), e devolve um segmento
 * por capítulo mais os rótulos de baixo ("S4", "próx.").
 *
 * Um capítulo até `current_chapter` sem sessão visível aparece como "lido", sem link: não dá para
 * abrir o que a pessoa não pode ler, e a fita não conta que existe.
 */

export type StripSession = { number: number; chapterFrom: number; chapterTo: number };

export type StripSegmentKind =
  /** Capítulo da sessão mais recente. */
  | 'last'
  /** Capítulo de uma sessão anterior (abre a sessão). */
  | 'session'
  /** Lido, mas sem sessão visível: sem link. */
  | 'read'
  /** Um dos próximos capítulos (a próxima sessão). */
  | 'next'
  | 'unread';

export type StripSegment = {
  chapter: number;
  kind: StripSegmentKind;
  /** Presente quando o segmento abre uma sessão. */
  session?: StripSession;
  /** Sessões ímpares e pares alternam o tom, para separar uma da outra. */
  tone: 0 | 1;
};

export type StripLabel = {
  kind: 'session' | 'last' | 'next';
  text: string;
  from: number;
  to: number;
};

export type ChapterStrip = {
  total: number;
  segments: StripSegment[];
  labels: StripLabel[];
  /** Os capítulos da próxima sessão (já sem os que têm sessão), ou `null`. */
  nextRange: { from: number; to: number } | null;
  last: StripSession | null;
};

/** Tamanho da próxima sessão, em capítulos (o mesmo padrão do editor de sessões). */
export const NEXT_SESSION_SIZE = 3;

export function nextChapterRange(
  current: number,
  total: number,
): { from: number; to: number } | null {
  if (total < 1 || current >= total) return null;
  const from = Math.max(0, current) + 1;
  return { from, to: Math.min(current + NEXT_SESSION_SIZE, total) };
}

export function buildChapterStrip(input: {
  total: number;
  current: number;
  sessions: readonly StripSession[];
}): ChapterStrip {
  const total = Math.max(0, Math.floor(input.total));
  const current = Math.min(Math.max(0, Math.floor(input.current)), total);

  // Só sessões que cabem no livro; o total é uma estimativa, e uma sessão além dele não desenha nada.
  const sessions = input.sessions
    .filter((s) => s.chapterFrom >= 1 && s.chapterFrom <= s.chapterTo && s.chapterFrom <= total)
    .map((s) => ({ ...s, chapterTo: Math.min(s.chapterTo, total) }))
    .sort((a, b) => a.number - b.number);

  const last = sessions.at(-1) ?? null;
  const owner = new Map<number, StripSession>();
  for (const session of sessions) {
    for (let c = session.chapterFrom; c <= session.chapterTo; c++) {
      if (!owner.has(c)) owner.set(c, session);
    }
  }

  const range = nextChapterRange(current, total);
  const nextChapters: number[] = [];
  if (range) {
    for (let c = range.from; c <= range.to; c++) if (!owner.has(c)) nextChapters.push(c);
  }
  const nextSet = new Set(nextChapters);

  const segments: StripSegment[] = [];
  for (let chapter = 1; chapter <= total; chapter++) {
    const session = owner.get(chapter);
    if (session) {
      segments.push({
        chapter,
        kind: session.number === last?.number ? 'last' : 'session',
        session,
        tone: (session.number % 2) as 0 | 1,
      });
    } else if (chapter <= current) {
      segments.push({ chapter, kind: 'read', tone: 0 });
    } else {
      segments.push({ chapter, kind: nextSet.has(chapter) ? 'next' : 'unread', tone: 0 });
    }
  }

  const labels: StripLabel[] = sessions.map((s) => ({
    kind: s.number === last?.number ? 'last' : 'session',
    text: `S${s.number}`,
    from: s.chapterFrom,
    to: s.chapterTo,
  }));
  if (nextChapters.length > 0) {
    labels.push({
      kind: 'next',
      text: 'próx.',
      from: nextChapters[0]!,
      to: nextChapters.at(-1)!,
    });
  }

  return {
    total,
    segments,
    labels,
    nextRange:
      nextChapters.length > 0 ? { from: nextChapters[0]!, to: nextChapters.at(-1)! } : null,
    last,
  };
}

/** Nome acessível de um segmento: o estado nunca depende só da cor. */
export function segmentLabel(segment: StripSegment): string {
  const base = `Capítulo ${segment.chapter}`;
  switch (segment.kind) {
    case 'last':
    case 'session':
      return `${base}, sessão ${segment.session!.number}`;
    case 'read':
      return `${base}, lido`;
    case 'next':
      return `${base}, próxima sessão`;
    case 'unread':
      return `${base}, ainda não lido`;
  }
}
