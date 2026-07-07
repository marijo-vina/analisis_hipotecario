// ===========================================================================
// Lines-first credit block detection for bureau report extraction.
//
// PR 1: Foundation + Classification + Blocks.
// ===========================================================================

import {
  CreditSubsection,
  FinancialFieldName,
  OcrLine,
} from './document-ai.types';

export interface HeaderFieldMap {
  fieldToColumn: Partial<Record<FinancialFieldName, number>>;
  columnToField: Map<number, FinancialFieldName>;
}

// ---------------------------------------------------------------------------
// LineType
// ---------------------------------------------------------------------------

export enum LineType {
  subheader = 'subheader',
  header = 'header',
  institution = 'institution',
  data = 'data',
  payment = 'payment',
  skip = 'skip',
}

// ---------------------------------------------------------------------------
// classifyLine
// ---------------------------------------------------------------------------

const SUBHEADER_RE = /cr[eé]ditos\s+(bancarios|no\s+bancarios)/i;

const DATA_INDICATORS = [
  /\bNO\s+APLICA\b/i,
  /\bMX\b/,
  /\bUSD\b/,
  /(?:^|\s)[\d]{1,3}(?:,[\d]{3})*(?:\.[\d]{2})?(?=\s|$)/,
  /\b(?:ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|OCT|NOV|DIC)[-–]\d{2}\b/i,
  /^\s*\d+\s*$/,
];

const PAYMENT_RE = /\b(PAGO|MENSUAL)\b/i;

const SKIP_MARKERS = [
  /\bP[ÁA]GINA\s+\d+\s+DE\s+\d+\b/i,
  /\bDOCUMENTO\s+SIN\s+VALOR\s+PROBATORIO\b/i,
  /\bQU[ÉE]\s+SIGNIFICA\b/i,
  /\bCLAVES?\s+DE\s+OBSERVACI[ÓO]N\b/i,
  /\bINFORMACI[ÓO]N\s+SOBRE\s+(?:LA\s+)?ELIMINACI[ÓO]N\b/i,
  /\bDECLARATIVA\b/i,
  /\bDETALLE\s+DE\s+CONSULTAS\b/i,
  /\bFOLIO\s+DE\s+CONSULTA\b/i,
  /^\s*$/,
];

const HEADER_KEYWORDS = [
  'saldo actual', 'saldo', 'limite de credito', 'limite credito', 'limite',
  'credito maximo', 'credito max', 'monto a pagar', 'a pagar',
  'monto ultimo pago', 'ultimo pago', 'monto',
];

function countHeaderKeywords(text: string): number {
  const norm = text.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  let hits = 0;
  for (const kw of HEADER_KEYWORDS) { if (norm.includes(kw)) hits++; }
  return hits;
}

export function classifyLine(line: OcrLine): LineType {
  const text = line.text.trim();
  if (!text) return LineType.skip;
  for (const re of SKIP_MARKERS) { if (re.test(text)) return LineType.skip; }
  if (SUBHEADER_RE.test(text)) return LineType.subheader;
  if (countHeaderKeywords(text) >= 3) return LineType.header;
  const hasPayment = PAYMENT_RE.test(text);
  const digitOnly = text.split(/[\s,]+/).filter((t) => /^\d+$/.test(t));
  if (hasPayment && digitOnly.length <= 3 && text.split(/\s+/).length <= 8 && digitOnly.length >= 1) return LineType.payment;
  const upper = text.toUpperCase();
  if (upper.length >= 6 && /^[A-ZÁÉÍÓÚÑ]/.test(upper) && !/^\d/.test(text) && !/^\d+$/.test(text.replace(/[\s,]/g, '')) && !/\bDETALLE\b/i.test(text) && !/\bRESUMEN\b/i.test(text)) return LineType.institution;
  for (const re of DATA_INDICATORS) { if (re.test(text)) return LineType.data; }
  return LineType.skip;
}

// ---------------------------------------------------------------------------
// filterDetailLines
// ---------------------------------------------------------------------------

const DETAIL_START = ['DETALLE DE CRÉDITOS', 'DETALLE DE CREDITOS'];
const DETAIL_END = [
  'DETALLE DE CONSULTAS', 'DECLARATIVA', '¿ QUÉ SIGNIFICA',
  'QUÉ SIGNIFICA EL HISTÓRICO', 'QUÉ SIGNIFICA EL HISTORICO',
  'CLAVES DE OBSERVACIÓN', 'CLAVES DE OBSERVACION',
  'INFORMACIÓN SOBRE LA ELIMINACIÓN', 'INFORMACION SOBRE LA ELIMINACION',
  'OTRAS SOCIEDADES DE INFORMACIÓN', 'OTRAS SOCIEDADES DE INFORMACION',
  'DOCUMENTO SIN VALOR PROBATORIO',
];

export function filterDetailLines(lines: OcrLine[]): OcrLine[] {
  if (!lines || lines.length === 0) return [];
  let startIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    for (const m of DETAIL_START) { if (upper.includes(m)) { startIdx = i; break; } }
    if (startIdx !== -1) break;
  }
  if (startIdx === -1) return lines;
  let endIdx = lines.length;
  for (let i = startIdx + 1; i < lines.length; i++) {
    const upper = lines[i].text.toUpperCase();
    for (const m of DETAIL_END) { if (upper.includes(m)) { endIdx = i; break; } }
    if (endIdx < lines.length) break;
  }
  return lines.slice(startIdx, endIdx);
}

// ---------------------------------------------------------------------------
// CreditBlock + groupLinesIntoBlocks
// ---------------------------------------------------------------------------

export interface CreditBlock {
  institutionLine: OcrLine;
  dataLines: OcrLine[];
  paymentLine: OcrLine | null;
  subsection: CreditSubsection | null;
}

export function groupLinesIntoBlocks(lines: OcrLine[]): CreditBlock[] {
  if (!lines || lines.length === 0) return [];
  const blocks: CreditBlock[] = [];
  let currentBlock: CreditBlock | null = null;
  let currentSubsection: CreditSubsection | null = null;
  const flush = () => { if (currentBlock) { blocks.push(currentBlock); currentBlock = null; } };
  for (const line of lines) {
    const type = classifyLine(line);
    switch (type) {
      case LineType.subheader: {
        flush();
        const t = line.text.toUpperCase();
        if (/NO\s+BANCARIOS/.test(t)) currentSubsection = 'NO_BANCARIOS';
        else if (/BANCARIOS/.test(t)) currentSubsection = 'BANCARIOS';
        break;
      }
      case LineType.institution: {
        flush();
        currentBlock = { institutionLine: line, dataLines: [], paymentLine: null, subsection: currentSubsection };
        break;
      }
      case LineType.data: { if (currentBlock) currentBlock.dataLines.push(line); break; }
      case LineType.payment: { if (currentBlock && !currentBlock.paymentLine) currentBlock.paymentLine = line; break; }
      default: break;
    }
  }
  flush();
  return blocks;
}

// ---------------------------------------------------------------------------
// detectHeaderFromLines
// ---------------------------------------------------------------------------

export function detectHeaderFromLines(lines: OcrLine[]): HeaderFieldMap | null {
  if (!lines || lines.length === 0) return null;
  for (const line of lines) {
    if (classifyLine(line) === LineType.header) {
      return { fieldToColumn: {}, columnToField: new Map() };
    }
  }
  return null;
}
