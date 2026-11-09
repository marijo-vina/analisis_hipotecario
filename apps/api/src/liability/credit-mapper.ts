import type { LiabilityCreditInput } from './liability.types';
import type { PmCompanyCreditInput } from './pm-company-liability';

/**
 * Maps a raw bureau-extracted credit record from `extractedData.credits[]`
 * to the `LiabilityCreditInput` shape expected by the calculation service.
 *
 * Bureau `extractedData.credits[].` fields → LiabilityCreditInput:
 *   accountNumber       → creditReference
 *   institution         → institution
 *   creditType          → creditType
 *   classification      → classification (Gemini's call)
 *   status              → status
 *   currentBalance      → currentBalance (nullable)
 *   paymentDueAmount    → paymentDueAmountEffective (nullable)
 *   isClosed            → isClosed
 *
 * Shared between the liability controller (HTTP endpoint) and the
 * case-analysis service (orchestrated analysis pipeline).
 */
export function mapBureauCreditToInput(
  raw: Record<string, unknown>,
): LiabilityCreditInput {
  return {
    creditReference: String(raw.accountNumber ?? raw.creditReference ?? ''),
    institution: String(raw.institution ?? ''),
    creditType: String(raw.creditType ?? ''),
    productName: raw.productName ? String(raw.productName) : undefined,
    classification: String(raw.classification ?? 'UNKNOWN'),
    status: String(raw.status ?? ''),
    currentBalance:
      raw.currentBalance !== null && raw.currentBalance !== undefined
        ? Number(raw.currentBalance)
        : null,
    paymentDueAmountEffective:
      raw.paymentDueAmount !== null && raw.paymentDueAmount !== undefined
        ? Number(raw.paymentDueAmount)
        : null,
    isClosed: Boolean(raw.isClosed ?? false),
  };
}

/**
 * Company bureau fields the persona moral formulas need.
 * A term in months is converted to days (× 30) when days are absent.
 */
export function mapCompanyBureauCredit(
  raw: Record<string, unknown>,
): PmCompanyCreditInput {
  const termDays = readNumber(raw.termDays);
  const termMonths = readNumber(raw.termMonths);
  return {
    creditReference: String(raw.accountNumber ?? raw.creditReference ?? ''),
    institution: String(raw.institution ?? ''),
    creditType: String(raw.creditType ?? ''),
    classification: String(raw.classification ?? 'UNKNOWN'),
    isClosed: Boolean(raw.isClosed ?? false),
    originalAmount: readNumber(raw.originalAmount),
    currentBalance: readNumber(raw.currentBalance),
    termDays: termDays ?? (termMonths != null ? termMonths * 30 : null),
  };
}

function readNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
