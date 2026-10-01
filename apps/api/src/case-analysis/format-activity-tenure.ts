/** Human-readable PFAE activity tenure: years + leftover months. */
export function formatActivityTenure(months: number): string {
  if (!Number.isFinite(months) || months < 0) {
    return `${months} meses`;
  }
  const years = Math.floor(months / 12);
  const rem = months % 12;
  const parts: string[] = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (rem > 0) parts.push(`${rem} ${rem === 1 ? 'mes' : 'meses'}`);
  return parts.join(' ') || '0 meses';
}

export function joinSpanishList(names: string[]): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} y ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}
