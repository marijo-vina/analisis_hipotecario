import type { BankResult, TaxReturnPolicy } from "@/app/lib/definitions";
import {
  PFAE_FACTOR_MODE_LABELS,
  TAX_RETURN_POLICY_LABELS,
} from "@/app/lib/definitions";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";

const ORIGIN_LABELS: Record<string, string> = {
  BANK_STATEMENTS: "Estados de cuenta",
  TAX_RETURN: "Declaración anual",
};

/** Persisted `inputs.incomeSource` only — never inferred from catalog or CE math. */
export function originDisplay(incomeSource: string | null | undefined): string {
  if (!incomeSource) return "—";
  return ORIGIN_LABELS[incomeSource] ?? incomeSource;
}

/** Persisted `matchedNativeLabel` + `satDescription` only. */
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
 * Persisted `appliedFactor` + `factorMode` only.
 * NONE → “Sin factor”. Null / unmapped → “—” — MUST NOT invent 1.0.
 */
export function factorDisplay(
  match: Pick<BankResult, "appliedFactor" | "factorMode">,
): string {
  if (match.factorMode === "NONE") {
    return "Sin factor";
  }
  if (match.appliedFactor == null) {
    return "—";
  }
  const modeLabel = match.factorMode
    ? PFAE_FACTOR_MODE_LABELS[match.factorMode]
    : null;
  return modeLabel ? `${match.appliedFactor} · ${modeLabel}` : match.appliedFactor;
}

export function taxPolicyDisplay(policy: TaxReturnPolicy | null): string {
  if (!policy) return "—";
  return TAX_RETURN_POLICY_LABELS[policy] ?? policy;
}

interface PfaeProductDetailExtrasProps {
  match: BankResult;
  incomeSource?: string | null;
}

export default function PfaeProductDetailExtras({
  match,
  incomeSource,
}: PfaeProductDetailExtrasProps) {
  const fields: FieldGridField[] = [
    { label: "Origen", value: originDisplay(incomeSource) },
    { label: "Giro", value: giroDisplay(match) },
    { label: "Factor", value: factorDisplay(match) },
    { label: "Política declaración", value: taxPolicyDisplay(match.taxReturnPolicy) },
  ];

  return (
    <div className="bg-white rounded-md border border-gf-border/30 px-3 py-3">
      <FieldGrid fields={fields} />
    </div>
  );
}
