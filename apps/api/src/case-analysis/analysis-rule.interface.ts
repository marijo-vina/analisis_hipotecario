import type { AnalysisOutcome } from '../generated/prisma/client';

/** Identity fields compared across documents by the identity-match rule. */
export type IdentityFieldName = 'fullName' | 'rfc' | 'curp';

/** Field-level comparison result produced by a rule. */
export interface FieldComparison {
  fieldName: string;
  originalValue: Record<string, string | null>;
  normalizedValue: Record<string, string | null>;
  status: 'MATCH' | 'MISMATCH' | 'NOT_AVAILABLE';
  severity: Severity;
  alerts: string[];
}

/** Severity tiers mapped to outcome priority. */
export type Severity = 'ERROR' | 'WARNING' | 'INFO';

/** Structured alert emitted by a rule when a discrepancy is found. */
export interface RuleAlert {
  ruleCode: string;
  severity: Severity;
  field: string;
  message: string;
}

/** Stable detail payload returned by every rule. */
export interface RuleDetail {
  sources: string[];
  fields: FieldComparison[];
  [key: string]: unknown;
}

/** Aggregate result of a single rule execution. */
export interface RuleResult {
  ruleId: string;
  outcome: AnalysisOutcome;
  severity: Severity;
  detail: RuleDetail;
  alerts: RuleAlert[];
}

/**
 * Contract each cross-document analysis rule implements.
 *
 * The orchestrator executes all registered rules sequentially and aggregates
 * their `RuleResult`s into a single `AnalysisResult`.
 */
export interface AnalysisRule {
  readonly ruleId: string;
  execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult>;
}