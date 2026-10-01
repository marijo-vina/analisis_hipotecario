import type { BankResult, BankViabilityInputs, TaxReturnPolicy } from "@/app/lib/definitions";
import { TAX_RETURN_POLICY_LABELS } from "@/app/lib/definitions";

const ORIGIN_LABELS: Record<string, string> = {
  BANK_STATEMENTS: "Estados de cuenta",
  TAX_RETURN: "Declaración anual",
};

/** Persisted `inputs.incomeSource` only — never inferred from catalog or CE math. */
export function originDisplay(incomeSource: string | null | undefined): string {
  if (!incomeSource) return "—";
  return ORIGIN_LABELS[incomeSource] ?? incomeSource;
}

export function giroDisplay(
  match: Pick<BankResult, "matchedNativeLabel" | "satDescription">,
): string {
  const native = match.matchedNativeLabel?.trim();
  const sat = match.satDescription?.trim();
  if (native && sat) return `${native} · ${sat}`;
  if (native) return native;
  if (sat) return sat;
  return "—";
}

/**
 * Line under the table Ingreso cell. Persisted audit only — never invent 1.0.
 */
export function factorTimesHint(
  match: Pick<BankResult, "appliedFactor" | "factorMode">,
): string | null {
  if (match.factorMode == null && match.appliedFactor == null) return null;
  if (match.factorMode === "NONE") return "Sin factor";
  if (match.appliedFactor == null) return "Sin giro";
  return `× ${formatFactor(match.appliedFactor)}`;
}

function formatFactor(raw: string): string {
  const n = Number(raw);
  if (!Number.isFinite(n)) return raw;
  return n.toFixed(2);
}

function formatMxn(value: string | null | undefined): string {
  if (value == null) return "—";
  const num = Number(String(value).replace(/[^0-9.-]/g, ""));
  if (Number.isNaN(num)) return value;
  return `$${num.toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function sentBase(
  match: BankResult,
  inputs?: BankViabilityInputs,
): string | null {
  const criterion = String(match.policySnapshot.incomeCriterion ?? "").toUpperCase();
  const isNet = criterion.includes("NET");
  return isNet ? (inputs?.confirmedNetIncome ?? null) : (inputs?.confirmedGrossIncome ?? null);
}

function taxPolicyDisplay(policy: TaxReturnPolicy | null): string {
  if (!policy) return "—";
  return TAX_RETURN_POLICY_LABELS[policy] ?? policy;
}

interface PfaeProductDetailExtrasProps {
  match: BankResult;
  inputs?: BankViabilityInputs;
}

export default function PfaeProductDetailExtras({
  match,
  inputs,
}: PfaeProductDetailExtrasProps) {
  const origin = originDisplay(inputs?.incomeSource);
  const base = sentBase(match, inputs);
  const used = match.calculation.incomeUsed;
  const native = match.matchedNativeLabel?.trim();
  const sat = match.satDescription?.trim();
  const showTaxPolicy = inputs?.incomeSource === "TAX_RETURN";

  let formula: string;
  if (match.factorMode === "NONE") {
    formula = `${formatMxn(base)} · sin factor = ${formatMxn(used)}`;
  } else if (match.appliedFactor == null) {
    formula = `${formatMxn(base)} · sin giro en la matriz`;
  } else {
    const giroBit = native ? ` (${native})` : "";
    formula = `${formatMxn(base)} × ${formatFactor(match.appliedFactor)}${giroBit} = ${formatMxn(used)}`;
  }

  return (
    <div className="bg-white rounded-md border border-gf-border/30 px-3 py-3 space-y-2">
      <p className="text-sm font-semibold text-gf-text leading-snug">{formula}</p>
      <p className="text-xs text-gf-text-muted">Origen: {origin}</p>
      {native && (
        <p className="text-xs text-gf-text">Giro del banco: {native}</p>
      )}
      {sat && sat !== native && (
        <p className="text-xs text-gf-text-muted leading-snug">{sat}</p>
      )}
      {showTaxPolicy && (
        <p className="text-xs text-gf-text-muted">
          Política declaración: {taxPolicyDisplay(match.taxReturnPolicy)}
        </p>
      )}
    </div>
  );
}
