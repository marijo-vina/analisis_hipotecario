import type { LiabilityCreditInput } from './liability.types';

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
