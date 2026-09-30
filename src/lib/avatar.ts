/** Mesmo cálculo do protótipo (avc): o nome escolhe um dos quatro tons --av1..4. */
export function avatarTone(name: string): string {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  return `var(--av${1 + (hash % 4)})`;
}

/** Iniciais para o avatar: primeira letra do primeiro e do último nome ("Agatha Montinelli" vira "AM"). */
export function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = words[0];
  const last = words[words.length - 1];
  if (!first || !last) return '';
  if (first === last) return first.slice(0, 2).toUpperCase();
  return (first.charAt(0) + last.charAt(0)).toUpperCase();
}
