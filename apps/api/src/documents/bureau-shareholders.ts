export interface BureauShareholder {
  rfc: string;
  name: string;
  percentage: number;
}

const RFC_PATTERN = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/gi;

/**
 * Shareholder rows printed on a company bureau. The official percentage
 * still comes from the articles; this table is only what the bureau reported.
 * A row-wise report keeps RFC, name and percentage together. Document AI
 * often prints each column apart, with the percentages under Participación.
 */
export function extractCompanyShareholders(ocrText: string): BureauShareholder[] {
  if (!ocrText) return [];
  const upper = ocrText.toUpperCase();
  const start = upper.indexOf('ACCIONISTAS');
  if (start === -1) return [];

  let end = ocrText.length;
  for (const marker of ['AVALISTA', 'PREVENCIONES', 'RESUMEN DE']) {
    const index = upper.indexOf(marker, start + 'ACCIONISTAS'.length);
    if (index !== -1 && index < end) end = index;
  }

  const rows = extractShareholderRows(ocrText.slice(start, end));
  if (rows.length > 0) return rows;
  return extractShareholderColumns(ocrText.slice(start));
}

function extractShareholderRows(section: string): BureauShareholder[] {
  const marks = [...section.matchAll(RFC_PATTERN)];
  const rows: BureauShareholder[] = [];

  for (let index = 0; index < marks.length; index += 1) {
    const mark = marks[index];
    const from = (mark.index ?? 0) + mark[0].length;
    const to = index + 1 < marks.length ? (marks[index + 1].index ?? section.length) : section.length;
    const chunk = section.slice(from, to);
    const percentageMatch = chunk.match(/(\d+(?:\.\d+)?)\s*%/);
    const name = shareholderName(chunk);
    const percentage = percentageMatch ? Number(percentageMatch[1]) : null;
    if (!name || percentage == null || !Number.isFinite(percentage)) continue;
    rows.push({
      rfc: mark[1].toUpperCase(),
      name,
      percentage,
    });
  }

  return rows;
}

function extractShareholderColumns(text: string): BureauShareholder[] {
  const upper = text.toUpperCase();
  const summary = upper.indexOf('RESUMEN DE');
  const identity = summary === -1 ? text : text.slice(0, summary);
  const rfcs = [...identity.matchAll(RFC_PATTERN)].map((match) => match[1].toUpperCase());
  const names = identity
    .split(/\r?\n/)
    .map((line) => line.trim().toUpperCase())
    .filter((line) => isPersonName(line));

  const participation = upper.indexOf('PARTICIPACI');
  const percentSource = participation === -1 ? text : text.slice(participation);
  const percentages = [...percentSource.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((match) =>
    Number(match[1]),
  );

  const count = Math.min(rfcs.length, names.length, percentages.length);
  const rows: BureauShareholder[] = [];
  for (let index = 0; index < count; index += 1) {
    if (!Number.isFinite(percentages[index])) continue;
    rows.push({
      rfc: rfcs[index],
      name: names[index],
      percentage: percentages[index],
    });
  }
  return rows;
}

function isPersonName(line: string): boolean {
  if (!/^[A-ZÑÁÉÍÓÚÜ]+(?:\s+[A-ZÑÁÉÍÓÚÜ]+){2,}$/.test(line)) return false;
  return !/\b(EXISTE|INFORMACION|REPORTADA|PREVENCION|AVALISTA|ACCIONISTA)\b/.test(line);
}

function shareholderName(chunk: string): string {
  const name: string[] = [];
  for (const token of chunk.trim().split(/\s+/)) {
    if (/\d/.test(token) || token.includes('%')) break;
    if (!/^[A-ZÑÁÉÍÓÚÜ.]+$/i.test(token)) break;
    name.push(token.toUpperCase());
  }
  while (name.length > 0 && name[name.length - 1].length === 1) name.pop();
  return name.join(' ');
}
