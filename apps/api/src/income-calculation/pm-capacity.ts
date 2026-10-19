import { Prisma } from '../generated/prisma/client';
import { normalizeSatText } from '../case-analysis/activity-factor-match';
import {
  smooth,
  type TaxReturnExtract,
} from './pfae-income.helpers';
import type { BankIncomeBase, IncomeBase } from './income-calculation.types';
import type { CompanyStatementMonth } from './pm-company-statements';

/**
 * Persona moral Santander matrix. Servicios is 0.50.
 * The PFAE Santander row for the same word is 0.60 and does not apply here.
 */
const PM_SANTANDER_GIRO_FACTORS = [{ alias: 'servicio', factor: 0.5 }] as const;

const SANTANDER_CE = new Prisma.Decimal('0.50');
const SCOTIABANK_CE = new Prisma.Decimal('0.40');

export type PmCapacityStatus = 'CALCULATED' | 'NOT_VIABLE' | 'REQUIRES_REVIEW';

export interface PmBankCapacity {
  status: PmCapacityStatus;
  reason: string | null;
  admissibleIncome: number | null;
  incomeToConsider: number | null;
  maximumDebt: number | null;
  capacity: number | null;
}

export interface PmCapacityInput {
  bank: BankIncomeBase;
  tax: IncomeBase;
  /** Santander five-deposit gate. Scotiabank ignores it. */
  depositGateViable: boolean;
  activityDescription: string | null;
  /** Points, as stored on the case: 50 means 50%. */
  sharePercentage: number | null;
  pmMonthlyDebt: number | null;
  pfMonthlyDebt: number | null;
}

export interface PmCapacityResult {
  activityFactor: number | null;
  santanderStatements: PmBankCapacity;
  santanderTaxReturn: PmBankCapacity;
  scotiabank: PmBankCapacity;
  banorte: PmBankCapacity;
  hsbc: PmBankCapacity;
}

function pesos(value: Prisma.Decimal): number {
  return Number(value.toDecimalPlaces(2).toFixed(2));
}

function invalidIncome(reason: string): IncomeBase {
  return {
    valid: false,
    invalidReason: reason,
    monthlyGross: null,
    monthlyNet: null,
  };
}

export function resolvePmSantanderFactor(
  description: string | null | undefined,
): number | null {
  if (!description) return null;
  const haystack = normalizeSatText(description);
  const hit = PM_SANTANDER_GIRO_FACTORS.find((row) =>
    haystack.includes(normalizeSatText(row.alias)),
  );
  return hit?.factor ?? null;
}

/**
 * Declaration path uses ingresos acumulables / 12.
 * Fiscal loss knocks out only this base.
 */
export function pmTaxBase(extracted: TaxReturnExtract | null | undefined): IncomeBase {
  if (!extracted) return invalidIncome('MISSING_DOCUMENT');
  if (extracted.hasTaxLoss === true) return invalidIncome('TAX_LOSS');
  const accumulable = extracted.fiscalResult?.accumulableIncomeTotal;
  if (accumulable == null) return invalidIncome('MISSING_DOCUMENT');
  const monthly = pesos(new Prisma.Decimal(accumulable).div(12));
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: monthly,
    monthlyNet: monthly,
  };
}

export function smoothCompanyDeposits(
  months: CompanyStatementMonth[],
  windowMonths: 6 | 12,
): BankIncomeBase {
  return smooth(
    months.map((month) => ({
      monthKey: month.monthKey,
      total: new Prisma.Decimal(month.validIncome),
    })),
    windowMonths,
  );
}

function emptyCapacity(status: PmCapacityStatus, reason: string): PmBankCapacity {
  return {
    status,
    reason,
    admissibleIncome: null,
    incomeToConsider: null,
    maximumDebt: null,
    capacity: null,
  };
}

function openBank(reason: string): PmBankCapacity {
  return emptyCapacity('REQUIRES_REVIEW', reason);
}

function shareRatio(sharePercentage: number): Prisma.Decimal {
  return new Prisma.Decimal(sharePercentage).div(100);
}

/**
 * Santander: ingreso = promedio × factor × % → − deuda PM → × CE 0.50 → − deuda PF.
 * Scotiabank: promedio × % × 0.40, then − deuda PF. The 0.40 is the CE.
 * Banorte and HSBC stay open until the advisor closes the formula.
 */
export function calculatePmCapacities(input: PmCapacityInput): PmCapacityResult {
  const activityFactor = resolvePmSantanderFactor(input.activityDescription);
  return {
    activityFactor,
    santanderStatements: santanderFromBase(
      input.bank,
      input.depositGateViable,
      activityFactor,
      input,
    ),
    santanderTaxReturn: santanderFromBase(input.tax, true, activityFactor, input),
    scotiabank: scotiabankFromBank(input),
    banorte: openBank('BANORTE_PM_INCOME_OPEN'),
    hsbc: openBank('HSBC_PM_INCOME_OPEN'),
  };
}

function santanderFromBase(
  base: IncomeBase,
  depositGateViable: boolean,
  activityFactor: number | null,
  input: PmCapacityInput,
): PmBankCapacity {
  if (!base.valid) {
    return emptyCapacity('NOT_VIABLE', base.invalidReason ?? 'INSUFFICIENT_MONTHS');
  }
  if (!depositGateViable) {
    return emptyCapacity('NOT_VIABLE', 'SANTANDER_DEPOSIT_MINIMUM');
  }
  if (activityFactor == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'ACTIVITY_UNMAPPED');
  }
  if (input.sharePercentage == null || !Number.isFinite(input.sharePercentage)) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHARE_PERCENTAGE');
  }
  if (input.pmMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_COMPANY_DEBT');
  }
  if (input.pfMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHAREHOLDER_DEBT');
  }

  const admissible = new Prisma.Decimal(base.monthlyGross ?? 0)
    .mul(activityFactor)
    .mul(shareRatio(input.sharePercentage))
    .toDecimalPlaces(2);
  const incomeToConsider = admissible
    .minus(input.pmMonthlyDebt)
    .toDecimalPlaces(2);
  const maximumDebt = incomeToConsider.mul(SANTANDER_CE).toDecimalPlaces(2);
  const capacity = maximumDebt.minus(input.pfMonthlyDebt).toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: null,
    admissibleIncome: pesos(admissible),
    incomeToConsider: pesos(incomeToConsider),
    maximumDebt: pesos(maximumDebt),
    capacity: pesos(capacity),
  };
}

function scotiabankFromBank(input: PmCapacityInput): PmBankCapacity {
  if (!input.bank.valid) {
    return emptyCapacity(
      'NOT_VIABLE',
      input.bank.invalidReason ?? 'INSUFFICIENT_MONTHS',
    );
  }
  if (input.sharePercentage == null || !Number.isFinite(input.sharePercentage)) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHARE_PERCENTAGE');
  }
  if (input.pfMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHAREHOLDER_DEBT');
  }

  const admissible = new Prisma.Decimal(input.bank.monthlyGross ?? 0)
    .mul(shareRatio(input.sharePercentage))
    .toDecimalPlaces(2);
  const maximumDebt = admissible.mul(SCOTIABANK_CE).toDecimalPlaces(2);
  const capacity = maximumDebt.minus(input.pfMonthlyDebt).toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: null,
    admissibleIncome: pesos(admissible),
    incomeToConsider: pesos(admissible),
    maximumDebt: pesos(maximumDebt),
    capacity: pesos(capacity),
  };
}
