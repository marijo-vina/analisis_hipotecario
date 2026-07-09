import { AnalysisOutcome } from '../../generated/prisma/client';
import type {
  AnalysisRule,
  FieldComparison,
  RuleAlert,
  RuleResult,
  Severity,
} from '../analysis-rule.interface';
import { normalizeText, namesMatch } from '../normalize';
import type { NormalizeMode } from '../normalize';

/** Minimal overlap with the Prisma `Client` model — kept loose for testability. */
export interface PrismaClientLike {
  fullName?: string | null;
  rfc?: string | null;
  curp?: string | null;
  [k: string]: unknown;
}

/** Minimal overlap with the Prisma `Document` model. */
export interface PrismaDocumentLike {
  documentType: { code: string };
  extractedData: Record<string, unknown> | null;
  [k: string]: unknown;
}

const IDENTITY_FIELDS = ['fullName', 'rfc', 'curp'] as const;
type IdentityField = (typeof IDENTITY_FIELDS)[number];

/** Severity rank used to escalate the aggregate outcome/severity. */
const SEVERITY_RANK: Record<Severity, number> = { INFO: 0, WARNING: 1, ERROR: 2 };
const OUTCOME_RANK: Record<AnalysisOutcome, number> = { PASS: 0, PARTIAL: 1, FAIL: 2 };

interface SourceDefinition {
  /** Spec-facing source key used in `detail.sources`. */
  sourceKey: string;
  /** Prisma DocumentType.code that maps to this source. Undefined for the Client record. */
  documentTypeCode?: string;
  /** Per-field extractor returning the raw value or null when structurally absent. */
  extract: {
    fullName: (data: Record<string, unknown> | null) => string | null;
    rfc: (data: Record<string, unknown> | null) => string | null;
    curp: (data: Record<string, unknown> | null) => string | null;
  };
}

const get = (obj: unknown, path: string[]): string | null => {
  let cur: unknown = obj;
  for (const seg of path) {
    if (cur == null || typeof cur !== 'object') return null;
    cur = (cur as Record<string, unknown>)[seg];
  }
  return cur == null ? null : String(cur);
};

/**
 * Registry of identity sources. Bank Statement structurally lacks `curp`
 * (and a top-level `rfc` — RFC for bank statements lives only inside deposit
 * records, so it is treated as absent for identity comparison). This mirrors
 * the identity-match-validation spec's source/field capability matrix.
 */
const SOURCE_DEFINITIONS: SourceDefinition[] = [
  {
    sourceKey: 'official-id',
    documentTypeCode: 'INE',
    extract: {
      // The spec's identity source matrix lists Official ID as carrying rfc,
      // fullName, and curp. The current INE extraction service does not yet
      // populate `identity.rfc`, so this returns null until it does — keeping
      // the rule aligned with the spec matrix without forcing false mismatches.
      fullName: (d) => get(d, ['identity', 'fullName']),
      rfc: (d) => get(d, ['identity', 'rfc']),
      curp: (d) => get(d, ['identity', 'curp']),
    },
  },
  {
    sourceKey: 'payroll',
    documentTypeCode: 'PAYROLL_RECEIPT',
    extract: {
      fullName: (d) => get(d, ['employee', 'fullName']),
      rfc: (d) => get(d, ['employee', 'rfc']),
      curp: (d) => get(d, ['employee', 'curp']),
    },
  },
  {
    sourceKey: 'bank-statement',
    documentTypeCode: 'BANK_STATEMENT',
    extract: {
      fullName: (d) => get(d, ['accountHolder', 'fullName']),
      rfc: () => null, // Bank statement has no holder-level RFC to compare.
      curp: () => null, // Bank statement structurally lacks CURP.
    },
  },
  {
    sourceKey: 'credit-bureau',
    documentTypeCode: 'CREDIT_BUREAU_REPORT',
    extract: {
      fullName: (d) => get(d, ['borrower', 'fullName']),
      rfc: (d) => get(d, ['borrower', 'rfc']),
      curp: () => null, // Credit bureau report has no CURP.
    },
  },
];

/** Normalized per-source per-field value map. */
interface SourceFieldValue {
  sourceKey: string;
  raw: string | null; // original value (null when source lacks the value)
  normalized: string | null; // normalized value ('' if null/empty)
}

/**
 * Cross-document identity comparison rule.
 *
 * Compares `fullName`, `rfc`, and `curp` across Official ID, Payroll,
 * Bank Statement, Credit Bureau, and the canonical Client record (treated as
 * an operational reference, not a primary source for FAIL escalation).
 *
 * Key policies (per identity-match-validation spec):
 *  - Field intersection: only compares a field across sources that actually
 *    carry it; absent values become NOT_AVAILABLE and never cause FAIL.
 *  - RFC/CURP mismatch between *documents* escalates to FAIL/ERROR.
 *  - Full-name mismatch (anywhere) is PARTIAL/WARNING.
 *  - Client-vs-document mismatch (documents agreeing internally) is
 *    PARTIAL/WARNING — Client is operational reference only.
 *  - Deterministic normalization only; no fuzzy/ML matching.
 */
export class IdentityMatchRule implements AnalysisRule {
  readonly ruleId = 'identity-match';

  async execute(
    client: Record<string, unknown>,
    documents: Record<string, unknown>[],
  ): Promise<RuleResult> {
    const typedClient = client as PrismaClientLike;
    const typedDocs = documents as unknown as PrismaDocumentLike[];

    // Map documents to their source definitions (by DocumentType code).
    const docsBySource = this.indexDocsBySource(typedDocs);

    // Gather per-field per-source values.
    const fields: FieldComparison[] = [];
    const alerts: RuleAlert[] = [];

    let worstOutcome: AnalysisOutcome = 'PASS';
    let worstSeverity: Severity = 'INFO';

    for (const fieldName of IDENTITY_FIELDS) {
      const sourceValues = this.collectFieldValues(fieldName as IdentityField, typedClient, docsBySource);

      const comparison = this.compareField(fieldName as IdentityField, sourceValues);

      fields.push(comparison.field);
      alerts.push(...comparison.alerts);

      if (SEVERITY_RANK[comparison.outcomeSeverity] > SEVERITY_RANK[worstSeverity]) {
        worstSeverity = comparison.outcomeSeverity;
      }
      if (OUTCOME_RANK[comparison.outcome] > OUTCOME_RANK[worstOutcome]) {
        worstOutcome = comparison.outcome;
      }
    }

    const sources = Array.from(
      new Set([
        ...docsBySource.keys(),
        'client', // Client is always a participating reference.
      ]),
    );

    return {
      ruleId: this.ruleId,
      outcome: worstOutcome,
      severity: worstSeverity,
      detail: { sources, fields },
      alerts,
    };
  }

  /** Index uploaded documents by their mapped source key. */
  private indexDocsBySource(
    docs: PrismaDocumentLike[],
  ): Map<string, PrismaDocumentLike> {
    const map = new Map<string, PrismaDocumentLike>();
    for (const d of docs) {
      const code = d.documentType?.code;
      const def = SOURCE_DEFINITIONS.find((s) => s.documentTypeCode === code);
      if (def) {
        map.set(def.sourceKey, d);
      }
    }
    return map;
  }

  /** Collect, for one field, the participating per-source field values.
   *
   *  Policy (per user refinement):
   *  - RFC and CURP are OPTIONAL in Client. If the client record has no value
   *    (null / empty / whitespace), the client source is OMITTED from
   *    comparison for that field — it never generates a mismatch.
   *  - fullName is always required in Client (canonical field).
   */
  private collectFieldValues(
    fieldName: IdentityField,
    client: PrismaClientLike,
    docsBySource: Map<string, PrismaDocumentLike>,
  ): SourceFieldValue[] {
    const mode: NormalizeMode = fieldName === 'fullName' ? 'name' : 'identifier';
    const values: SourceFieldValue[] = [];

    // Document sources carrying the field.
    for (const def of SOURCE_DEFINITIONS) {
      const doc = docsBySource.get(def.sourceKey);
      if (!doc) continue; // source not present on this case
      const raw = def.extract[fieldName](doc.extractedData);
      values.push({
        sourceKey: def.sourceKey,
        raw,
        normalized: raw == null || raw.trim() === '' ? null : normalizeText(raw, mode),
      });
    }

    // Client: only include if the field HAS a value (RFC/CURP are optional).
    const clientRaw = (client as Record<string, unknown>)[fieldName] as string | null | undefined;
    const hasClientValue = clientRaw != null && String(clientRaw).trim() !== '';

    if (fieldName === 'fullName' || hasClientValue) {
      // Always include client entry in originalValue/normalizedValue maps
      // so the frontend can show "No capturado" for empty optional fields.
      values.push({
        sourceKey: 'client',
        raw: clientRaw == null ? null : String(clientRaw),
        normalized: hasClientValue ? normalizeText(clientRaw, mode) : null,
      });
    }

    return values;
  }

  /** Compare two normalized values with field-type awareness.
   *
   *  For fullName: uses token-set comparison (namesMatch) to handle
   *  INE's "lastname firstname" vs other docs' "firstname lastname" ordering.
   *  For RFC/CURP: uses strict string equality.
   */
  private valuesMatch(
    a: string,
    b: string,
    fieldName: IdentityField,
  ): boolean {
    if (fieldName === 'fullName') {
      return namesMatch(a, b);
    }
    return a === b;
  }

  /** Compare a single field across participating sources and classify. */
  private compareField(
    fieldName: IdentityField,
    sourceValues: SourceFieldValue[],
  ): { field: FieldComparison; alerts: RuleAlert[]; outcome: AnalysisOutcome; outcomeSeverity: Severity } {
    const present = sourceValues.filter((v) => v.normalized !== null);

    const originalValue: Record<string, string | null> = {};
    const normalizedValue: Record<string, string | null> = {};
    for (const v of sourceValues) {
      originalValue[v.sourceKey] = v.raw;
      normalizedValue[v.sourceKey] = v.normalized;
    }

    const alerts: RuleAlert[] = [];
    const fieldAlerts: string[] = [];

    // Defaults for a non-comparable field.
    let status: FieldComparison['status'] = 'NOT_AVAILABLE';
    let severity: Severity = 'INFO';
    let outcome: AnalysisOutcome = 'PASS';
    let outcomeSeverity: Severity = 'INFO';

    const clientValue = present.find((v) => v.sourceKey === 'client');

    if (present.length < 2) {
      // Cannot compare with <2 sources. Exception: if a single document
      // has the value and client was omitted (optional field), still mark
      // as MATCH with a suggestion.
      if (present.length === 1 && !clientValue && (fieldName === 'rfc' || fieldName === 'curp')) {
        status = 'MATCH';
        fieldAlerts.push('CLIENT_FIELD_OMITTED');
        alerts.push({
          ruleCode: 'CLIENT_FIELD_OMITTED',
          severity: 'INFO',
          field: fieldName,
          message: `${fieldName.toUpperCase()}: completar en datos del cliente con base en documento validado`,
        });
        return {
          field: { fieldName, originalValue, normalizedValue, status, severity, alerts: fieldAlerts },
          alerts,
          outcome,
          outcomeSeverity,
        };
      }
      // Cannot compare — keep NOT_AVAILABLE, contribute nothing to outcome.
      return {
        field: { fieldName, originalValue, normalizedValue, status, severity, alerts: fieldAlerts },
        alerts,
        outcome,
        outcomeSeverity,
      };
    }

    const distinctDocValues = new Set(
      present.filter((v) => v.sourceKey !== 'client').map((v) => v.normalized),
    );
    // For fullName: token-set comparison tolerates INE's "lastname firstname" ordering.
    const docValues = present.filter((v) => v.sourceKey !== 'client');

    /** Check whether all document values are pairwise-equal for this field. */
    const allDocsMatch = (): boolean => {
      if (docValues.length < 2) return true;
      const first = docValues[0].normalized!;
      return docValues.every((v) => this.valuesMatch(v.normalized!, first, fieldName));
    };

    status = 'MATCH'; // provisional; downgraded below if discrepancies found.

    if (docValues.length >= 2) {
      const docsDisagree = fieldName === 'fullName'
        ? !allDocsMatch()
        : distinctDocValues.size > 1;

      if (docsDisagree) {
        // ── Document-vs-document mismatch ──────────────────────────────────
        status = 'MISMATCH';
        if (fieldName === 'rfc' || fieldName === 'curp') {
          severity = 'ERROR';
          outcome = 'FAIL';
          outcomeSeverity = 'ERROR';
          fieldAlerts.push('DOCUMENT_CONFLICT');
          alerts.push({
            ruleCode: 'DOCUMENT_CONFLICT',
            severity: 'ERROR',
            field: fieldName,
            message: `${fieldName.toUpperCase()}: conflicto entre documentos — las fuentes no coinciden`,
          });
        } else {
          // fullName mismatch among documents → PARTIAL / WARNING.
          severity = 'WARNING';
          outcome = 'PARTIAL';
          outcomeSeverity = 'WARNING';
          fieldAlerts.push('NAME_MISMATCH');
          alerts.push({
            ruleCode: 'NAME_MISMATCH',
            severity: 'WARNING',
            field: fieldName,
            message: 'Nombre: los documentos no coinciden — se requiere revisión',
          });
        }
      } else {
        // ── Documents agree ────────────────────────────────────────────────
        const consensus = docValues[0].normalized!;
        const clientDiffers = clientValue
          ? !this.valuesMatch(clientValue.normalized!, consensus, fieldName)
          : false;

        if (clientDiffers) {
          // Client has a value but it differs from document consensus.
          status = 'MISMATCH';
          if (fieldName === 'rfc' || fieldName === 'curp') {
            severity = 'WARNING';
            outcome = 'PARTIAL';
            outcomeSeverity = 'WARNING';
            fieldAlerts.push('EXPEDIENTE_VS_DOCUMENTOS');
            alerts.push({
              ruleCode: 'EXPEDIENTE_VS_DOCUMENTOS',
              severity: 'WARNING',
              field: fieldName,
              message: `${fieldName.toUpperCase()}: el valor en expediente difiere de los documentos`,
            });
          } else {
            severity = 'WARNING';
            outcome = 'PARTIAL';
            outcomeSeverity = 'WARNING';
            fieldAlerts.push('NAME_MISMATCH');
            alerts.push({
              ruleCode: 'NAME_MISMATCH',
              severity: 'WARNING',
              field: fieldName,
              message: 'Nombre: el expediente difiere de los documentos',
            });
          }
        } else if (clientValue && this.valuesMatch(clientValue.normalized!, consensus, fieldName)) {
          status = 'MATCH';
          severity = 'INFO';
        } else {
          // No client value present.
          status = 'MATCH';
          severity = 'INFO';
          // For RFC/CURP: suggest completing the field in client data
          if (fieldName === 'rfc' || fieldName === 'curp') {
            fieldAlerts.push('CLIENT_FIELD_OMITTED');
            alerts.push({
              ruleCode: 'CLIENT_FIELD_OMITTED',
              severity: 'INFO',
              field: fieldName,
              message: `${fieldName.toUpperCase()}: completar en datos del cliente con base en documentos validados`,
            });
          }
        }
      }
    } else {
      // Only one document available for this field (or none).
      const singleDoc = docValues.length === 1 ? docValues[0] : null;
      if (singleDoc && clientValue) {
        if (!this.valuesMatch(clientValue.normalized!, singleDoc.normalized!, fieldName)) {
          status = 'MISMATCH';
          if (fieldName === 'rfc' || fieldName === 'curp') {
            severity = 'WARNING';
            outcome = 'PARTIAL';
            outcomeSeverity = 'WARNING';
            fieldAlerts.push('EXPEDIENTE_VS_DOCUMENTOS');
            alerts.push({
              ruleCode: 'EXPEDIENTE_VS_DOCUMENTOS',
              severity: 'WARNING',
              field: fieldName,
              message: `${fieldName.toUpperCase()}: el valor en expediente difiere del documento`,
            });
          } else {
            severity = 'WARNING';
            outcome = 'PARTIAL';
            outcomeSeverity = 'WARNING';
            fieldAlerts.push('NAME_MISMATCH');
            alerts.push({
              ruleCode: 'NAME_MISMATCH',
              severity: 'WARNING',
              field: fieldName,
              message: 'Nombre: el expediente difiere del documento',
            });
          }
        } else {
          status = 'MATCH';
          severity = 'INFO';
        }
      } else if (singleDoc && !clientValue) {
        // Document has value but client doesn't (optional field omitted).
        status = 'MATCH';
        severity = 'INFO';
        if (fieldName === 'rfc' || fieldName === 'curp') {
          fieldAlerts.push('CLIENT_FIELD_OMITTED');
          alerts.push({
            ruleCode: 'CLIENT_FIELD_OMITTED',
            severity: 'INFO',
            field: fieldName,
            message: `${fieldName.toUpperCase()}: completar en datos del cliente con base en documento validado`,
          });
        }
      } else if (!singleDoc && clientValue) {
        // Only client has the value, no docs → self-match is meaningless.
        status = 'NOT_AVAILABLE';
      } else if (!singleDoc && !clientValue) {
        // No doc and no client value → NOT_AVAILABLE.
        status = 'NOT_AVAILABLE';
      } else {
        // No client value; single document cannot self-compare → NOT_AVAILABLE.
        status = 'NOT_AVAILABLE';
      }
    }

    return {
      field: { fieldName, originalValue, normalizedValue, status, severity, alerts: fieldAlerts },
      alerts,
      outcome,
      outcomeSeverity,
    };
  }
}