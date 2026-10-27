import type { PmIncomeBases } from '../income-calculation/income-calculation.types';
import type { CheckStatus, ProductMatchStatus } from './types/bank-viability.types';
import {
  PM_COMPANY_TENURE_MONTHS,
  PM_GATE_BANKS,
  type PmBankGateResult,
  type PmGateBankCode,
} from './pm-gates';

/**
 * Persona moral commitment factors. Scotiabank's 0.40 replaces the
 * salaried CMA of 0.55. The other banks match the catalog CE.
 */
export const PM_COMMITMENT_FACTOR: Record<PmGateBankCode, string> = {
  SANTANDER: '0.50',
  SCOTIABANK: '0.40',
  BANORTE: '0.60',
  HSBC: '0.50',
  CITIBANAMEX: '0.50',
};

export interface BanamexPmFactor {
  kind: 'COMPANIA' | 'PROFESIONISTAS_ASOCIADOS' | 'UNKNOWN';
  factor: number | null;
  label: string | null;
}

export interface PmActivityTenureCheck {
  status: CheckStatus;
  actualMonths?: number | null;
  requiredMonths?: number | null;
  reason?: string;
}

export interface PmBankDecision {
  status: ProductMatchStatus;
  reasons: string[];
  incomeUsed: number | null;
  maximumDebt: number | null;
  availableCapacity: number | null;
  /** Debt subtracted after the CE, so the row still reads ingreso × CE − pasivo. */
  liabilityForDisplay: number | null;
  appliedFactor: string | null;
  factorMode: 'FLAT' | null;
  matchedNativeLabel: string | null;
  debtCommitmentFactor: string | null;
  capacityStatus: CheckStatus;
  activityTenure: PmActivityTenureCheck;
}

export interface DecidePmBankInput {
  bankCode: string;
  incomeSource: string | null;
  bases: PmIncomeBases | null;
  gate: PmBankGateResult | null;
  legalForm: string | null;
  companyTenureMonths: number | null;
}

/**
 * PDF workshop: 15% for a company, 50% for associated professionals (S.C.).
 * The internal matrix's 30% does not apply. An empty legal form stays open.
 */
export function resolveBanamexPmFactor(
  legalForm: string | null | undefined,
): BanamexPmFactor {
  if (!legalForm || legalForm.trim() === '') {
    return { kind: 'UNKNOWN', factor: null, label: null };
  }
  const text = legalForm
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  const associated =
    text.includes('SOCIEDAD CIVIL') ||
    text.includes('PROFESIONISTA') ||
    /\bS\.?\s*C\.?\b/.test(text);
  if (associated) {
    return {
      kind: 'PROFESIONISTAS_ASOCIADOS',
      factor: 0.5,
      label: 'profesionistas asociados',
    };
  }
  return { kind: 'COMPANIA', factor: 0.15, label: 'compañía' };
}

export function decidePmBank(input: DecidePmBankInput): PmBankDecision {
  const known = (PM_GATE_BANKS as readonly string[]).includes(input.bankCode);
  if (!known || input.gate == null) {
    return emptyDecision('NOT_COMPATIBLE', ['PM_SIN_POLITICA']);
  }

  const locks = input.gate.locks;
  const hard = locks.filter((lock) => !lock.code.startsWith('SIN_'));
  const soft = locks.filter((lock) => lock.code.startsWith('SIN_'));
  const reasons = [...hard, ...soft].map((lock) => lock.code);
  const engine = engineCapacity(input);
  if (engine?.reason) reasons.push(engine.reason);

  const banamex = input.bankCode === 'CITIBANAMEX'
    ? resolveBanamexPmFactor(input.legalForm)
    : null;
  if (banamex?.kind === 'UNKNOWN') reasons.push('BANAMEX_TIPO_PM_DESCONOCIDO');
  if (banamex && hard.length === 0) reasons.push('BANAMEX_PM_CAPACITY_OPEN');

  const capacity = engine?.capacity ?? null;
  const negative = capacity != null && capacity <= 0;
  if (negative) reasons.push('NEGATIVE_CAPACITY');

  let status: ProductMatchStatus = 'PRELIMINARY_VIABLE';
  if (hard.length > 0 || engine?.status === 'NOT_VIABLE' || negative) {
    status = 'NOT_COMPATIBLE';
  } else if (
    soft.length > 0 ||
    engine?.status === 'REQUIRES_REVIEW' ||
    engine == null ||
    banamex != null
  ) {
    status = 'REQUIRES_REVIEW';
  }

  const incomeUsed = engine?.incomeToConsider ?? engine?.admissibleIncome ?? null;
  const maximumDebt = engine?.maximumDebt ?? null;
  const liability =
    maximumDebt != null && capacity != null
      ? round2(maximumDebt - capacity)
      : null;

  return {
    status,
    reasons,
    incomeUsed,
    maximumDebt,
    availableCapacity: capacity,
    liabilityForDisplay: liability,
    appliedFactor: appliedFactor(input, banamex),
    factorMode: appliedFactor(input, banamex) == null ? null : 'FLAT',
    matchedNativeLabel: matchedLabel(input, banamex),
    debtCommitmentFactor: PM_COMMITMENT_FACTOR[input.bankCode as PmGateBankCode],
    capacityStatus: capacityStatus(engine?.status ?? null, capacity),
    activityTenure: activityTenure(input),
  };
}

function appliedFactor(
  input: DecidePmBankInput,
  banamex: BanamexPmFactor | null,
): string | null {
  if (banamex?.factor != null) return banamex.factor.toFixed(2);
  if (input.bankCode !== 'SANTANDER') return null;
  const factor = input.bases?.activityFactor;
  return factor == null ? null : factor.toFixed(2);
}

function matchedLabel(
  input: DecidePmBankInput,
  banamex: BanamexPmFactor | null,
): string | null {
  if (banamex?.label) return banamex.label;
  if (input.bankCode !== 'SANTANDER') return null;
  return input.bases?.activity.description ?? null;
}

function engineCapacity(input: DecidePmBankInput) {
  const capacities = input.bases?.capacities;
  if (!capacities) return null;
  if (input.bankCode === 'SANTANDER') {
    return input.incomeSource === 'TAX_RETURN'
      ? capacities.santanderTaxReturn
      : capacities.santanderStatements;
  }
  if (input.bankCode === 'SCOTIABANK') return capacities.scotiabank;
  if (input.bankCode === 'BANORTE') return capacities.banorte;
  if (input.bankCode === 'HSBC') return capacities.hsbc;
  return null;
}

function capacityStatus(
  engineStatus: 'CALCULATED' | 'NOT_VIABLE' | 'REQUIRES_REVIEW' | null,
  capacity: number | null,
): CheckStatus {
  if (engineStatus === 'NOT_VIABLE' || (capacity != null && capacity <= 0)) return 'FAIL';
  if (engineStatus === 'CALCULATED' && capacity != null && capacity > 0) return 'PASS';
  return 'REQUIRES_REVIEW';
}

function activityTenure(input: DecidePmBankInput): PmActivityTenureCheck {
  const required = PM_COMPANY_TENURE_MONTHS[input.bankCode as PmGateBankCode];
  if (required == null) return { status: 'NOT_APPLICABLE' };
  const locks = input.gate?.locks ?? [];
  const fail = locks.find((lock) => lock.code.startsWith('ANTIGUEDAD_EMPRESA_'));
  if (fail) {
    return {
      status: 'FAIL',
      actualMonths: input.companyTenureMonths,
      requiredMonths: required,
      reason: fail.code,
    };
  }
  if (locks.some((lock) => lock.code === 'SIN_FECHA_CONSTITUCION')) {
    return {
      status: 'REQUIRES_REVIEW',
      actualMonths: null,
      requiredMonths: required,
      reason: 'SIN_FECHA_CONSTITUCION',
    };
  }
  return {
    status: 'PASS',
    actualMonths: input.companyTenureMonths,
    requiredMonths: required,
  };
}

function emptyDecision(
  status: ProductMatchStatus,
  reasons: string[],
): PmBankDecision {
  return {
    status,
    reasons,
    incomeUsed: null,
    maximumDebt: null,
    availableCapacity: null,
    liabilityForDisplay: null,
    appliedFactor: null,
    factorMode: null,
    matchedNativeLabel: null,
    debtCommitmentFactor: null,
    capacityStatus: 'NOT_APPLICABLE',
    activityTenure: { status: 'NOT_APPLICABLE' },
  };
}

function round2(value: number): number {
  return Number(value.toFixed(2));
}

export function foldPmStatus(
  base: ProductMatchStatus,
  reasons: string[],
  checks: Record<string, { status: CheckStatus }>,
): ProductMatchStatus {
  const catalogFail =
    reasons.includes('MINIMUM_AGE_NOT_MET') ||
    reasons.includes('MAXIMUM_APPLICATION_AGE_EXCEEDED') ||
    reasons.includes('INCOME_BELOW_MINIMUM') ||
    reasons.includes('PROPERTY_VALUE_BELOW_MINIMUM') ||
    reasons.some((reason) => reason.endsWith('_SCORE_BELOW_THRESHOLD')) ||
    reasons.includes('SANTANDER_MOP_KNOCKOUT');
  if (base === 'NOT_COMPATIBLE' || catalogFail) return 'NOT_COMPATIBLE';
  const review =
    base === 'REQUIRES_REVIEW' ||
    Object.values(checks).some((check) => check.status === 'REQUIRES_REVIEW');
  if (review) return 'REQUIRES_REVIEW';
  return base;
}
