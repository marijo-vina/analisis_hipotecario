import type { AnalysisRun, PmGatesSnapshot } from "@/app/lib/definitions";

export function readPmGates(run: AnalysisRun): PmGatesSnapshot | null {
  const rule = run.detail.ruleResults?.find((item) => item.ruleId === "pm-gates");
  const gates = rule?.detail.pmGates;
  if (!gates || !Array.isArray(gates.banks)) return null;
  return gates;
}
