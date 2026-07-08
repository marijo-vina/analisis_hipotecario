import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import {
  FinancialFieldsConfidence,
  FinancialFieldsConfidenceMap,
  FinancialFieldsSource,
  FinancialFieldName,
  LayoutCreditField,
  LayoutFinancialFields,
  LayoutFinancialResult,
  OcrLayout,
} from './document-ai.types';

// ---------------------------------------------------------------------------
// Document type codes that trigger credit bureau extraction
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_DOC_TYPES = ['CREDIT_BUREAU_REPORT'];

// ---------------------------------------------------------------------------
// Specialized instructions for credit bureau extraction
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_INSTRUCTIONS = [
  'Reporte de Buró de Crédito (México). Extraé ÚNICAMENTE datos crudos de este documento.',
  '',
  '─── REGLA ANTI-GLOSARIO ───',
  'IGNORÁ completamente secciones de glosario, leyendas, definiciones, instructivos,',
  'notas al pie, textos legales, promocionales o explicativos. Ej: "¿Qué significa el',
  'histórico de pagos?", tablas de claves de observación, definiciones generales de Buró.',
  'Solo extraé datos de las secciones del acreditado: Resumen de Créditos, Detalle de',
  'Créditos, Datos del Acreditado, Detalle de Consultas.',
  '',
  '─── Datos del acreditado ───',
  'borrower.fullName: nombre en MAYÚSCULAS. borrower.birthDate: YYYY-MM-DD.',
  'borrower.rfc: RFC. borrower.lastReportedAddress: domicilio.',
  '',
  '─── Datos del reporte ───',
  'report.consultationDate: YYYY-MM-DD (Fecha de Consulta).',
  'report.numberOfInquiries: número de consultas 24 meses.',
  'report.publicScore: null (el score viene de documento separado "Mi Score").',
  '',
  '─── ⚠️ ¡CRÍTICO! CLASIFICACIÓN DE PAGOS (ERROR COMÚN) ───',
  'La columna "Monto a Pagar" del reporte contiene DOS números por crédito.',
  'El 90% de los errores de extracción vienen de confundirlos. USÁ ESTE ÁRBOL:',
  '',
  '┌─ DECISION TREE ─────────────────────────────────────────────────┐',
  '│ ¿El número está ANTES de "NO APLICA"?                           │',
  '│   SÍ → lastPaymentAmount (Monto Último Pago)                   │',
  '│   NO → ¿Está en línea separada, con texto "PAGO"/"MENSUAL"?   │',
  '│         SÍ → paymentDueAmount (Monto a Pagar)                  │',
  '│         NO → ese número NO es un campo de pago, ignorá         │',
  '└─────────────────────────────────────────────────────────────────┘',
  '',
  '─── Créditos ───',
  'Extraé TODOS los créditos. El OCR tiene DOS partes por crédito:',
  '',
  'PARTE 1 — Línea de datos concatenados (Saldo, Máximo, Límite, Moneda, Fechas, etc.):',
  '  Ej: "0 53,763 42,400 MX MAY-25 ABR-13 0 1,743 NO APLICA"',
  '  Ej: "30,283 193,336 150,000 MX AGO-25 AGO-03 50,000 NO APLICA"',
  '  Ej: "73,881 307,825 MX AGO-25 JUL-09 49,800 NO APLICA"',
  '  ➤ El ÚLTIMO número antes de "NO APLICA" es lastPaymentAmount.',
  '  ➤ En los ejemplos: 1,743 / 50,000 / 49,800 son lastPaymentAmount.',
  '',
  'PARTE 2 — Línea de pago (SIEMPRE en renglones separados DEBAJO de Parte 1):',
  '  ➤ Es una línea con UN SOLO NÚMERO, seguida de texto descriptivo.',
  '  ➤ Ese número es paymentDueAmount.',
  '  Ej: "1,875" seguido de "PAGO MÍNIMO PARA CUENTAS REVOLVENTES" → paymentDueAmount = 1875',
  '  Ej: "0"     seguido de "MENSUAL"                              → paymentDueAmount = 0',
  '  Ej: "0"     seguido de "MENSUAL 36"                           → paymentDueAmount = 0',
  '  Ej: "0"     seguido de "PAGO MÍNIMO PARA CUENTAS REVOLVENTES" → paymentDueAmount = 0',
  '',
  '⚠️ REGLA DE ORO (siempre cierta):',
  '  lastPaymentAmount = el número PEGADO a "NO APLICA" en la línea de datos.',
  '  paymentDueAmount  = el número SOLITARIO que tiene texto debajo.',
  '  NUNCA INVIERTAS ESTOS CAMPOS. NUNCA uses el mismo número para ambos.',
  '  Si ves "XXX NO APLICA\\n0\\nPAGO MÍNIMO" → lastPayment=XXX, paymentDue=0.',
  '  Si ves "XXX NO APLICA\\n1,875\\nPAGO MÍNIMO" → lastPayment=XXX, paymentDue=1875.',
  '',
  '  institution, creditType, classification (REVOLVING|FIXED_PAYMENT|MORTGAGE|AUTO|',
  '    PERSONAL_LOAN|DEPARTMENT_STORE|NON_BANK_SERVICE|UNKNOWN),',
  '  status (ACTIVE|CLOSED), currentBalance, creditLimit,',
  '  paymentDueAmount: número del OCR que viene con texto ("PAGO MÍNIMO", "MENSUAL").',
  '  lastPaymentAmount: número del OCR que está SOLO, sin texto descriptivo.',
  '  currency ("MXN" por defecto),',
  '  paymentHistory: string crudo del Histórico de Pagos, sin interpretar.',
  '    ⚠️ LÍMITE: máximo 72 caracteres (equivale a 6 años). Si el OCR muestra más, truncá a los últimos 72.',
  '  mopCodes: array de strings con códigos MOP del historial. Valores: 0-9, U, -.',
  '    ⚠️ LÍMITE: máximo 72 elementos. Si hay más, tomá solo los últimos 72.',
  '  observationKeys: array de strings con claves de observación que aparezcan',
  '    ASOCIADAS DIRECTAMENTE a este crédito (no del glosario). Ej: ["UP","LC"].',
  '  rawTextReference: texto original de la fila del crédito en el reporte.',
  '',
  '─── Flags booleanos por crédito ───',
  'hasLatePayments: true si hay MOP 2-3. MOP 0-1 NO es atraso. U y - NO son atraso.',
  'hasSeriousDelinquency: true si hay MOP 4,5,6,7,8,9.',
  'Los campos hasWriteOff, hasFraudFlag, hasSettlementOrDiscount, hasIdentityTheft',
  'deben ser null. El sistema los calcula a partir de observationKeys.',
  '',
  '─── NO generes ───',
  'NO generes alertas, riskSummary, ni flags de quebranto/fraude/quita.',
  'NO uses el glosario como fuente de datos.',
  'NO marques score (el campo publicScore es null).',
  '',
  '─── JSON VÁLIDO ───',
  'El JSON de salida DEBE ser parseable. Reglas estrictas:',
  '- paymentHistory debe ser un string ENTRE COMILLAS: "111000222". Máximo 72 chars.',
  '- mopCodes debe ser un array de strings: ["1","1","1","0","U"]. Máximo 72 elementos.',
  '- NUNCA pongas texto crudo del OCR fuera de comillas en el JSON.',
  '- El JSON debe cerrar correctamente con }.',
].join('\n');

// ---------------------------------------------------------------------------
// Trimmed instructions — keeps only: anti-glossary rule, 2-line payment
// golden rule, date/amount formats, enum values, JSON rules.
// Removes: OCR literal examples, ASCII decision tree, redundant explanatory
// sections. Reduces prompt size by ~2,000 chars.
// ---------------------------------------------------------------------------
// Exported for direct-import testing (Phase 3 task 3.2).
export const CREDIT_BUREAU_INSTRUCTIONS_LEAN = [
  'Reporte de Buró de Crédito (México). Extraé ÚNICAMENTE datos crudos de este documento.',
  '',
  '─── REGLA ANTI-GLOSARIO ───',
  'IGNORÁ completamente secciones de glosario, leyendas, definiciones, instructivos,',
  'notas al pie, textos legales, promocionales o explicativos. Ej: "¿Qué significa el',
  'histórico de pagos?", tablas de claves de observación, definiciones generales de Buró.',
  'Solo extraé datos de las secciones del acreditado: Resumen de Créditos, Detalle de',
  'Créditos, Datos del Acreditado, Detalle de Consultas.',
  '',
  '─── ⚠️ REGLA DE ORO (PAGOS) ───',
  'lastPaymentAmount = el número PEGADO a "NO APLICA" en la línea de datos.',
  'paymentDueAmount  = el número SOLITARIO que tiene texto debajo.',
  'NUNCA INVIERTAS ESTOS CAMPOS. NUNCA uses el mismo número para ambos.',
  '',
  '─── Formatos ───',
  'Fechas: YYYY-MM-DD. Montos: números decimales sin $ ni comas.',
  'currency: "MXN" por defecto.',
  'paymentHistory: string crudo del Histórico de Pagos, sin interpretar.',
  '  ⚠️ LÍMITE: máximo 72 caracteres (equivale a 6 años de historial mensual).',
  '  Si el OCR muestra más, truncá a los últimos 72.',
  'mopCodes: array de strings con códigos MOP del historial. Valores: 0-9, U, -.',
  '  ⚠️ LÍMITE: máximo 72 elementos. Si hay más, tomá solo los últimos 72.',
  '',
  '─── Enums ───',
  'classification: REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN',
  '  | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN',
  'status: ACTIVE | CLOSED | UNKNOWN',
  '',
  '─── JSON VÁLIDO ───',
  'El JSON de salida DEBE ser parseable. Reglas estrictas:',
  '- paymentHistory debe ser un string ENTRE COMILLAS: "111000222". Máximo 72 chars.',
  '- mopCodes debe ser un array de strings: ["1","1","1","0","U"]. Máximo 72 elementos.',
  '- NUNCA pongas texto crudo del OCR fuera de comillas en el JSON.',
  '- El JSON debe cerrar correctamente con }.',
].join('\n');

// ---------------------------------------------------------------------------
// Alert severity and category enums
// ---------------------------------------------------------------------------
type AlertSeverity = 'INFO' | 'WARNING' | 'CRITICAL';
type AlertCategory =
  | 'IDENTITY'
  | 'ADDRESS'
  | 'INCOME'
  | 'CREDIT_BUREAU'
  | 'BANK_STATEMENT'
  | 'DOCUMENT_QUALITY'
  | 'MANUAL_VALIDATION'
  | 'REQUIREMENT';

interface ExtractionAlert {
  code: string;
  severity: AlertSeverity;
  category: AlertCategory;
  message: string;
  field: string | null;
  requiresManualReview: boolean;
}

// ---------------------------------------------------------------------------
// Schema — output contract Gemini must fulfill (credit-bureau.schema.md v1.0)
// ---------------------------------------------------------------------------
const CREDIT_BUREAU_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'CREDIT_BUREAU_REPORT',
  extractionMetadata: {
    sourceDocumentId: null,
    mortgageCaseId: null,
    ocrProcessedAt: null,
    extractedAt: null,
    model: null,
    confidence: 0.0,
  },
  documentRequirementContext: {
    incomeBehavior: 'NOT_APPLICABLE',
    requiredPayrollReceiptMonths: null,
    requiredBankStatementMonths: null,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  borrower: {
    fullName: 'string | null',
    birthDate: 'YYYY-MM-DD | null',
    rfc: 'string | null',
    lastReportedAddress: 'string | null',
  },
  report: {
    consultationDate: 'YYYY-MM-DD | null',
    numberOfInquiries: 'number | null',
    publicScore: 'null — score is extracted from a separate Mi Score document',
  },
  credits: [
    {
      institution: 'string | null',
      creditType: 'string | null',
      classification:
        'REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN',
      status: 'ACTIVE | CLOSED | UNKNOWN',
      currentBalance: 'number | null',
      paymentDueAmount: 'number | null — "Monto a Pagar". El OCR incluye texto como "PAGO MÍNIMO" o "MENSUAL" junto al número. Extraé solo el número.',
      lastPaymentAmount: 'number | null — "Monto Último Pago". El OCR muestra solo números limpios, sin texto descriptivo.',
      creditLimit: 'number | null',
      currency: 'MXN',
      paymentHistory: 'string | null',
      mopCodes: [],
      observationKeys: [],
      hasLatePayments: 'boolean | null',
      hasSeriousDelinquency: 'boolean | null',
      hasWriteOff: 'boolean | null — solo si aparece clave UP asociada al crédito',
      hasSettlementOrDiscount: 'boolean | null — solo si aparece clave LC o LG asociada al crédito',
      hasFraudFlag: 'boolean | null — solo si aparece clave FD asociada al crédito',
      hasIdentityTheft: 'boolean | null — solo si aparece clave RI asociada al crédito',
      isClosed: 'boolean | null',
      monthlyDebtContribution: 'number | null',
      rawTextReference: 'string | null',
    },
  ],
  riskSummary: {
    hasWriteOff: 'boolean | null',
    hasSettlementOrDiscount: 'boolean | null',
    hasFraudFlag: 'boolean | null',
    hasIdentityTheft: 'boolean | null',
    hasMinorDelinquency: 'boolean | null',
    hasSeriousDelinquency: 'boolean | null',
    hasPreventiveKeys: 'boolean | null',
    possibleHomonym: 'boolean | null',
    riskNotes: 'string | null',
  },
  missingFields: [],
};

// ---------------------------------------------------------------------------
// Schema — same structure as CREDIT_BUREAU_SCHEMA but with ALL inline
// descriptions stripped from values. Reduces prompt size by ~800 chars.
// ---------------------------------------------------------------------------
// Exported for direct-import testing (Phase 3 task 3.1).
export const CREDIT_BUREAU_SCHEMA_LEAN: typeof CREDIT_BUREAU_SCHEMA = {
  schemaVersion: '1.0',
  documentType: 'CREDIT_BUREAU_REPORT',
  extractionMetadata: {
    sourceDocumentId: null,
    mortgageCaseId: null,
    ocrProcessedAt: null,
    extractedAt: null,
    model: null,
    confidence: 0.0,
  },
  documentRequirementContext: {
    incomeBehavior: 'NOT_APPLICABLE',
    requiredPayrollReceiptMonths: null,
    requiredBankStatementMonths: null,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  borrower: {
    fullName: 'string | null',
    birthDate: 'YYYY-MM-DD | null',
    rfc: 'string | null',
    lastReportedAddress: 'string | null',
  },
  report: {
    consultationDate: 'YYYY-MM-DD | null',
    numberOfInquiries: 'number | null',
    publicScore: 'null',
  },
  credits: [
    {
      institution: 'string | null',
      creditType: 'string | null',
      classification:
        'REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN',
      status: 'ACTIVE | CLOSED | UNKNOWN',
      currentBalance: 'number | null',
      paymentDueAmount: 'number | null',
      lastPaymentAmount: 'number | null',
      creditLimit: 'number | null',
      currency: 'MXN',
      paymentHistory: 'string | null',
      mopCodes: [],
      observationKeys: [],
      hasLatePayments: 'boolean | null',
      hasSeriousDelinquency: 'boolean | null',
      hasWriteOff: 'boolean | null',
      hasSettlementOrDiscount: 'boolean | null',
      hasFraudFlag: 'boolean | null',
      hasIdentityTheft: 'boolean | null',
      isClosed: 'boolean | null',
      monthlyDebtContribution: 'number | null',
      rawTextReference: 'string | null',
    },
  ],
  riskSummary: {
    hasWriteOff: 'boolean | null',
    hasSettlementOrDiscount: 'boolean | null',
    hasFraudFlag: 'boolean | null',
    hasIdentityTheft: 'boolean | null',
    hasMinorDelinquency: 'boolean | null',
    hasSeriousDelinquency: 'boolean | null',
    hasPreventiveKeys: 'boolean | null',
    possibleHomonym: 'boolean | null',
    riskNotes: 'string | null',
  },
  missingFields: [],
};

// ---------------------------------------------------------------------------
// Reduced schema — clone of CREDIT_BUREAU_SCHEMA_LEAN minus the 4 financial
// fields owned by the layout extractor (currentBalance, creditLimit,
// paymentDueAmount, lastPaymentAmount). Used only when the layout path is
// active so Gemini output shrinks ~40%. `maxCredit` and `pastDueAmount` are
// NOT part of the Gemini schema (they live in FINANCIAL_FIELDS for the
// layout merger), so they are not touched here.
// ---------------------------------------------------------------------------
// Exported for direct-import testing (Phase 3 task 3.5).
export const CREDIT_BUREAU_SCHEMA_REDUCED: Omit<
  typeof CREDIT_BUREAU_SCHEMA_LEAN,
  'credits'
> & {
  credits: Omit<
    (typeof CREDIT_BUREAU_SCHEMA_LEAN.credits)[number],
    'currentBalance' | 'creditLimit' | 'paymentDueAmount' | 'lastPaymentAmount'
  >[];
} = {
  schemaVersion: '1.0',
  documentType: 'CREDIT_BUREAU_REPORT',
  extractionMetadata: {
    sourceDocumentId: null,
    mortgageCaseId: null,
    ocrProcessedAt: null,
    extractedAt: null,
    model: null,
    confidence: 0.0,
  },
  documentRequirementContext: {
    incomeBehavior: 'NOT_APPLICABLE',
    requiredPayrollReceiptMonths: null,
    requiredBankStatementMonths: null,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  borrower: {
    fullName: 'string | null',
    birthDate: 'YYYY-MM-DD | null',
    rfc: 'string | null',
    lastReportedAddress: 'string | null',
  },
  report: {
    consultationDate: 'YYYY-MM-DD | null',
    numberOfInquiries: 'number | null',
    publicScore: 'null',
  },
  credits: [
    {
      institution: 'string | null',
      creditType: 'string | null',
      classification:
        'REVOLVING | FIXED_PAYMENT | MORTGAGE | AUTO | PERSONAL_LOAN | DEPARTMENT_STORE | NON_BANK_SERVICE | UNKNOWN',
      status: 'ACTIVE | CLOSED | UNKNOWN',
      currency: 'MXN',
      paymentHistory: 'string | null',
      mopCodes: [],
      observationKeys: [],
      hasLatePayments: 'boolean | null',
      hasSeriousDelinquency: 'boolean | null',
      hasWriteOff: 'boolean | null',
      hasSettlementOrDiscount: 'boolean | null',
      hasFraudFlag: 'boolean | null',
      hasIdentityTheft: 'boolean | null',
      isClosed: 'boolean | null',
      monthlyDebtContribution: 'number | null',
      rawTextReference: 'string | null',
    },
  ],
  riskSummary: {
    hasWriteOff: 'boolean | null',
    hasSettlementOrDiscount: 'boolean | null',
    hasFraudFlag: 'boolean | null',
    hasIdentityTheft: 'boolean | null',
    hasMinorDelinquency: 'boolean | null',
    hasSeriousDelinquency: 'boolean | null',
    hasPreventiveKeys: 'boolean | null',
    possibleHomonym: 'boolean | null',
    riskNotes: 'string | null',
  },
  missingFields: [],
};

// ---------------------------------------------------------------------------
// Mi Score exclusion codes mapping (used by CreditScoreExtractionService)
// ---------------------------------------------------------------------------
export const SCORE_EXCLUSION_REASONS: Record<number, string> = {
  [-1]: 'Consumidor difunto',
  [-5]:
    'Todas las cuentas cerradas, al menos una con morosidad de 90+ días (MOP>=04)',
  [-6]:
    'Cuentas abiertas en los últimos 6 meses, al menos una con morosidad de 60+ días (MOP>=03)',
  [-7]:
    'Cuentas abiertas en los últimos 6 meses, al menos una con morosidad de 30+ días (MOP>=02)',
  [-8]:
    'Sin cuenta actualizada en los últimos 12 meses o abierta en los últimos 6 meses (Criterios Mínimos de Calificación)',
  [-9]: 'Sin cuentas para calcular Mi Score',
};

// ---------------------------------------------------------------------------
// Valid MOP codes
// ---------------------------------------------------------------------------
const VALID_MOP_CODES = new Set([
  '0',
  '1',
  '2',
  '3',
  '4',
  '5',
  '6',
  '7',
  '8',
  '9',
  'U',
  '-',
]);

// ---------------------------------------------------------------------------
// The 6 financial fields merged by layout authority (stable iteration order).
// ---------------------------------------------------------------------------
const FINANCIAL_FIELDS: FinancialFieldName[] = [
  'currentBalance',
  'creditLimit',
  'maxCredit',
  'lastPaymentAmount',
  'paymentDueAmount',
  'pastDueAmount',
];

// ---------------------------------------------------------------------------
// Cap for the layout-aware OCR pre-filter. Layer 2 sends only the
// "DETALLE DE CRÉDITOS" section to Gemini (~5K chars) instead of the full
// 15K outfit — borrower/report metadata is regex-extracted separately.
// ---------------------------------------------------------------------------
const MAX_OCR_LAYOUT_CHARS = 15000;

// ---------------------------------------------------------------------------
// Regex-extracted borrower/report metadata — used by the layout-aware path
// (Layer 2) so Gemini can be fed only the "DETALLE DE CRÉDITOS" section
// without losing borrower identity. Each field is `null` when the regex
// cannot confirm a value; callers must fall back to Layer 1 when any field
// is null.
// ---------------------------------------------------------------------------
interface RegexBorrowerFields {
  fullName: string | null;
  rfc: string | null;
  birthDate: string | null;
  consultationDate: string | null;
}

// ---------------------------------------------------------------------------
// Extraction result envelope
// ---------------------------------------------------------------------------
export interface CreditBureauExtractionResult {
  success: boolean;
  documentId: string;
  extractedData: Record<string, unknown> | null;
  alerts: ExtractionAlert[];
  missingFields: string[];
  error?: { code: string; message: string };
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
@Injectable()
export class CreditBureauExtractionService {
  private readonly logger = new Logger(CreditBureauExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
    private readonly configService: ConfigService,
    private readonly layoutExtractor: LayoutFinancialExtractorService,
  ) {}

  static isCreditBureauDocument(documentTypeCode: string): boolean {
    return CREDIT_BUREAU_DOC_TYPES.includes(documentTypeCode);
  }

  /**
   * Strip non-credit sections from OCR text before sending to Gemini.
   *
   * Bureau reports contain inquiry lists, glossary/legend sections, legal
   * disclaimers, and page boilerplate — all of which inflate Gemini's output
   * and cause GEMINI_INVALID_JSON. We keep only:
   *   1. Borrower data (Datos del Acreditado / Datos Generales)
   *   2. Credit summary (Resumen de Créditos)
   *   3. Credit detail (Detalle de Créditos → up to next major section)
   *
   * Excluded: consultas, glosario, pie de página legal, instrucciones.
   */
  private preFilterOcr(raw: string, maxChars: number): string {
    const upper = raw.toUpperCase();

    // ── Section boundary markers (in priority order) ────────────────────
    const DETAIL_START = ['DETALLE DE CRÉDITOS', 'DETALLE DE CREDITOS'];
    const CUT_AFTER = [
      'DETALLE DE CONSULTAS',
      'DECLARATIVA',
      '¿ QUÉ SIGNIFICA',
      'QUÉ SIGNIFICA EL HISTÓRICO',
      'QUÉ SIGNIFICA EL HISTORICO',
      'CLAVES DE OBSERVACIÓN',
      'CLAVES DE OBSERVACION',
      'INFORMACIÓN SOBRE LA ELIMINACIÓN',
      'INFORMACION SOBRE LA ELIMINACION',
      'OTRAS SOCIEDADES DE INFORMACIÓN',
      'OTRAS SOCIEDADES DE INFORMACION',
      'DOCUMENTO SIN VALOR PROBATORIO',
    ];
    const BORROWER = ['DATOS DEL ACREDITADO', 'DATOS GENERALES'];
    const SUMMARY = 'RESUMEN DE CRÉDITOS';

    // ── 1. Find borrower section (keep ~400 chars) ──────────────────────
    let borrowerChunk = '';
    for (const marker of BORROWER) {
      const idx = upper.indexOf(marker);
      if (idx !== -1) {
        borrowerChunk = raw.slice(idx, idx + 400);
        break;
      }
    }

    // ── 2. Find detail section start ────────────────────────────────────
    let detailStart = -1;
    for (const marker of DETAIL_START) {
      detailStart = upper.indexOf(marker);
      if (detailStart !== -1) break;
    }
    if (detailStart === -1) {
      // No detail section found → fall back to simple truncation
      return raw.length > maxChars
        ? raw.slice(0, maxChars)
        : raw;
    }

    // ── 3. Find the cut point (first excluded section AFTER detail) ─────
    let cutPoint = raw.length;
    for (const marker of CUT_AFTER) {
      const idx = upper.indexOf(marker, detailStart + 1);
      if (idx !== -1 && idx < cutPoint) {
        cutPoint = idx;
      }
    }

    // ── 4. Include summary if it appears BEFORE the detail section ──────
    let summaryChunk = '';
    const summaryIdx = upper.indexOf(SUMMARY);
    if (summaryIdx !== -1 && summaryIdx < detailStart) {
      summaryChunk = raw.slice(summaryIdx, detailStart);
    }

    // ── 5. Assemble: borrower + summary + detail ────────────────────────
    const detailChunk = raw.slice(detailStart, cutPoint);
    let filtered = [borrowerChunk, summaryChunk, detailChunk]
      .filter(Boolean)
      .join('\n');

    // ── 6. Cap at maxChars (trim from the end of detail, not the start) ─
    if (filtered.length > maxChars) {
      filtered =
        filtered.slice(0, maxChars) +
        `\n\n[OCR truncado — ${filtered.length - maxChars} caracteres omitidos]`;
    }

    return filtered;
  }

  /**
   * Layout-aware OCR pre-filter: extracts ONLY the "DETALLE DE CRÉDITOS"
   * section for Gemini. Used when `shouldUseLayoutPath()` is true — the
   * borrower/report metadata is regex-extracted separately
   * (`extractBorrowerFromOcr`) so Gemini never needs those sections.
   *
   * Returns ~5K chars of high-signal credit data instead of the full 15K.
   * When the detail section cannot be located, falls back to `preFilterOcr`
   * so extraction still produces a usable (if larger) prompt.
   */
  private preFilterOcrLayout(raw: string): string {
    const upper = raw.toUpperCase();

    const DETAIL_START = ['DETALLE DE CRÉDITOS', 'DETALLE DE CREDITOS'];
    // NOTE: "DECLARATIVA" intentionally excluded — it can appear inside
    // credit-detail text (e.g. "cuenta declarativa") and would cut off
    // remaining credits prematurely.
    const CUT_AFTER = [
      'DETALLE DE CONSULTAS',
      '¿ QUÉ SIGNIFICA',
      'QUÉ SIGNIFICA EL HISTÓRICO',
      'QUÉ SIGNIFICA EL HISTORICO',
      'CLAVES DE OBSERVACIÓN',
      'CLAVES DE OBSERVACION',
      'INFORMACIÓN SOBRE LA ELIMINACIÓN',
      'INFORMACION SOBRE LA ELIMINACION',
      'OTRAS SOCIEDADES DE INFORMACIÓN',
      'OTRAS SOCIEDADES DE INFORMACION',
      'DOCUMENTO SIN VALOR PROBATORIO',
    ];

    let detailStart = -1;
    for (const marker of DETAIL_START) {
      detailStart = upper.indexOf(marker);
      if (detailStart !== -1) break;
    }
    if (detailStart === -1) {
      // No detail section — fall back to the standard pre-filter so the
      // prompt stays usable even if the layout path was chosen optimistically.
      return this.preFilterOcr(raw, MAX_OCR_LAYOUT_CHARS);
    }

    let cutPoint = raw.length;
    for (const marker of CUT_AFTER) {
      const idx = upper.indexOf(marker, detailStart + 1);
      if (idx !== -1 && idx < cutPoint) {
        cutPoint = idx;
      }
    }

    const detailChunk = raw.slice(detailStart, cutPoint);
    if (detailChunk.length > MAX_OCR_LAYOUT_CHARS) {
      return (
        detailChunk.slice(0, MAX_OCR_LAYOUT_CHARS) +
        `\n\n[OCR truncado — ${detailChunk.length - MAX_OCR_LAYOUT_CHARS} caracteres omitidos]`
      );
    }
    return detailChunk;
  }

  /**
   * Regex-extracts borrower/report metadata from the FULL OCR text so the
   * layout path can send only "DETALLE DE CRÉDITOS" to Gemini without losing
   * borrower identity. Returns `null` per field when the regex cannot
   * confirm a value — callers must fall back to Layer 1 when any field is
   * null because the Layer 2 OCR trim removes the borrower/report sections.
   */
  private extractBorrowerFromOcr(raw: string): RegexBorrowerFields {
    const result: RegexBorrowerFields = {
      fullName: null,
      rfc: null,
      birthDate: null,
      consultationDate: null,
    };
    if (!raw) return result;

    const upper = raw.toUpperCase();

    // ── fullName ───────────────────────────────────────────────────────
    // Bureau layouts vary: labelled ("Nombre: <NAME>"), or a name line
    // immediately after "DATOS DEL ACREDITADO" / "DATOS GENERALES".
    const LABELLED_NAME =
      /\b(?:NOMBRE|NOMBRE\(S\)|APELLIDOS?)\s*[:：]\s*([A-ZÑÁÉÍÓÚÄËÏÖÜ][A-ZÑÁÉÍÓÚÄËÏÖÜ .]{2,})/i;
    const labelledName = raw.match(LABELLED_NAME);
    if (labelledName) {
      const name = labelledName[1].replace(/[.]+$/, '').trim();
      if (name.length >= 3) {
        result.fullName = name.toUpperCase();
      }
    }

    if (!result.fullName) {
      const borrowerSectionMarkers = [
        'DATOS DEL ACREDITADO',
        'DATOS GENERALES',
      ];
      for (const marker of borrowerSectionMarkers) {
        const idx = upper.indexOf(marker);
        if (idx === -1) continue;
        const after = raw.slice(idx, idx + 600);
        for (const line of after.split(/\r?\n/).slice(1)) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          // Skip label-ish lines, account-number lines, and date lines.
          if (/[:：]/.test(trimmed) && trimmed.length <= 30) continue;
          if (/^\d/.test(trimmed)) continue;
          if (/\d{2}[/.\-]\d{2}[/.\-]\d{4}/.test(trimmed)) continue;
          if (/^[A-ZÑÁÉÍÓÚÄËÏÖÜ\s.]+$/.test(trimmed) && trimmed.length >= 3) {
            const words = trimmed
              .split(/\s+/)
              .filter((w) => /[A-ZÑ]/i.test(w));
            if (words.length >= 2) {
              result.fullName = trimmed.replace(/[.]+$/, '').trim().toUpperCase();
              break;
            }
          }
        }
        if (result.fullName) break;
      }
    }

    // ── rfc ───────────────────────────────────────────────────────────
    // Prefer "RFC:" labelled value; fall back to a standalone RFC pattern.
    const rfcLabelled = raw.match(
      /\bRFC\s*[:：]\s*([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})/i,
    );
    if (rfcLabelled) {
      result.rfc = rfcLabelled[1].toUpperCase();
    } else {
      const rfcMatch = raw.match(/\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/);
      if (rfcMatch) {
        result.rfc = rfcMatch[1].toUpperCase();
      }
    }

    // ── birthDate ──────────────────────────────────────────────────────
    const birthIdx = upper.indexOf('FECHA DE NACIMIENTO');
    if (birthIdx !== -1) {
      const after = raw.slice(birthIdx, birthIdx + 200);
      const dateMatch = after.match(
        /(\d{2}[/.\-]\d{2}[/.\-]\d{4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})/,
      );
      if (dateMatch) {
        result.birthDate = this.normalizeOcrDate(dateMatch[1]);
      }
    }
    // Derive from the RFC embedded date (person RFC: YYMMDD at chars 5-10).
    if (!result.birthDate && result.rfc) {
      const rfcDate = result.rfc.match(/^[A-ZÑ&]{3,4}(\d{6})[A-Z0-9]{3}$/i);
      if (rfcDate) {
        const digits = rfcDate[1];
        const yy = parseInt(digits.slice(0, 2), 10);
        const mm = digits.slice(2, 4);
        const dd = digits.slice(4, 6);
        // Century heuristic: ≥50 → 19xx, else 20xx (birth dates).
        const year = yy >= 50
          ? `19${String(yy).padStart(2, '0')}`
          : `20${String(yy).padStart(2, '0')}`;
        result.birthDate = `${year}-${mm}-${dd}`;
      }
    }

    // ── consultationDate ───────────────────────────────────────────────
    const consultIdx = upper.indexOf('FECHA DE CONSULTA');
    if (consultIdx !== -1) {
      const after = raw.slice(consultIdx, consultIdx + 200);
      const dateMatch = after.match(
        /(\d{2}[/.\-]\d{2}[/.\-]\d{4}|\d{4}[/.\-]\d{2}[/.\-]\d{2})/,
      );
      if (dateMatch) {
        result.consultationDate = this.normalizeOcrDate(dateMatch[1]);
      }
    }

    return result;
  }

  /**
   * Normalizes an OCR date fragment to ISO `YYYY-MM-DD`. Accepts
   * `DD/MM/YYYY`, `DD-MM-YYYY`, and `YYYY-MM-DD` / `YYYY/MM/DD`.
   */
  private normalizeOcrDate(dateStr: string): string | null {
    const m1 = dateStr.match(/^(\d{2})[/.\-](\d{2})[/.\-](\d{4})$/);
    if (m1) {
      return `${m1[3]}-${m1[2]}-${m1[1]}`;
    }
    const m2 = dateStr.match(/^(\d{4})[/.\-](\d{2})[/.\-](\d{2})$/);
    if (m2) {
      return `${m2[1]}-${m2[2]}-${m2[3]}`;
    }
    return null;
  }

  /**
   * Extraction entry point.
   *
   * `privateOptions.forceLayer1` is an internal hook used by the Layer 2
   * borrower-regex fallback: when regex extraction cannot confirm every
   * borrower field, `extract()` re-invokes itself with `forceLayer1: true`
   * to run the full Layer 1 pipeline (full OCR + LEAN schema +
   * disambiguation). The forced call skips the regex attempt so there is no
   * risk of infinite recursion.
   */
  async extract(
    caseId: string,
    documentId: string,
    privateOptions: { forceLayer1?: boolean } = {},
  ): Promise<CreditBureauExtractionResult> {
    // ── 1. Fetch document with type + status ───────────────────────────
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: { documentType: true, documentStatus: true },
    });
    if (!document || document.mortgageCaseId !== caseId) {
      throw new Error('Document not found');
    }

    // ── 2. Status gate: allow PROCESSED and EXTRACTION_ERROR (retry) ──
    const statusCode = document.documentStatus.code;
    if (statusCode !== 'PROCESSED' && statusCode !== 'EXTRACTION_ERROR') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_NOT_PROCESSED',
          message:
            'El documento debe estar procesado (OCR) antes de la extracción.',
        },
      };
    }

    // ── 3. Guard: document type must be CREDIT_BUREAU_REPORT ──────────
    if (document.documentType.code !== 'CREDIT_BUREAU_REPORT') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: 'DOCUMENT_TYPE_MISMATCH',
          message:
            'El documento no es un reporte de buró de crédito (CREDIT_BUREAU_REPORT).',
        },
      };
    }

    // ── 4. Guard: OCR text must exist ────────────────────────────────────
    if (!document.ocrText || document.ocrText.trim() === '') {
      return {
        success: false,
        documentId,
        extractedData: null,
        alerts: [],
        missingFields: [],
        error: {
          code: GeminiErrorCode.OCR_TEXT_EMPTY,
          message: 'El documento no tiene texto OCR extraído.',
        },
      };
    }

    // ── 5. Resolve status IDs for transitions ───────────────────────────
    const processedStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'PROCESSED' },
    });
    const extractionErrorStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'EXTRACTION_ERROR' },
    });
    if (!processedStatus || !extractionErrorStatus) {
      throw new Error('Required document status codes not found in database');
    }

    // ── 6. Determine extraction path (Layer 1 vs Layer 2) ───────────────
    const ocrLayout = document.ocrLayout as OcrLayout | null;
    const useLayoutPath =
      this.shouldUseLayoutPath(ocrLayout) && !privateOptions.forceLayer1;

    // Layer 2 (layout-aware): regex-extract borrower/report metadata from
    // the FULL OCR text so Gemini can be fed only "DETALLE DE CRÉDITOS".
    // If any borrower field is null, fall back to the full Layer 1 pipeline
    // (full OCR + LEAN schema + disambiguation) — Gemini needs the full
    // document to recover borrower data. The forced call sets
    // `forceLayer1: true` so the regex attempt is NOT retried (no recursion).
    let borrowerFields: RegexBorrowerFields | null = null;
    if (useLayoutPath) {
      borrowerFields = this.extractBorrowerFromOcr(document.ocrText);
      const allPresent =
        borrowerFields.fullName != null &&
        borrowerFields.rfc != null &&
        borrowerFields.birthDate != null &&
        borrowerFields.consultationDate != null;
      if (!allPresent) {
        this.logger.warn(
          `[CreditBureau] Borrower regex extraction incomplete for doc ${documentId} ` +
            `(fullName=${borrowerFields.fullName}, rfc=${borrowerFields.rfc}, ` +
            `birthDate=${borrowerFields.birthDate}, consultationDate=${borrowerFields.consultationDate}) ` +
            `— falling back to Layer 1 (full OCR + LEAN schema).`,
        );
        return this.extract(caseId, documentId, { forceLayer1: true });
      }
    }

    // ── 7. Pre-filter OCR ──────────────────────────────────────────────
    // Layer 1: keep borrower + summary + detail (15K cap).
    // Layer 2: keep ONLY "DETALLE DE CRÉDITOS" (~5K) — borrower/report is
    // regex-extracted above, so Gemini never sees those sections.
    const MAX_OCR_CHARS = 15000;
    const ocrText = useLayoutPath
      ? this.preFilterOcrLayout(document.ocrText)
      : this.preFilterOcr(document.ocrText, MAX_OCR_CHARS);

    // ── 8. Call Gemini with LEAN instructions + (LEAN | REDUCED) schema ─
    // Layer 1 (always-on): LEAN schema + LEAN instructions replace the
    // verbose originals to cut prompt size from ~20K to ~8K chars.
    // Layer 2 (layout-active): REDUCED schema drops 4 financial fields the
    // layout extractor owns so Gemini output shrinks ~40%.
    const schema = useLayoutPath
      ? { ...CREDIT_BUREAU_SCHEMA_REDUCED }
      : { ...CREDIT_BUREAU_SCHEMA_LEAN };
    const geminiResult = await this.geminiService.extractStructuredData(
      ocrText,
      document.documentType.code,
      schema,
      CREDIT_BUREAU_INSTRUCTIONS_LEAN,
    );

    if (!geminiResult.success) {
      this.logger.warn(
        `[CreditBureau] Gemini extraction failed for doc ${documentId}: ${geminiResult.error?.code}`,
      );

      try {
        await this.prisma.document.update({
          where: { id: documentId },
          data: { documentStatusId: extractionErrorStatus.id },
        });
      } catch (dbError) {
        this.logger.error(
          `[CreditBureau] Failed to set EXTRACTION_ERROR status for doc ${documentId}: ${(dbError as Error).message}`,
        );
      }

      return {
        success: false,
        documentId,
        extractedData: geminiResult.extractedData,
        alerts: [],
        missingFields: [],
        error: geminiResult.error
          ? {
              code: geminiResult.error.code,
              message: geminiResult.error.message,
            }
          : { code: 'UNKNOWN', message: 'Extraction failed' },
      };
    }

    const data = geminiResult.extractedData as Record<string, unknown>;

    // ── Layer 2: populate borrower/report from regex extraction ────────
    // Gemini only saw "DETALLE DE CRÉDITOS" in the layout path, so its
    // borrower/report fields are unreliable. Overwrite them with the
    // regex-extracted values (already guaranteed non-null by the fallback
    // above) so the output is complete without a second Gemini call.
    if (borrowerFields) {
      const borrower = (data.borrower ?? {}) as Record<string, unknown>;
      borrower.fullName = borrowerFields.fullName;
      borrower.rfc = borrowerFields.rfc;
      borrower.birthDate = borrowerFields.birthDate;
      data.borrower = borrower;
      const report = (data.report ?? {}) as Record<string, unknown>;
      report.consultationDate = borrowerFields.consultationDate;
      data.report = report;
    }

    // ── 9. Disambiguate payment fields using OCR text (Layer 1 only) ──
    // Gemini sometimes swaps paymentDueAmount ↔ lastPaymentAmount. This
    // step cross-references the raw OCR text to correct misclassifications
    // before normalization runs.
    //
    // SKIPPED when the layout path is active: the layout extractor owns
    // financial field authority and could conflict with the regex
    // disambiguator. Layout authority is applied next in mergeLayoutWithGemini().
    if (!useLayoutPath) {
      this.disambiguatePaymentFields(data, document.ocrText);
    }

    // ── 7b. Layout-aware merge (feature-flagged) ───────────────────────
    // When USE_LAYOUT_EXTRACTION is enabled and the document has an
    // `ocrLayout`, run the deterministic LayoutFinancialExtractor and merge
    // its financial fields onto the Gemini credits using the authority
    // hierarchy (LAYOUT HIGH/MEDIUM wins, LAYOUT LOW nulls critical fields).
    // When the flag is off (default), the existing Gemini-only flow is
    // preserved and no audit fields are populated.
    this.maybeMergeLayout(data, document.ocrLayout as OcrLayout | null);

    // ── 8. Normalize credit bureau fields ──────────────────────────────
    this.normalizeCreditBureau(data);

    // ── 9. Compute alerts deterministically from normalized data ─────────
    // Alerts are computed entirely in the backend. Gemini extracts raw data only.
    data.alerts = this.computeAlerts(data);
    const missingFields = this.computeMissingFields(data);

    if (Array.isArray(data.missingFields)) {
      const existingFields: string[] = (data.missingFields as unknown[]).filter(
        (f): f is string => typeof f === 'string',
      );
      data.missingFields = [
        ...existingFields,
        ...missingFields.filter((f) => !existingFields.includes(f)),
      ];
    } else {
      data.missingFields = missingFields;
    }

    data.alerts = this.normalizeAlerts(
      (data.alerts as ExtractionAlert[]) ?? [],
    );

    // ── 10. Persist extractedData + status atomically ──────────────────
    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: data as any,
        documentStatusId: processedStatus.id,
      },
    });

    return {
      success: true,
      documentId,
      extractedData: data,
      alerts: data.alerts as ExtractionAlert[],
      missingFields,
    };
  }

  // -----------------------------------------------------------------------
  // Private: check if rawTextReference contains an observation key
  // Matches standalone 2-letter codes (word boundaries), not substrings.
  // -----------------------------------------------------------------------

  private rawHasObservationKey(
    upperRaw: string,
    keys: string[],
  ): boolean {
    if (!upperRaw) return false;
    for (const key of keys) {
      // Match key as a standalone token (surrounded by non-letter chars or string edges)
      const re = new RegExp(`(?<![A-ZÑ])${key}(?![A-ZÑ])`, 'u');
      if (re.test(upperRaw)) return true;
    }
    return false;
  }

  /**
   * Extracts 2-3 character uppercase observation keys from raw text.
   * Used as legacy fallback when observationKeys array is not provided by Gemini.
   * Only extracts keys from a known set to avoid false positives from glossary text.
   */
  private extractObservationKeys(upperRaw: string): string[] {
    const KNOWN_KEYS = [
      'UP', 'LC', 'LG', 'FD', 'FR', 'SG', 'CV', 'PC', 'VR', 'RV',
      'RI', 'FN', 'CO', 'AD', 'CL', 'CC', 'IA',
    ];
    const found = new Set<string>();
    for (const key of KNOWN_KEYS) {
      const re = new RegExp(`(?<![A-ZÑ])${key}(?![A-ZÑ])`, 'u');
      if (re.test(upperRaw)) found.add(key);
    }
    return Array.from(found);
  }

  // -----------------------------------------------------------------------
  // Phase 4: layout-aware merge (feature-flagged)
  // -----------------------------------------------------------------------
  //
  // `mergeLayoutWithGemini` combines Gemini's semantic extraction (handles
  // institution, creditType, classification, MOP, paymentHistory, …) with
  // the deterministic LayoutFinancialExtractor result (handles the 6 numeric
  // financial fields from the "Detalle de Créditos" table).
  //
  // Authority hierarchy (see design.md):
  //   • Layout HIGH confidence → LAYOUT value wins (authoritative).
  //   • Layout MEDIUM confidence → LAYOUT value wins (kept, marked MEDIUM).
  //   • Layout LOW confidence →
  //       - For `paymentDueAmount` (critical): null + needsManualReview +
  //         candidatePaymentDueAmount (Gemini original archived for audit).
  //         NEVER falls back to Gemini nor lastPaymentAmount.
  //       - For other fields: keep the Gemini value (layout LOW unusable).
  //
  // Merge key: `accountNumber + institution` (exact). When accountNumber is
  // missing for a Gemini credit, fall back to `institution + order within the
  // credits array` (Nth layout credit of the same institution) and emit a
  // warning. Credits with no layout match → financialFieldsSource=GEMINI.
  //
  // Audit fields deposited on EVERY credit:
  //   financialFieldsSource / financialFieldsConfidence (per-field map) /
  //   financialFieldsWarnings / candidatePaymentDueAmount.
  // -----------------------------------------------------------------------

  /**
   * Normalize a string for merge-key matching: strip non-alphanumeric chars
   * + uppercase. Account numbers and institution names from OCR vs Gemini
   * often differ only in punctuation/space/case.
   */
  private static normKey(account: string, institution: string): string {
    const cleanedAccount = account.replace(/[^0-9A-ZÑa-zñ]/g, '').toUpperCase();
    const cleanedInst = institution
      .replace(/[^0-9A-ZÑa-zñ]/g, '')
      .toUpperCase();
    return `${cleanedAccount}|${cleanedInst}`;
  }

  /**
   * Feature-flag gate. Resolves `USE_LAYOUT_EXTRACTION` from the NestJS
   * ConfigService. Defaults to `false` (Gemini-only flow preserved).
   */
  private isLayoutExtractionEnabled(): boolean {
    const v = this.configService.get<string>('USE_LAYOUT_EXTRACTION') ?? 'false';
    return String(v).toLowerCase() === 'true';
  }

  /**
   * Returns true when layout extraction is enabled AND the document has
   * page-level layout data available. Used to gate the layout-aware path
   * (aggressive pre-filter, reduced schema, disambiguation bypass).
   */
  private shouldUseLayoutPath(ocrLayout: OcrLayout | null): boolean {
    return this.isLayoutExtractionEnabled() && !!(ocrLayout?.pages?.length);
  }

  /**
   * Run the layout extractor + merge when the feature flag is on and the
   * document has an `ocrLayout`. Otherwise no-op (current behavior).
   */
  private maybeMergeLayout(
    data: Record<string, unknown>,
    ocrLayout: OcrLayout | null,
  ): void {
    if (!this.isLayoutExtractionEnabled()) return;
    if (!ocrLayout || !Array.isArray(ocrLayout.pages)) return;

    let layoutResult: LayoutFinancialResult;
    try {
      layoutResult = this.layoutExtractor.extract(ocrLayout);
    } catch (err) {
      this.logger.warn(
        `[CreditBureau] LayoutFinancialExtractor threw — skipping merge: ${(err as Error).message}`,
      );
      return;
    }

    // Only skip when the extractor produced zero credits (no table found).
    // Institution-less credits are still valid — they carry financial fields
    // that can be matched by orderInBlock position.
    if (layoutResult.credits.length === 0) {
      this.logger.warn(
        '[CreditBureau] Layout extractor returned 0 credits — skipping merge.',
      );
      return;
    }

    this.mergeLayoutWithGemini(data, layoutResult);
  }

  /**
   * Apply the layout→Gemini authority hierarchy and populate the audit
   * fields. Mutates `data.credits[]` in place.
   */
  private mergeLayoutWithGemini(
    data: Record<string, unknown>,
    layoutResult: LayoutFinancialResult,
  ): void {
    const credits = data.credits as Record<string, unknown>[] | undefined;
    if (!Array.isArray(credits) || credits.length === 0) return;

    const layoutCredits = layoutResult.credits;
    const layoutConfidence = layoutResult.confidence;

    // No layout credits at all → mark every credit as GEMINI and return.
    if (layoutCredits.length === 0) {
      for (const credit of credits) {
        CreditBureauExtractionService.attachAuditFields(
          credit,
          FinancialFieldsSource.GEMINI,
          null,
          [],
          null,
        );
      }
      return;
    }

    // 1. Build exact-match index `account|institution → layout credit index`.
    const exactIndex = new Map<string, number>();
    for (let i = 0; i < layoutCredits.length; i++) {
      const lc = layoutCredits[i];
      if (lc.accountNumber && lc.institution) {
        exactIndex.set(
          CreditBureauExtractionService.normKey(
            lc.accountNumber,
            lc.institution,
          ),
          i,
        );
      }
    }

    // 2. Build per-institution ordered queues for the fallback matcher.
    //    In layout-credit order (which follows `orderInBlock`), so the Nth
    //    Gemini credit of institution X pairs with the Nth layout credit of
    //    the same institution.
    const institutionQueues = new Map<string, number[]>();
    for (let i = 0; i < layoutCredits.length; i++) {
      const lc = layoutCredits[i];
      if (!lc.institution) continue;
      const key = lc.institution.toUpperCase();
      if (!institutionQueues.has(key)) institutionQueues.set(key, []);
      institutionQueues.get(key)!.push(i);
    }
    const institutionConsumed = new Map<string, number>();

    // 3. Track which layout credit indices are already claimed (exact match
    //    must not re-consume a layout credit that the fallback would use).
    const claimed = new Set<number>();

    for (const credit of credits) {
      const gAccount = (credit.accountNumber as string | undefined) ?? null;
      const gInstRaw = (credit.institution as string | undefined) ?? '';
      const gInst = gInstRaw.toUpperCase().replace(/\s+/g, ' ').trim();

      let matchIdx = -1;
      let usedFallback = false;
      const warnings: string[] = [];

      // a) Exact match account+institution (preferred).
      if (gAccount && gInst) {
        const key = CreditBureauExtractionService.normKey(gAccount, gInst);
        const idx = exactIndex.get(key);
        if (idx !== undefined && !claimed.has(idx)) {
          matchIdx = idx;
        }
      }

      // b) Fallback: institution + order within credit block.
      if (matchIdx === -1 && gInst && institutionQueues.has(gInst)) {
        const queue = institutionQueues.get(gInst)!;
        const consumed = institutionConsumed.get(gInst) ?? 0;
        for (let q = consumed; q < queue.length; q++) {
          if (!claimed.has(queue[q])) {
            matchIdx = queue[q];
            institutionConsumed.set(gInst, q + 1);
            usedFallback = true;
            break;
          }
        }
      }

      // c) Fallback: pure orderInBlock position (when institution is
      //    unavailable on either side). Useful for PDFs where the extractor
      //    captures financial columns but fails to read institution names.
      if (matchIdx === -1) {
        // Use Nth Gemini credit → Nth unclaimed layout credit.
        const geminiPos = credits.indexOf(credit);
        const unclaimed = layoutCredits
          .map((_, i) => i)
          .filter((i) => !claimed.has(i));
        if (geminiPos < unclaimed.length) {
          matchIdx = unclaimed[geminiPos];
          usedFallback = true;
          warnings.push(
            'Matched by orderInBlock position (institution unavailable).',
          );
        }
      }

      // d) No layout match → when layout is enabled, NEVER let Gemini be
      //    the authoritative source for paymentDueAmount. Null it and flag
      //    for manual review — the whole point of the layout-aware change
      //    is to stop depending on Gemini for this field.
      if (matchIdx === -1) {
        const geminiDue = credit.paymentDueAmount as number | null;
        credit.paymentDueAmount = null;
        credit.candidatePaymentDueAmount = geminiDue;
        credit.needsManualReview = true;
        credit.paymentDueAmountSource = 'UNCONFIRMED';
        CreditBureauExtractionService.attachAuditFields(
          credit,
          FinancialFieldsSource.MANUAL_REVIEW,
          null,
          [
            'paymentDueAmount set to null (no layout match). Manual review required — Gemini candidate archived.',
          ],
          geminiDue,
        );
        this.logger.warn(
          `[CreditBureau] MANUAL_REVIEW for "${gInstRaw || 'unknown'}": ` +
            `no layout match — paymentDueAmount nulled (Gemini candidate=${geminiDue}).`,
        );
        continue;
      }

      claimed.add(matchIdx);

      const lc = layoutCredits[matchIdx];
      const fieldConfidence = layoutConfidence[matchIdx] as FinancialFieldsConfidenceMap;
      if (usedFallback) {
        warnings.push(
          `Matched by institution-only fallback (accountNumber missing) for "${gInstRaw || gInst}".`,
        );
      }

      // 4. Apply authority hierarchy per financial field.
      let anyLayoutFieldUsed = false;
      let criticalNeedsManualReview = false;
      const geminiDue = credit.paymentDueAmount as number | null;

      for (const field of FINANCIAL_FIELDS) {
        const confidence = fieldConfidence[field];
        const layoutVal = lc.fields[field] as number | null;

        if (
          confidence === FinancialFieldsConfidence.HIGH ||
          confidence === FinancialFieldsConfidence.MEDIUM
        ) {
          // Layout value wins for HIGH and MEDIUM.
          (credit as Record<string, unknown>)[field] = layoutVal;
          anyLayoutFieldUsed = true;
        } else {
          // Layout LOW confidence.
          if (field === 'paymentDueAmount') {
            // CRITICAL: paymentDueAmount comes ONLY from layout "Monto a Pagar".
            // If layout cannot confirm it with HIGH or MEDIUM, set it to null
            // (NOT Gemini's value, NOT lastPaymentAmount) and flag for review.
            credit.paymentDueAmount = null;
            credit.candidatePaymentDueAmount = geminiDue;
            credit.needsManualReview = true;
            credit.paymentDueAmountSource = 'UNCONFIRMED';
            criticalNeedsManualReview = true;
          }
          // For non-critical LOW fields: keep the Gemini value untouched.
        }
      }

      // When paymentDueAmount was overridden by LAYOUT HIGH/MEDIUM, preserve
      // the original Gemini amount as candidatePaymentDueAmount for audit.
      if (
        !criticalNeedsManualReview &&
        (fieldConfidence.paymentDueAmount === FinancialFieldsConfidence.HIGH ||
          fieldConfidence.paymentDueAmount === FinancialFieldsConfidence.MEDIUM)
      ) {
        credit.candidatePaymentDueAmount = geminiDue;
        credit.paymentDueAmountSource = 'CONFIRMED_AUTO';
      }

      // 5. Decide the coarse financialFieldsSource value.
      let source: FinancialFieldsSource;
      if (criticalNeedsManualReview) {
        source = FinancialFieldsSource.MANUAL_REVIEW;
        warnings.push(
          'paymentDueAmount set to null (layout LOW confidence). Manual review required.',
        );
      } else if (anyLayoutFieldUsed) {
        source = FinancialFieldsSource.LAYOUT;
      } else {
        source = FinancialFieldsSource.GEMINI;
      }

      CreditBureauExtractionService.attachAuditFields(
        credit,
        source,
        fieldConfidence,
        warnings,
        credit.candidatePaymentDueAmount as number | null,
      );

      if (criticalNeedsManualReview) {
        this.logger.warn(
          `[CreditBureau] MANUAL_REVIEW for "${gInstRaw}": paymentDueAmount nulled ` +
            `(Gemini candidate=${geminiDue}).`,
        );
      }
    }
  }

  /**
   * Attach the four audit fields to a credit object. Centralised so the
   * unmatched and matched branches stay consistent.
   */
  private static attachAuditFields(
    credit: Record<string, unknown>,
    source: FinancialFieldsSource,
    confidence: FinancialFieldsConfidenceMap | null,
    warnings: string[],
    candidatePaymentDueAmount: number | null,
  ): void {
    credit.financialFieldsSource = source;
    credit.financialFieldsConfidence = confidence;
    credit.financialFieldsWarnings = warnings;
    credit.candidatePaymentDueAmount = candidatePaymentDueAmount;
  }

  // -----------------------------------------------------------------------
  // Private: normalize credit bureau fields post-Gemini
  // -----------------------------------------------------------------------

  private normalizeCreditBureau(data: Record<string, unknown>): void {
    const credits = data.credits as Record<string, unknown>[] | undefined;
    const report = (data.report ?? {}) as Record<string, unknown>;

    // ── Score normalization ──────────────────────────────────────────────
    // ISO-001/002/003 + SCO-001/002/003: Score is extracted from a separate
    // CREDIT_SCORE document. The bureau report MUST NOT carry a score value.
    // Force publicScore to null regardless of what Gemini returns, so no
    // score bleed happens and no score-related alerts fire from bureau.
    if (report.publicScore != null) {
      this.logger.warn(
        `[CreditBureau] Ignoring publicScore from bureau report (score belongs to CREDIT_SCORE doc)`,
      );
      report.publicScore = null;
    }

    // ── Credits normalization ────────────────────────────────────────────
    if (Array.isArray(credits)) {
      for (const credit of credits) {
        // Normalize currency
        const currency = (credit.currency as string | undefined) ?? null;
        if (!currency || currency.trim() === '') {
          credit.currency = 'MXN';
        } else {
          const normalized = currency.toUpperCase().trim();
          if (!['MXN', 'USD', 'OTHER'].includes(normalized)) {
            credit.currency = 'OTHER';
          } else {
            credit.currency = normalized;
          }
        }

        // Validate MOP codes and deduplicate consecutive repeats (OCR ghosts)
        const mopCodes = credit.mopCodes as string[] | undefined;
        if (Array.isArray(mopCodes)) {
          const validCodes = mopCodes
            .map((mop) => String(mop).trim())
            .filter((code) => VALID_MOP_CODES.has(code) || /^\d$/.test(code));
          // Deduplicate consecutive identical codes (OCR often repeats adjacent cells)
          const deduped: string[] = [];
          for (const code of validCodes) {
            if (deduped.length === 0 || deduped[deduped.length - 1] !== code) {
              deduped.push(code);
            }
          }
          credit.mopCodes = deduped;
        }

        // Compute boolean flags from MOP + observation keys if not already set
        const codes = Array.isArray(mopCodes)
          ? mopCodes.map((c) => String(c).trim())
          : [];
        const rawText = (credit.rawTextReference as string) ?? '';
        const upperRaw = rawText.toUpperCase();

        // Normalize observationKeys: prefer the array, fall back to rawTextReference
        let obsKeys: string[] = [];
        if (Array.isArray(credit.observationKeys)) {
          obsKeys = credit.observationKeys
            .map((k: unknown) => String(k).toUpperCase().trim())
            .filter((k) => k.length >= 2 && k.length <= 3);
        } else if (upperRaw) {
          // Legacy fallback: extract 2-3 char uppercase keys from rawTextReference
          obsKeys = this.extractObservationKeys(upperRaw);
        }
        credit.observationKeys = obsKeys;

        // hasLatePayments: any MOP >= 2 (MOP 0-1 are "al corriente", not late)
        if (credit.hasLatePayments == null) {
          credit.hasLatePayments = codes.some((c) =>
            ['2', '3', '4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasSeriousDelinquency: any MOP >= 4 (90+ days)
        if (credit.hasSeriousDelinquency == null) {
          credit.hasSeriousDelinquency = codes.some((c) =>
            ['4', '5', '6', '7', '8', '9'].includes(c),
          );
        }

        // hasWriteOff: ONLY observation key UP (quebranto)
        if (credit.hasWriteOff == null) {
          credit.hasWriteOff = obsKeys.includes('UP') ||
            this.rawHasObservationKey(upperRaw, ['UP']);
        }

        // hasSettlementOrDiscount: observation keys LC or LG (quita)
        if (credit.hasSettlementOrDiscount == null) {
          credit.hasSettlementOrDiscount = obsKeys.includes('LC') ||
            obsKeys.includes('LG') ||
            this.rawHasObservationKey(upperRaw, ['LC', 'LG']);
        }

        // hasFraudFlag: ONLY observation key FD
        if (credit.hasFraudFlag == null) {
          credit.hasFraudFlag = obsKeys.includes('FD') ||
            this.rawHasObservationKey(upperRaw, ['FD']);
        }

        // hasIdentityTheft: observation key RI (NOT fraud)
        if (credit.hasIdentityTheft == null) {
          credit.hasIdentityTheft = obsKeys.includes('RI') ||
            this.rawHasObservationKey(upperRaw, ['RI']);
        }

        // Validate classification enum
        const validClassifications = [
          'REVOLVING',
          'FIXED_PAYMENT',
          'MORTGAGE',
          'AUTO',
          'PERSONAL_LOAN',
          'DEPARTMENT_STORE',
          'NON_BANK_SERVICE',
          'UNKNOWN',
        ];
        if (
          credit.classification &&
          !validClassifications.includes(credit.classification as string)
        ) {
          credit.classification = 'UNKNOWN';
        }

        // Validate status enum
        const validStatuses = ['ACTIVE', 'CLOSED', 'UNKNOWN'];
        if (
          credit.status &&
          !validStatuses.includes(credit.status as string)
        ) {
          credit.status = 'UNKNOWN';
        }

        // ── isClosed + monthlyDebtContribution (CLS-001/002/003/004) ──────────
        //
        // Layout-aware rule: only feed paymentDueAmount into the
        // ── Payment Due Guardrail (Sprint 3 prep) ──────────────────────
        // Default source for credits that didn't go through layout merge
        // (Gemini-only path, or legacy extractions): treat as UNCONFIRMED.
        if (!credit.paymentDueAmountSource) {
          credit.paymentDueAmountSource = 'UNCONFIRMED';
        }

        // monthly debt computation: only CONFIRMED_AUTO or MANUAL amounts
        // are allowed to contribute. UNCONFIRMED and needsManualReview
        // credits are blocked — the analyst must confirm/override first.
        credit.isClosed = credit.status === 'CLOSED';
        if (credit.isClosed) {
          credit.monthlyDebtContribution = 0;
        } else if (credit.status === 'ACTIVE') {
          const source = credit.paymentDueAmountSource as string;
          const needsReview = credit.needsManualReview === true;

          if (source === 'UNCONFIRMED' || needsReview) {
            // Guardrail: block unconfirmed amounts from liability calc.
            credit.monthlyDebtContribution = null;
            const warnings = (credit.financialFieldsWarnings as string[]) ?? [];
            const WARNING = needsReview
              ? 'monthlyDebtContribution set to null (needsManualReview).'
              : 'monthlyDebtContribution set to null (paymentDueAmountSource=UNCONFIRMED).';
            if (!warnings.includes(WARNING)) warnings.push(WARNING);
            credit.financialFieldsWarnings = warnings;
          } else {
            credit.monthlyDebtContribution =
              (credit.paymentDueAmount as number | null) ?? null;
          }
        } else {
          credit.monthlyDebtContribution = null;
        }

        // ── Payment fields: coerce to number | null (PAY-003) ────────────
        if (
          credit.paymentDueAmount != null &&
          typeof credit.paymentDueAmount !== 'number'
        ) {
          credit.paymentDueAmount = null;
        }
        if (credit.paymentDueAmount == null) {
          credit.paymentDueAmount = null;
        }
        if (
          credit.lastPaymentAmount != null &&
          typeof credit.lastPaymentAmount !== 'number'
        ) {
          credit.lastPaymentAmount = null;
        }
        if (credit.lastPaymentAmount == null) {
          credit.lastPaymentAmount = null;
        }

        // ── PAY-004: Detect suspicious identical values (likely misclassified) ─
        // Only warn when both are non-zero and equal. Zero is legitimate for
        // closed credits or credits with no payment activity.
        if (
          credit.paymentDueAmount != null &&
          credit.lastPaymentAmount != null &&
          credit.paymentDueAmount !== 0 &&
          credit.lastPaymentAmount !== 0 &&
          credit.paymentDueAmount === credit.lastPaymentAmount
        ) {
          this.logger.warn(
            `[CreditBureau] Suspicious: paymentDueAmount === lastPaymentAmount ` +
              `(${credit.paymentDueAmount}) for ${credit.institution ?? 'unknown'}. ` +
              `Gemini may have misclassified the payment column. ` +
              `Verify against the original PDF — these are likely the same value ` +
              `extracted into both fields.`,
          );
        }
      }
    }

    // ── Risk summary: ensure booleans from credits ───────────────────────
    const riskSummary = (data.riskSummary ?? {}) as Record<string, unknown>;
    if (Array.isArray(credits) && credits.length > 0) {
      if (riskSummary.hasWriteOff == null) {
        riskSummary.hasWriteOff = credits.some(
          (c) => c.hasWriteOff === true,
        );
      }
      if (riskSummary.hasSettlementOrDiscount == null) {
        riskSummary.hasSettlementOrDiscount = credits.some(
          (c) => c.hasSettlementOrDiscount === true,
        );
      }
      if (riskSummary.hasFraudFlag == null) {
        riskSummary.hasFraudFlag = credits.some(
          (c) => c.hasFraudFlag === true,
        );
      }
      if (riskSummary.hasIdentityTheft == null) {
        riskSummary.hasIdentityTheft = credits.some(
          (c) => c.hasIdentityTheft === true,
        );
      }
      if (riskSummary.hasMinorDelinquency == null) {
        riskSummary.hasMinorDelinquency = credits.some(
          (c) => c.hasLatePayments === true && c.hasSeriousDelinquency !== true,
        );
      }
      if (riskSummary.hasSeriousDelinquency == null) {
        riskSummary.hasSeriousDelinquency = credits.some(
          (c) => c.hasSeriousDelinquency === true,
        );
      }
    }

    data.riskSummary = riskSummary;
  }

  // -----------------------------------------------------------------------
  // Private: payment field disambiguation using OCR text
  // -----------------------------------------------------------------------
  // Gemini sometimes swaps paymentDueAmount ↔ lastPaymentAmount.
  //
  // Strategy (hybrid position + name matching):
  //   1. Find ALL "NO APLICA" anchors in the DETALLE section.
  //   2. For each anchor, extract lastPayment (number before), paymentDue
  //      (number after followed by PAGO/MENSUAL), AND the nearby institution
  //      name from the preceding lines.
  //   3. Match each Gemini credit to its OCR pair by institution name
  //      similarity (exact > first-two-words > first-word-only).
  //   4. When multiple credits share the same institution, match by order
  //      within that group.
  //
  // This is more robust than pure index matching because it survives
  // credits that lack "NO APLICA" (which would shift all subsequent indices).
  // -----------------------------------------------------------------------

  // -----------------------------------------------------------------------
  // Types
  // -----------------------------------------------------------------------


  /**
   * Parses a numeric string that may contain comma thousand separators.
   * Rejects values > 8 digits (account numbers).
   */
  private parseOcrAmount(raw: string): number | null {
    if (!raw) return null;
    const cleaned = raw.replace(/,/g, '').trim();
    if (cleaned.length > 8) return null;
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  /**
   * Sanity-checks whether a value is a plausible payment amount.
   * Rejects years, MOP code patterns, installment counts, and outliers.
   */
  private isValidPaymentAmount(
    value: number | null,
    field: 'due' | 'last',
  ): boolean {
    if (value == null || value < 0) return false;
    if (value >= 2020 && value <= 2031) return false;
    const str = String(value);
    if (str.length >= 4 && /^(\d)\1{3,}$/.test(str)) return false;
    if (
      field === 'last' &&
      [12, 24, 36, 48, 60, 72, 84, 96].includes(value)
    )
      return false;
    if (field === 'due' && value > 500_000) return false;
    if (field === 'last' && value > 10_000_000) return false;
    return true;
  }

  /**
   * Extracts paymentDueAmount from text after a NO APLICA anchor.
   *
   * Algorithm:
   *   1. Find the first PAGO or MENSUAL keyword after NO APLICA.
   *   2. Scan backward from the keyword for the nearest number (1-9 chars,
   *      may include commas).
   *   3. That number is paymentDueAmount — NEVER fall back to lastPaymentAmount.
   */
  private extractPaymentDueFromOcr(afterNoAplica: string): number | null {
    const keywordMatch = afterNoAplica.match(/\b(PAGO|MENSUAL)\b/i);
    if (!keywordMatch || keywordMatch.index == null) return null;

    const keywordIdx = keywordMatch.index;
    const beforeKeyword = afterNoAplica.slice(0, keywordIdx);
    const numberMatches = [...beforeKeyword.matchAll(/([\d,]{1,9})/g)];
    if (numberMatches.length === 0) return null;

    const lastNumberMatch = numberMatches[numberMatches.length - 1];
    const candidate = this.parseOcrAmount(lastNumberMatch[1]);
    if (candidate == null || !this.isValidPaymentAmount(candidate, 'due'))
      return null;

    return candidate;
  }

  /**
   * Extracts the institution name from the text preceding an OCR anchor.
   * In the credit bureau detail, institution names appear on their own line
   * with only uppercase letters, spaces, and sometimes "*".
   */
  private extractNearbyInstitution(
    detailOcr: string,
    anchorIdx: number,
  ): string {
    // Look back up to 400 chars before the anchor
    const start = Math.max(0, anchorIdx - 400);
    const before = detailOcr.slice(start, anchorIdx);
    const lines = before.split(/\r?\n/);

    // Walk backwards through lines looking for an institution name.
    // Institution lines: all-uppercase, 3+ chars, not purely numeric,
    // and not data lines (which contain dates, amounts, or MOP codes).
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i].trim();
      if (!line || line.length < 3) continue;

      const upper = line.toUpperCase();

      // Skip lines that are clearly NOT institution names
      if (/^\d/.test(upper)) continue; // starts with digit
      if (/\b(MES|EFMAMJJASOND|CUENTA|PAGO|MENSUAL|CRÉDITO|INDIVIDUAL|REVOLVENTE|COMPRA|TARJETA|LÍNEA|SIN\s+LÍMITE|OTROS|PAGOS\s+FIJOS)\b/i.test(upper)) continue;
      if (/^\d{4}$/.test(upper)) continue; // year line
      if (/^[0-9U\-,\s]+$/.test(upper)) continue; // MOP codes or numbers only

      // This looks like an institution name.
      // Strip trailing account numbers (10+ digit sequences) and asterisks
      // so "SOFOM INBURSA 4737011813185955" becomes "SOFOM INBURSA"
      let name = upper.replace(/\s+/g, ' ').trim();
      name = name.replace(/\s*\*?\s*\d{10,}\s*$/, '').trim();
      return name;
    }

    return '';
  }

  /**
   * Extracts all payment pairs from the detail section, each with its
   * nearby institution name for matching.
   */
  private extractAllPaymentPairs(
    detailOcr: string,
  ): Array<{
    lastPayment: number | null;
    paymentDue: number | null;
    institution: string;
  }> {
    const pairs: Array<{
      lastPayment: number | null;
      paymentDue: number | null;
      institution: string;
    }> = [];
    const lastPaymentRegex = /([\d,]{1,9})\s+NO\s+APLICA/gi;
    let match: RegExpExecArray | null;

    while ((match = lastPaymentRegex.exec(detailOcr)) !== null) {
      const lastPayment = this.parseOcrAmount(match[1]);

      // Extract paymentDueAmount after this NO APLICA.
      // Algorithm: find the PAGO/MENSUAL keyword, then scan backward
      // for the nearest number. Never fall back to lastPaymentAmount.
      const after = detailOcr.slice(
        match.index + match[0].length,
        match.index + match[0].length + 250,
      );

      const paymentDue = this.extractPaymentDueFromOcr(after);

      // Extract nearby institution name
      const institution = this.extractNearbyInstitution(
        detailOcr,
        match.index,
      );

      // Sanity checks
      const validLast = this.isValidPaymentAmount(lastPayment, 'last');
      const validDue =
        paymentDue != null &&
        this.isValidPaymentAmount(paymentDue, 'due');

      pairs.push({
        lastPayment: validLast ? lastPayment : null,
        paymentDue: validDue ? paymentDue : null,
        institution,
      });
    }

    return pairs;
  }

  /**
   * Scores how well an OCR institution name matches a Gemini credit's
   * institution. Higher = better match.
   *   3 = exact match
   *   2 = first two words match
   *   1 = first word matches (len >= 4)
   *   0 = no match
   */
  private institutionMatchScore(
    ocrInst: string,
    geminiInst: string,
  ): number {
    // Normalize: strip trailing account numbers (10+ digits) from both sides
    const normalize = (s: string) =>
      s.toUpperCase().replace(/\s+/g, ' ').replace(/\s*\d{10,}\s*$/, '').trim();

    const a = normalize(ocrInst);
    const b = normalize(geminiInst);
    if (!a || !b) return 0;
    if (a === b) return 3;

    const aWords = a.split(' ');
    const bWords = b.split(' ');
    if (
      aWords.length >= 2 &&
      bWords.length >= 2 &&
      aWords[0] === bWords[0] &&
      aWords[1] === bWords[1]
    )
      return 2;

    if (
      aWords[0].length >= 4 &&
      bWords[0].length >= 4 &&
      aWords[0] === bWords[0]
    )
      return 1;

    return 0;
  }

  /**
   * Main disambiguation entry point.
   *
   * Matches each Gemini credit to its OCR payment pair by institution name
   * similarity. When multiple credits share the same institution, they are
   * matched in order (first Gemini → first OCR pair for that institution,
   * second → second, etc.).
   */
  private disambiguatePaymentFields(
    data: Record<string, unknown>,
    ocrText: string,
  ): void {
    const credits = data.credits as Record<string, unknown>[] | undefined;
    if (!Array.isArray(credits) || credits.length === 0 || !ocrText) return;

    // ── 1. Locate DETALLE DE CRÉDITOS section ──────────────────────────
    const upperOcr = ocrText.toUpperCase();
    let detalleIdx = upperOcr.indexOf('DETALLE DE CRÉDITOS');
    if (detalleIdx === -1) {
      detalleIdx = upperOcr.indexOf('DETALLE DE CREDITOS');
    }
    if (detalleIdx === -1) return;

    const detailOcr = ocrText.slice(detalleIdx);

    // ── 2. Extract all payment pairs with institution names ────────────
    const ocrPairs = this.extractAllPaymentPairs(detailOcr);
    if (ocrPairs.length === 0) return;

    // ── 3. Match each Gemini credit to an OCR pair ─────────────────────
    // Track which OCR pairs have been consumed, and per-institution counters.
    const usedPairs = new Set<number>();
    const instCounters = new Map<string, number>();
    let corrections = 0;

    for (const credit of credits) {
      const geminiInst = ((credit.institution as string) ?? '')
        .toUpperCase()
        .replace(/\s+/g, ' ')
        .trim();
      if (!geminiInst) continue;

      // Which occurrence of this institution are we on?
      const instCounter = instCounters.get(geminiInst) ?? 0;
      instCounters.set(geminiInst, instCounter + 1);

      // Find the Nth best-matching OCR pair for this institution
      let matchCount = 0;
      let bestPairIdx = -1;

      for (let i = 0; i < ocrPairs.length; i++) {
        if (usedPairs.has(i)) continue;
        const score = this.institutionMatchScore(
          ocrPairs[i].institution,
          geminiInst,
        );
        if (score >= 1 && matchCount === instCounter) {
          bestPairIdx = i;
          break;
        }
        if (score >= 1) matchCount++;
      }

      if (bestPairIdx === -1) continue;
      usedPairs.add(bestPairIdx);

      const ocr = ocrPairs[bestPairIdx];
      const geminiDue = credit.paymentDueAmount as number | null;
      const geminiLast = credit.lastPaymentAmount as number | null;
      const instLabel =
        (credit.institution as string) || `credit[${bestPairIdx}]`;

      if (ocr.lastPayment != null && ocr.lastPayment !== geminiLast) {
        this.logger.warn(
          `[CreditBureau] DISAMBIGUATE lastPaymentAmount for "${instLabel}": ` +
            `Gemini=${geminiLast} → OCR=${ocr.lastPayment}`,
        );
        credit.lastPaymentAmount = ocr.lastPayment;
        corrections++;
      }

      if (ocr.paymentDue != null && ocr.paymentDue !== geminiDue) {
        this.logger.warn(
          `[CreditBureau] DISAMBIGUATE paymentDueAmount for "${instLabel}": ` +
            `Gemini=${geminiDue} → OCR=${ocr.paymentDue}`,
        );
        credit.paymentDueAmount = ocr.paymentDue;
        corrections++;
      }
    }

    if (corrections > 0) {
      this.logger.log(
        `[CreditBureau] Payment disambiguation: ${corrections} correction(s) ` +
          `applied across ${credits.length} credits (${ocrPairs.length} OCR pairs)`,
      );
    }
  }

  // -----------------------------------------------------------------------
  // Private: alert computation — BURO_ codes
  // -----------------------------------------------------------------------

  private computeAlerts(data: Record<string, unknown>): ExtractionAlert[] {
    const alerts: ExtractionAlert[] = [];

    const credits = data.credits as Record<string, unknown>[] | undefined;
    const report = (data.report ?? {}) as Record<string, unknown>;
    const riskSummary = (data.riskSummary ?? {}) as Record<string, unknown>;
    const borrower = (data.borrower ?? {}) as Record<string, unknown>;

    // ── BURO_NO_CREDITS — credits[] empty ────────────────────────────────
    const hasCredits = Array.isArray(credits) && credits.length > 0;
    if (!hasCredits) {
      alerts.push({
        code: 'BURO_NO_CREDITS',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'No se detectaron créditos en el reporte de buró. Verificar que el OCR haya extraído correctamente.',
        field: 'credits',
        requiresManualReview: true,
      });
    }

    // ── BURO_SERIOUS_DELINQUENCY — any credit with MOP >= 4 ──────────────
    if (riskSummary.hasSeriousDelinquency === true) {
      alerts.push({
        code: 'BURO_SERIOUS_DELINQUENCY',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con morosidad grave (90+ días de atraso). Revisar detalle de créditos.',
        field: 'credits[].hasSeriousDelinquency',
        requiresManualReview: true,
      });
    }

    // ── BURO_WRITE_OFF — any credit with quebranto ───────────────────────
    if (riskSummary.hasWriteOff === true) {
      alerts.push({
        code: 'BURO_WRITE_OFF',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con quebranto (pérdida total para el otorgante). Riesgo crediticio severo.',
        field: 'credits[].hasWriteOff',
        requiresManualReview: true,
      });
    }

    // ── BURO_SETTLEMENT_OR_DISCOUNT — any credit with quita ──────────────
    if (riskSummary.hasSettlementOrDiscount === true) {
      alerts.push({
        code: 'BURO_SETTLEMENT_OR_DISCOUNT',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron créditos con quita o descuento (clave LC/LG). Implica acuerdo de pago reducido.',
        field: 'credits[].hasSettlementOrDiscount',
        requiresManualReview: true,
      });
    }

    // ── BURO_FRAUD — any credit with fraud flag ──────────────────────────
    if (riskSummary.hasFraudFlag === true) {
      alerts.push({
        code: 'BURO_FRAUD_FLAG',
        severity: 'CRITICAL',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectó marca de fraude en al menos un crédito. Requiere investigación inmediata.',
        field: 'credits[].hasFraudFlag',
        requiresManualReview: true,
      });
    }

    // ── BURO_PREVENTIVE_KEYS — claves de observación de riesgo ──────────
    if (riskSummary.hasPreventiveKeys === true) {
      alerts.push({
        code: 'BURO_PREVENTIVE_KEYS',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron claves de observación preventivas (quita, cobranza, reestructura, etc.). Revisar detalle.',
        field: 'riskSummary.hasPreventiveKeys',
        requiresManualReview: true,
      });
    }

    // ── BURO_MINOR_DELINQUENCY — atrasos leves ──────────────────────────
    if (
      riskSummary.hasMinorDelinquency === true &&
      riskSummary.hasSeriousDelinquency !== true
    ) {
      alerts.push({
        code: 'BURO_MINOR_DELINQUENCY',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Se detectaron atrasos menores (1-89 días) en algunos créditos. No es crítico pero revisar.',
        field: 'credits[].hasLatePayments',
        requiresManualReview: false,
      });
    }

    // ── BURO_MISSING_BORROWER — borrower info incomplete ─────────────────
    const fullName = borrower.fullName as string | undefined | null;
    const rfc = borrower.rfc as string | undefined | null;
    if (!fullName || fullName.trim() === '') {
      alerts.push({
        code: 'BURO_MISSING_BORROWER_NAME',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se pudo extraer el nombre del acreditado del reporte de buró.',
        field: 'borrower.fullName',
        requiresManualReview: true,
      });
    }
    if (!rfc || rfc.trim() === '') {
      alerts.push({
        code: 'BURO_MISSING_BORROWER_RFC',
        severity: 'WARNING',
        category: 'IDENTITY',
        message:
          'No se pudo extraer el RFC del acreditado del reporte de buró.',
        field: 'borrower.rfc',
        requiresManualReview: true,
      });
    }

    // ── BURO_HOMONYM — possible homonym ──────────────────────────────────
    if (riskSummary.possibleHomonym === true) {
      alerts.push({
        code: 'BURO_POSSIBLE_HOMONYM',
        severity: 'WARNING',
        category: 'CREDIT_BUREAU',
        message:
          'Posible homónimo detectado. Créditos en el reporte podrían no corresponder al acreditado.',
        field: 'riskSummary.possibleHomonym',
        requiresManualReview: true,
      });
    }

    // ── BURO_ACTIVE_CREDITS_COUNT — count active credits ─────────────────
    if (Array.isArray(credits)) {
      const activeCredits = credits.filter(
        (c) => c.status === 'ACTIVE',
      );
      const revolvingWithBalance = credits.filter(
        (c) =>
          c.classification === 'REVOLVING' &&
          c.status === 'ACTIVE' &&
          c.currentBalance != null &&
          (c.currentBalance as number) > 0,
      );

      if (activeCredits.length > 5) {
        alerts.push({
          code: 'BURO_HIGH_CREDIT_COUNT',
          severity: 'INFO',
          category: 'CREDIT_BUREAU',
          message: `El acreditado tiene ${activeCredits.length} créditos activos. Considerar nivel de endeudamiento.`,
          field: 'credits',
          requiresManualReview: false,
        });
      }

      if (revolvingWithBalance.length > 3) {
        alerts.push({
          code: 'BURO_HIGH_REVOLVING_COUNT',
          severity: 'INFO',
          category: 'CREDIT_BUREAU',
          message: `El acreditado tiene ${revolvingWithBalance.length} créditos revolventes activos con saldo.`,
          field: 'credits',
          requiresManualReview: false,
        });
      }
    }

    // ── BURO_MISSING_BALANCE — active credits without currentBalance (null only) ─
    // BAL-001: null triggers alert. BAL-002: 0 does NOT trigger (explicitly zero).
    // BAL-003: write-off credits excluded from balance alert.
    if (Array.isArray(credits)) {
      const activeWithoutBalance = credits.filter(
        (c) =>
          c.status === 'ACTIVE' &&
          c.currentBalance == null &&
          c.hasWriteOff !== true,
      );
      if (activeWithoutBalance.length > 0) {
        alerts.push({
          code: 'BURO_MISSING_BALANCE',
          severity: 'WARNING',
          category: 'CREDIT_BUREAU',
          message: `Hay ${activeWithoutBalance.length} crédito(s) activo(s) sin saldo actual detectable. Verificar montos.`,
          field: 'credits[].currentBalance',
          requiresManualReview: true,
        });
      }
    }

    return alerts;
  }

  // -----------------------------------------------------------------------
  // Private: missing field detection
  // -----------------------------------------------------------------------

  private computeMissingFields(data: Record<string, unknown>): string[] {
    const missing: string[] = [];
    const borrower = (data.borrower ?? {}) as Record<string, unknown>;
    const report = (data.report ?? {}) as Record<string, unknown>;

    // Borrower
    if (
      !borrower.fullName ||
      (borrower.fullName as string)?.trim() === ''
    ) {
      missing.push('borrower.fullName');
    }
    if (!borrower.rfc || (borrower.rfc as string)?.trim() === '') {
      missing.push('borrower.rfc');
    }

    // Report
    if (!report.consultationDate) {
      missing.push('report.consultationDate');
    }
    // NOTE: report.publicScore is NOT a missing field — score is optional in
    // bureau-only extraction (it comes from a separate CREDIT_SCORE document).
    // See SCO-001/002/003.

    return missing;
  }

  // -----------------------------------------------------------------------
  // Private: normalize alerts to Spanish
  // -----------------------------------------------------------------------

  private normalizeAlerts(alerts: ExtractionAlert[]): ExtractionAlert[] {
    return alerts.map((a) => {
      const map: Record<string, string> = {
        'No credits found in report.':
          'No se detectaron créditos en el reporte.',
        'Serious delinquency detected.':
          'Se detectó morosidad grave.',
        'Write-off detected.':
          'Se detectó crédito con quebranto.',
        'Fraud flag detected.':
          'Se detectó marca de fraude.',
        'Preventive observation keys detected.':
          'Se detectaron claves de observación preventivas.',
        'Low credit score.':
          'Mi Score bajo detectado.',
        'Missing borrower information.':
          'Falta información del acreditado.',
      };
      const tr = map[a.message];
      return tr ? { ...a, message: tr } : a;
    });
  }

  /**
   * Allows an analyst to confirm or manually override a credit's
   * `paymentDueAmount`. Reads the document, updates the specified credit
   * index in `extractedData.credits[]`, recalculates
   * `monthlyDebtContribution`, and persists.
   *
   * Called by `PATCH /documents/:id/credits/:index/payment-due`.
   */
  async updatePaymentDue(
    documentId: string,
    creditIndex: number,
    body: { paymentDueAmountManualOverride?: number; paymentDueAmountConfirmed?: boolean },
  ) {
    const doc = await this.prisma.document.findUnique({
      where: { id: documentId },
    });
    if (!doc || !doc.extractedData) {
      throw new Error('Document not found or has no extracted data');
    }

    const data = doc.extractedData as Record<string, unknown>;
    const credits = data.credits as Record<string, unknown>[] | undefined;
    if (!credits || creditIndex < 0 || creditIndex >= credits.length) {
      throw new Error(`Credit index ${creditIndex} out of bounds (0-${(credits?.length ?? 0) - 1})`);
    }

    const credit = credits[creditIndex];

    if (body.paymentDueAmountManualOverride !== undefined) {
      credit.paymentDueAmount = body.paymentDueAmountManualOverride;
      credit.paymentDueAmountManualOverride = body.paymentDueAmountManualOverride;
      credit.paymentDueAmountSource = 'MANUAL';
      credit.paymentDueAmountConfirmed = true;
      credit.needsManualReview = false;
    } else if (body.paymentDueAmountConfirmed === true) {
      credit.paymentDueAmountConfirmed = true;
      // Don't change source — leave as CONFIRMED_AUTO if it was already set,
      // only upgrade UNCONFIRMED → CONFIRMED_AUTO when confirming.
      if (credit.paymentDueAmountSource === 'UNCONFIRMED') {
        credit.paymentDueAmountSource = 'CONFIRMED_AUTO';
      }
      credit.needsManualReview = false;
    }

    // Recalculate monthlyDebtContribution for this credit
    const status = credit.status as string;
    const isClosed = status === 'CLOSED';
    if (isClosed) {
      credit.monthlyDebtContribution = 0;
    } else if (status === 'ACTIVE') {
      const source = credit.paymentDueAmountSource as string;
      if (source === 'UNCONFIRMED') {
        credit.monthlyDebtContribution = null;
      } else {
        credit.monthlyDebtContribution =
          (credit.paymentDueAmount as number | null) ?? null;
      }
    } else {
      credit.monthlyDebtContribution = null;
    }

    await this.prisma.document.update({
      where: { id: documentId },
      data: { extractedData: data as any },
    });

    return { creditIndex, credit };
  }

}
