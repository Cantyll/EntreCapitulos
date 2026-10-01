/** Data "AAAA-MM-DD" do banco como "10/03/2026" (sem mudar de dia por fuso). */
export function formatDate(iso: string | null): string {
  if (!iso) return '–';
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? '–' : d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

export const percent = (current: number, total: number): number =>
  total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
