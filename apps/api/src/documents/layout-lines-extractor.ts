// ===========================================================================
// Lines-first credit block detection for bureau report extraction.
//
// PR 1: Foundation + Classification + Blocks.
// ===========================================================================

import {
  CreditSubsection,
  FinancialFieldName,
  FinancialFieldsConfidence,
  FinancialFieldsConfidenceMap,
  LayoutCreditField,
  LayoutFinancialFields,
  LayoutFinancialResult,
  OcrLine,
  OcrPage,
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

// ===========================================================================
// PR 2: Field extraction + service compose
// ===========================================================================

const MIN_ACCOUNT_DIGITS = 6;

function parseCurrency(text: string): number | null {
  if (!text) return null;
  const cleaned = text.replace(/[$\s]/g, '').replace(/[MXN]/gi, '').trim();
  if (!cleaned || !/^[0-9.,-]+$/.test(cleaned)) return null;
  let normalized: string;
  if (cleaned.includes('.') && cleaned.includes(',')) normalized = cleaned.replace(/,/g, '');
  else if (cleaned.includes(',')) {
    const parts = cleaned.split(',');
    normalized = parts.length === 2 && parts[1].length === 2 ? parts[0] + '.' + parts[1] : cleaned.replace(/,/g, '');
  } else normalized = cleaned;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function parseInstitutionAndAccount(text: string): { institution: string | null; accountNumber: string | null } {
  if (!text) return { institution: null, accountNumber: null };
  const digitMatches = [...text.matchAll(/\d+/g)];
  let accountNumber: string | null = null, bestLen = 0;
  for (const m of digitMatches) { if (m[0].length >= MIN_ACCOUNT_DIGITS && m[0].length > bestLen) { accountNumber = m[0]; bestLen = m[0].length; } }
  let institution: string | null = null;
  if (accountNumber) {
    const idx = text.indexOf(accountNumber);
    institution = text.slice(0, idx).replace(/[*.,;:]+$/g, '').trim() || null;
  } else { institution = text.replace(/[*]/g, '').trim() || null; }
  return { institution, accountNumber };
}

export function extractInstitutionFromLine(line: OcrLine): { institution: string | null; accountNumber: string | null } {
  return parseInstitutionAndAccount(line.text);
}

export function extractPaymentFromLine(line: OcrLine): { paymentDueAmount: number | null; confidence: FinancialFieldsConfidence } {
  const text = line.text;
  if (!text) return { paymentDueAmount: null, confidence: FinancialFieldsConfidence.LOW };
  const numberMatches = [...text.matchAll(/([\d,]+)/g)];
  if (numberMatches.length === 0) return { paymentDueAmount: null, confidence: FinancialFieldsConfidence.LOW };
  const value = parseCurrency(numberMatches[0][1]);
  if (value === null) return { paymentDueAmount: null, confidence: FinancialFieldsConfidence.LOW };
  if (value === 0) return { paymentDueAmount: 0, confidence: FinancialFieldsConfidence.HIGH };
  if (value > 0 && value <= 50_000_000) return { paymentDueAmount: value, confidence: FinancialFieldsConfidence.HIGH };
  return { paymentDueAmount: null, confidence: FinancialFieldsConfidence.LOW };
}

export function extractBlockFields(block: CreditBlock, orderInBlock: number): LayoutCreditField {
  const { institution, accountNumber } = extractInstitutionFromLine(block.institutionLine);
  const fields: LayoutFinancialFields = { currentBalance: null, creditLimit: null, maxCredit: null, lastPaymentAmount: null, paymentDueAmount: null, pastDueAmount: null };
  const confidence: FinancialFieldsConfidenceMap = { currentBalance: FinancialFieldsConfidence.LOW, creditLimit: FinancialFieldsConfidence.LOW, maxCredit: FinancialFieldsConfidence.LOW, lastPaymentAmount: FinancialFieldsConfidence.LOW, paymentDueAmount: FinancialFieldsConfidence.LOW, pastDueAmount: FinancialFieldsConfidence.LOW };

  if (block.dataLines.length > 0) {
    const dataText = block.dataLines[0].text;
    const numberMatches = [...dataText.matchAll(/([\d,]+)/g)];
    const numbers: number[] = [];
    for (const m of numberMatches) { const val = parseCurrency(m[1]); if (val !== null) numbers.push(val); }
    const fieldOrder: FinancialFieldName[] = ['currentBalance', 'maxCredit', 'creditLimit', 'pastDueAmount', 'lastPaymentAmount'];
    for (let i = 0; i < Math.min(numbers.length, fieldOrder.length); i++) { fields[fieldOrder[i]] = numbers[i]; confidence[fieldOrder[i]] = FinancialFieldsConfidence.MEDIUM; }
    const noAplicaIdx = dataText.toUpperCase().indexOf('NO APLICA');
    if (noAplicaIdx > 0) {
      const before = dataText.slice(0, noAplicaIdx);
      const beforeNumbers = [...before.matchAll(/([\d,]+)/g)];
      if (beforeNumbers.length > 0) {
        const lastBefore = parseCurrency(beforeNumbers[beforeNumbers.length - 1][1]);
        if (lastBefore !== null) { fields.lastPaymentAmount = lastBefore; confidence.lastPaymentAmount = FinancialFieldsConfidence.HIGH; }
      }
    }
  }

  if (block.paymentLine) {
    const { paymentDueAmount, confidence: payConf } = extractPaymentFromLine(block.paymentLine);
    fields.paymentDueAmount = paymentDueAmount;
    confidence.paymentDueAmount = payConf;
  }

  return { accountNumber, institution, fields, orderInBlock, subsection: block.subsection };
}

export function extractFromLayout(ocrLayout: { pages: OcrPage[] }): LayoutFinancialResult {
  const credits: LayoutCreditField[] = [];
  const confidence: FinancialFieldsConfidenceMap[] = [];
  const warnings: string[] = [];
  if (!ocrLayout?.pages?.length) { warnings.push('No OCR pages found.'); return { credits, confidence, warnings }; }
  let globalOrder = 0;
  for (const page of ocrLayout.pages) {
    if (!page.lines?.length) { warnings.push(`Page ${page.pageNumber}: no lines.`); continue; }
    const detailLines = filterDetailLines(page.lines);
    if (detailLines.length === 0) { warnings.push(`Page ${page.pageNumber}: no detail lines found.`); continue; }
    const blocks = groupLinesIntoBlocks(detailLines);
    if (blocks.length === 0) { warnings.push(`Page ${page.pageNumber}: no credit blocks detected.`); continue; }
    for (const block of blocks) {
      if (block.dataLines.length === 0) continue;
      const credit = extractBlockFields(block, globalOrder++);
      credits.push(credit);
      const conf: FinancialFieldsConfidenceMap = { currentBalance: FinancialFieldsConfidence.LOW, creditLimit: FinancialFieldsConfidence.LOW, maxCredit: FinancialFieldsConfidence.LOW, lastPaymentAmount: FinancialFieldsConfidence.LOW, paymentDueAmount: FinancialFieldsConfidence.LOW, pastDueAmount: FinancialFieldsConfidence.LOW };
      if (block.paymentLine) { const { confidence: payConf } = extractPaymentFromLine(block.paymentLine); conf.paymentDueAmount = payConf; }
      if (block.dataLines.length > 0 && /[\d,]+/.test(block.dataLines[0].text)) {
        conf.currentBalance = FinancialFieldsConfidence.MEDIUM;
        conf.creditLimit = FinancialFieldsConfidence.MEDIUM;
        conf.maxCredit = FinancialFieldsConfidence.MEDIUM;
        conf.lastPaymentAmount = FinancialFieldsConfidence.MEDIUM;
        conf.pastDueAmount = FinancialFieldsConfidence.MEDIUM;
      }
      confidence.push(conf);
    }
  }
  if (credits.length === 0) warnings.push('No credit blocks extracted from any page.');
  return { credits, confidence, warnings };
}
