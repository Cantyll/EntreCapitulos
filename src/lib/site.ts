/*
 * Identidade do site e formatação de datas em um só lugar: cabeçalho, rodapé, bylines e /sobre
 * leem daqui. Texto de produto (a frase, o nome da autora) muda aqui e em mais nenhum arquivo.
 */

export const SITE_NAME = 'Entre Capítulos';

export const SITE_TAGLINE = 'Um clube de leitura em sessões, feito com carinho.';

export const SITE_DESCRIPTION =
  'Blog e clube de leitura em sessões, com discussão por capítulo e controle de spoiler.';

export const AUTHOR = {
  name: 'Agatha Montinelli',
  firstName: 'Agatha',
  initials: 'AM',
} as const;

/** Todo horário mostrado ao público é o de Brasília: o banco guarda em UTC. */
export const SITE_TIME_ZONE = 'America/Sao_Paulo';

type DateInput = string | Date;

function toDate(value: DateInput): Date | null {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function format(date: Date, options: Intl.DateTimeFormatOptions, timeZone: string): string {
  return new Intl.DateTimeFormat('pt-BR', { ...options, timeZone }).format(date);
}

/** "27 de setembro". Instante (`timestamptz`) mostrado no dia de Brasília. */
export function formatDayMonth(value: DateInput): string {
  const date = toDate(value);
  return date ? format(date, { day: 'numeric', month: 'long' }, SITE_TIME_ZONE) : '';
}

/** "5 de outubro de 2026, 14:30" (horário de Brasília), para a auditoria. */
export function formatDateTime(value: DateInput): string {
  const date = toDate(value);
  return date
    ? format(
        date,
        { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' },
        SITE_TIME_ZONE,
      )
    : '';
}

/** "27 de setembro de 2026". */
export function formatFullDate(value: DateInput): string {
  const date = toDate(value);
  return date
    ? format(date, { day: 'numeric', month: 'long', year: 'numeric' }, SITE_TIME_ZONE)
    : '';
}

/**
 * "2026-10-04": o DIA de calendário de um instante no fuso de Brasília, para nomes de arquivo. Às 23h30 de
 * Brasília o instante já é do dia seguinte em UTC, e o nome do arquivo tem de dizer o dia que a pessoa viveu.
 */
export function formatIsoDay(value: DateInput): string {
  const date = toDate(value);
  if (!date) return '';
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SITE_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Data de calendário do banco (`date`, "2026-09-02"): não tem horário, então não pode mudar de dia
 * por fuso. Devolve `null` se não for uma data válida.
 */
function dateOnlyToDate(value: string): Date | null {
  const match = DATE_ONLY.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 ? date : null;
}

/** "2 de setembro" a partir de "2026-09-02". */
export function formatCalendarDay(value: string): string {
  const date = dateOnlyToDate(value);
  return date ? format(date, { day: 'numeric', month: 'long' }, 'UTC') : '';
}

/** "setembro de 2026" a partir de "2026-09-02". */
export function formatCalendarMonthYear(value: string): string {
  const date = dateOnlyToDate(value);
  return date ? format(date, { month: 'long', year: 'numeric' }, 'UTC') : '';
}

/** `<time datetime>` de uma data de calendário: o próprio texto, se for válido. */
export function calendarDateTime(value: string): string | undefined {
  return dateOnlyToDate(value) ? value : undefined;
}

/** "4,5": nota com vírgula, como se lê em português. */
export function formatRatingNumber(rating: number): string {
  return rating.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

const RECENT_DAYS = 7;

/** "Nova": publicada há menos de 7 dias. `now` entra de fora para o teste não depender do relógio. */
export function isRecent(published: string | null, now: Date): boolean {
  if (!published) return false;
  const date = toDate(published);
  if (!date) return false;
  const age = now.getTime() - date.getTime();
  return age >= 0 && age < RECENT_DAYS * 24 * 60 * 60 * 1000;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * Tempo relativo em pt-BR para comentários: "agora", "há 5 min", "há 3 horas", "ontem", "há 4 dias" e,
 * a partir de uma semana, a data ("29 de setembro", com o ano se não for o corrente). É calculado no
 * SERVIDOR e vai pronto para a tela: calcular no navegador mudaria o texto entre o HTML e a hidratação.
 */
export function formatRelativeTime(value: DateInput, now: Date): string {
  const date = toDate(value);
  if (!date) return '';
  const diff = now.getTime() - date.getTime();
  if (diff < MINUTE) return 'agora';
  if (diff < HOUR) return `há ${Math.floor(diff / MINUTE)} min`;
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    return hours === 1 ? 'há 1 hora' : `há ${hours} horas`;
  }
  const days = Math.floor(diff / DAY);
  if (days === 1) return 'ontem';
  if (days < 7) return `há ${days} dias`;
  const sameYear =
    format(date, { year: 'numeric' }, SITE_TIME_ZONE) ===
    format(now, { year: 'numeric' }, SITE_TIME_ZONE);
  return sameYear ? formatDayMonth(date) : formatFullDate(date);
}
