// ---------------------------------------------------------------------------
// Tipos de validacion PFAE (HU-19b).
//
// Snapshot persistido en RuleResult.detail.pfaeValidation. Las secciones
// vigencia/tenure/activity/coherence son null cuando no hay datos (CSF
// ausente, o coherencia omitida por falta de estados de cuenta / depuration).
// ---------------------------------------------------------------------------

export const PFAE_GATE_OUTCOMES = [
  'PASS',
  'PARTIAL',
  'FAIL',
  'WARNING',
  'INFO',
] as const;

export type PfaeGateOutcome = (typeof PFAE_GATE_OUTCOMES)[number];

export interface PfaeValidationSnapshot {
  regime: { isSolelySalaried: boolean; outcome: 'PASS' | 'FAIL' };
  vigencia: {
    issuanceDate: string | null;
    isOlderThan3Months: boolean;
    outcome: 'PASS' | 'WARNING';
  } | null;
  tenure: {
    months: number | null;
    activityStartDate: string | null;
  } | null;
  activity: { satDescription: string | null; percentage: number | null } | null;
  coherence: { rentWithoutRegimeCount: number; outcome: 'PASS' | 'WARNING' } | null;
}
