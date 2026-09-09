import type { ReactNode } from "react";

import type {
  AnalysisRun,
  AnalysisRuleResult,
  PfaeValidationSnapshot,
} from "@/app/lib/definitions";
import { formatCalendarDate, formatTenureMonths } from "@/app/lib/display-format";
import Card from "@/app/ui/common/card";
import FieldGrid, { type FieldGridField } from "@/app/ui/common/field-grid";

const PFAE_VALIDATION_RULE_ID = "pfae-validation";
const SOLELY_SALARIED_FAIL_COPY =
  "este camino PFAE no aplica — cambie a asalariado";

const ALERT_CSF_MISSING = "PFAE_CSF_MISSING";
const ALERT_SOLELY_SALARIED = "REGIMEN_EXCLUSIVAMENTE_ASALARIADO";
const ALERT_ACTIVITY_UNMAPPED = "ACTIVITY_UNMAPPED";

interface GateAlert {
  ruleCode: string;
  severity: string;
  field: string;
  message: string;
}

type ChipTone = "pass" | "fail" | "warn" | "partial" | "info";

function findPfaeValidationRule(
  run: AnalysisRun,
): AnalysisRuleResult | undefined {
  return run.detail.ruleResults?.find(
    (result) => result.ruleId === PFAE_VALIDATION_RULE_ID,
  );
}

function collectAlerts(
  run: AnalysisRun,
  rule: AnalysisRuleResult | undefined,
): GateAlert[] {
  const merged: GateAlert[] = [
    ...(run.alerts ?? []),
    ...(rule?.alerts ?? []),
  ];
  const seen = new Set<string>();
  return merged.filter((alert) => {
    if (seen.has(alert.ruleCode)) return false;
    seen.add(alert.ruleCode);
    return true;
  });
}

function findAlert(
  alerts: GateAlert[],
  ruleCode: string,
): GateAlert | undefined {
  return alerts.find((alert) => alert.ruleCode === ruleCode);
}

function formatTenure(
  tenure: PfaeValidationSnapshot["tenure"],
): string | undefined {
  if (!tenure) return undefined;
  const parts: string[] = [];
  if (tenure.months != null) parts.push(formatTenureMonths(tenure.months));
  const startDate = formatCalendarDate(tenure.activityStartDate);
  if (startDate) parts.push(startDate);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function formatActivity(
  activity: PfaeValidationSnapshot["activity"],
): string | undefined {
  if (!activity) return undefined;
  const parts: string[] = [];
  if (activity.satDescription) parts.push(activity.satDescription);
  if (activity.percentage != null) parts.push(`${activity.percentage}%`);
  return parts.length > 0 ? parts.join(" · ") : undefined;
}

function formatCoherence(
  coherence: PfaeValidationSnapshot["coherence"],
): string | undefined {
  if (!coherence) return undefined;
  if (coherence.outcome === "WARNING") {
    return `${coherence.rentWithoutRegimeCount} depósito(s) de renta sin régimen`;
  }
  return "Sin depósitos de renta sin régimen";
}

function GateChip({ tone, children }: { tone: ChipTone; children: string }) {
  const toneClass: Record<ChipTone, string> = {
    pass: "bg-green-50 text-gf-success",
    fail: "bg-red-50 text-gf-danger",
    warn: "bg-amber-50 text-gf-warning",
    partial: "bg-amber-50 text-gf-warning",
    info: "bg-gray-100 text-gf-text-muted",
  };

  return (
    <span
      className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium whitespace-nowrap ${toneClass[tone]}`}
    >
      {children}
    </span>
  );
}

function EmptyGatesCard() {
  return (
    <Card>
      <p className="text-sm text-gf-text-muted">Sin validaciones PFAE</p>
    </Card>
  );
}

function buildGateFields(
  snapshot: PfaeValidationSnapshot,
  csfMissing: boolean,
  solelySalariedFail: boolean,
  activityUnmapped: boolean,
): FieldGridField[] {
  const regimeChip: ReactNode = csfMissing ? (
    <GateChip tone="partial">Parcial</GateChip>
  ) : solelySalariedFail ? (
    <GateChip tone="fail">No aplica</GateChip>
  ) : (
    <GateChip tone="pass">Pasa</GateChip>
  );

  const vigenciaChip: ReactNode = snapshot.vigencia ? (
    snapshot.vigencia.outcome === "WARNING" ? (
      <GateChip tone="warn">Advertencia</GateChip>
    ) : (
      <GateChip tone="pass">Pasa</GateChip>
    )
  ) : undefined;

  const tenureChip: ReactNode = snapshot.tenure ? (
    <GateChip tone="info">Informativo</GateChip>
  ) : undefined;

  const activityChip: ReactNode = activityUnmapped ? (
    <GateChip tone="warn">Advertencia</GateChip>
  ) : undefined;

  const coherenceChip: ReactNode = snapshot.coherence ? (
    snapshot.coherence.outcome === "WARNING" ? (
      <GateChip tone="warn">Advertencia</GateChip>
    ) : (
      <GateChip tone="pass">Pasa</GateChip>
    )
  ) : undefined;

  const regimeValue = csfMissing
    ? undefined
    : solelySalariedFail || snapshot.regime.isSolelySalaried
      ? "Exclusivamente asalariado"
      : "Régimen independiente";

  return [
    {
      label: "Régimen",
      value: regimeValue,
      action: regimeChip,
    },
    {
      label: "Vigencia",
      value: formatCalendarDate(snapshot.vigencia?.issuanceDate),
      action: vigenciaChip,
    },
    {
      label: "Antigüedad",
      value: formatTenure(snapshot.tenure),
      action: tenureChip,
    },
    {
      label: "Actividad",
      value: formatActivity(snapshot.activity),
      action: activityChip,
    },
    {
      label: "Coherencia",
      value: formatCoherence(snapshot.coherence),
      action: coherenceChip,
    },
  ];
}

export default function PfaeValidationGates({ run }: { run?: AnalysisRun }) {
  if (!run) {
    return <EmptyGatesCard />;
  }

  const rule = findPfaeValidationRule(run);
  const snapshot = rule?.detail.pfaeValidation;
  if (!rule || !snapshot) {
    return <EmptyGatesCard />;
  }

  const alerts = collectAlerts(run, rule);
  const csfMissing = findAlert(alerts, ALERT_CSF_MISSING) != null;
  const solelySalariedFail =
    findAlert(alerts, ALERT_SOLELY_SALARIED) != null ||
    snapshot.regime.outcome === "FAIL";
  const unmappedAlert = findAlert(alerts, ALERT_ACTIVITY_UNMAPPED);
  const activityUnmapped = unmappedAlert != null;
  const csfAlert = findAlert(alerts, ALERT_CSF_MISSING);

  const cardTint = solelySalariedFail
    ? "border-red-200 bg-red-50/30"
    : csfMissing
      ? "border-amber-200 bg-amber-50/30"
      : "";

  return (
    <Card className={cardTint}>
      {solelySalariedFail && (
        <p role="alert" className="text-sm text-gf-danger mb-4">
          {SOLELY_SALARIED_FAIL_COPY}
        </p>
      )}
      {csfAlert && (
        <p className="text-sm text-gf-warning mb-4">{csfAlert.message}</p>
      )}
      {unmappedAlert && (
        <p className="text-sm text-gf-warning mb-4">{unmappedAlert.message}</p>
      )}
      <FieldGrid
        fields={buildGateFields(
          snapshot,
          csfMissing,
          solelySalariedFail,
          activityUnmapped,
        )}
      />
    </Card>
  );
}
