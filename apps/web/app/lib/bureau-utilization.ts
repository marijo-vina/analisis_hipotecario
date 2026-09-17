/**
 * UI-derived revolving utilization for BuroTab.
 * Never persisted — compute from stored currentBalance / creditLimit at render.
 */

export const UTILIZATION_DASH = "—";

export type UtilizationCreditInput = {
  classification: string;
  creditType?: string | null;
  currentBalance?: number | null;
  creditLimit?: number | null;
  isClosed?: boolean;
  accountNumber?: string | null;
  institution?: string | null;
  rawTextReference?: string | null;
};

export type UtilizationBandId =
  | "excelente"
  | "muy_buena"
  | "aceptable"
  | "atencion"
  | "critico"
  | "muy_critico";

export type UtilizationBand = {
  id: UtilizationBandId;
  label: string;
  minPercent: number;
  maxPercent: number | null;
};

export type UtilizationView = {
  display: string;
  percent: number | null;
  band: UtilizationBand | null;
};

export const UTILIZATION_BANDS: readonly UtilizationBand[] = [
  { id: "excelente", label: "Excelente", minPercent: 0, maxPercent: 10 },
  { id: "muy_buena", label: "Muy buena", minPercent: 11, maxPercent: 30 },
  { id: "aceptable", label: "Aceptable", minPercent: 31, maxPercent: 50 },
  { id: "atencion", label: "Atención", minPercent: 51, maxPercent: 70 },
  { id: "critico", label: "Crítico", minPercent: 71, maxPercent: 90 },
  { id: "muy_critico", label: "Muy crítico", minPercent: 91, maxPercent: null },
];

const TARJETA_RE = /tarjeta/i;

const DASH_VIEW: UtilizationView = {
  display: UTILIZATION_DASH,
  percent: null,
  band: null,
};

export function isInScope(credit: UtilizationCreditInput): boolean {
  const classification = credit.classification;
  if (classification === "MORTGAGE" || classification === "AUTO") return false;
  if (classification === "REVOLVING") return true;
  if (classification === "DEPARTMENT_STORE") {
    return (credit.creditLimit ?? 0) > 0;
  }
  // Gemini (and the PDF "no bancarios" section) often labels AMEX/Liverpool
  // cards as NON_BANK_SERVICE. Trust creditType when it says tarjeta.
  return TARJETA_RE.test(credit.creditType ?? "");
}

export function getUtilizationBand(roundedPercent: number): UtilizationBand {
  for (const band of UTILIZATION_BANDS) {
    if (band.maxPercent == null) {
      if (roundedPercent >= band.minPercent) return band;
      continue;
    }
    if (roundedPercent >= band.minPercent && roundedPercent <= band.maxPercent) {
      return band;
    }
  }
  return UTILIZATION_BANDS[0];
}

function toView(rate: number): UtilizationView {
  const percent = Math.round(rate * 100);
  const band = getUtilizationBand(percent);
  return { display: `${percent}%`, percent, band };
}

function isActiveInScopeWithLimitAndBalance(
  credit: UtilizationCreditInput,
): credit is UtilizationCreditInput & {
  currentBalance: number;
  creditLimit: number;
} {
  if (!isInScope(credit)) return false;
  if (credit.isClosed) return false;
  const limit = credit.creditLimit;
  const balance = credit.currentBalance;
  return limit != null && limit > 0 && balance != null;
}

export function computeRowUtilization(
  credit: UtilizationCreditInput,
): UtilizationView {
  if (!isActiveInScopeWithLimitAndBalance(credit)) return DASH_VIEW;
  return toView(credit.currentBalance / credit.creditLimit);
}

export function computeGlobalUtilization(
  credits: UtilizationCreditInput[],
): UtilizationView {
  let sumBalances = 0;
  let sumLimits = 0;
  for (const credit of credits) {
    if (!isActiveInScopeWithLimitAndBalance(credit)) continue;
    sumBalances += credit.currentBalance;
    sumLimits += credit.creditLimit;
  }
  if (sumLimits === 0) return DASH_VIEW;
  return toView(sumBalances / sumLimits);
}

function bestDigitRun(text: string | null | undefined): string | null {
  if (!text) return null;
  const matches = text.match(/\d{4,}/g);
  if (!matches || matches.length === 0) return null;
  return matches.reduce((best, run) =>
    run.length >= best.length ? run : best,
  );
}

export function maskLastFour(credit: UtilizationCreditInput): string {
  const digits =
    bestDigitRun(credit.accountNumber) ??
    bestDigitRun(credit.institution) ??
    bestDigitRun(credit.rawTextReference);
  if (!digits) return UTILIZATION_DASH;
  return `****${digits.slice(-4)}`;
}
