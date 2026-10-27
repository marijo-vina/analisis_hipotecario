const CAPITAL_SUFFIXES: Array<{ compact: string; suffix: string }> = [
  { compact: 'SOCIEDADANONIMAPROMOTORADEINVERSIONDECAPITALVARIABLE', suffix: 'SAPI DE CV' },
  { compact: 'SOCIEDADDERESPONSABILIDADLIMITADADECAPITALVARIABLE', suffix: 'S DE RL DE CV' },
  { compact: 'SOCIEDADANONIMADECAPITALVARIABLE', suffix: 'SA DE CV' },
  { compact: 'SOCIEDADANONIMA', suffix: 'SA' },
  { compact: 'SOCIEDADCIVIL', suffix: 'SC' },
  { compact: 'ASOCIACIONCIVIL', suffix: 'AC' },
];

function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
}

function compact(value: string): string {
  return fold(value).replace(/[^A-Z0-9]/g, '');
}

/** Abbreviation of "Régimen de capital" on a company CSF, such as SA DE CV. */
export function capitalSuffixFromOcr(ocrText: string): string | null {
  if (!ocrText) return null;
  const compactText = fold(ocrText).replace(/[^A-Z]/g, '');
  const found = CAPITAL_SUFFIXES.find((item) => compactText.includes(item.compact));
  return found?.suffix ?? null;
}

/** Denominación plus the capital-regime abbreviation, without repeating it. */
export function joinCompanyLegalName(fullName: string, suffix: string): string {
  const name = fullName.toUpperCase().replace(/\s+/g, ' ').trim();
  if (compact(name).endsWith(compact(suffix))) return name;
  return `${name} ${suffix}`;
}
