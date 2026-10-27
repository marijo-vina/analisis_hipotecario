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
const BANORTE_CLIENT_FACTOR = new Prisma.Decimal('0.50');
const BANORTE_PROSPECT_FACTOR = new Prisma.Decimal('0.40');
const BANORTE_CE = new Prisma.Decimal('0.60');
const BANORTE_TAX_FACTOR = new Prisma.Decimal('0.85');
const BANORTE_SIMPLE_MONTHS = 6;
const HSBC_VISOR_FACTOR = new Prisma.Decimal('0.30');
const HSBC_CE = new Prisma.Decimal('0.50');
const BANREGIO_ACCIONISTA = new Prisma.Decimal('1.00');
const BANREGIO_ADJUSTMENT = new Prisma.Decimal('0.50');
const BANREGIO_MONTHS = 3;

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
  /** Company statement months. Banorte averages the latest six, without dropping extremes. */
  statementMonths?: CompanyStatementMonth[];
  /** True when the company already banks with Banorte. */
  companyIsBanorteClient?: boolean;
  /** Annual utilidad fiscal from the company tax return. */
  fiscalProfit?: number | null;
}

export interface PmCapacityResult {
  activityFactor: number | null;
  banorteClientFactor: number;
  santanderStatements: PmBankCapacity;
  santanderTaxReturn: PmBankCapacity;
  scotiabank: PmBankCapacity;
  banorteStatements: PmBankCapacity;
  banorteTaxReturn: PmBankCapacity;
  hsbcStatements: PmBankCapacity;
  hsbcTaxReturn: PmBankCapacity;
  banregioStatements: PmBankCapacity;
  banregioTaxReturn: PmBankCapacity;
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
  if (months.length === 0) {
    return {
      valid: false,
      invalidReason: 'INSUFFICIENT_MONTHS',
      monthlyGross: null,
      monthlyNet: null,
      windowMonths,
      monthsUsed: [],
      droppedMax: null,
      droppedMin: null,
      statementNotice: null,
    };
  }
  if (months.length < windowMonths) {
    return {
      ...averageAvailableMonths(months),
      windowMonths,
      statementNotice: `Faltan estados de cuenta para completar ${windowMonths} meses. Hay ${months.length} de ${windowMonths}.`,
    };
  }
  return {
    ...smooth(
      months.map((month) => ({
        monthKey: month.monthKey,
        total: new Prisma.Decimal(month.validIncome),
      })),
      windowMonths,
    ),
    statementNotice: null,
  };
}

/**
 * Averages the months on file. Three or more months drop the highest and
 * the lowest, the same way a complete window does.
 */
function averageAvailableMonths(
  months: CompanyStatementMonth[],
): Omit<BankIncomeBase, 'windowMonths' | 'statementNotice'> {
  const recent = [...months].sort((a, b) => b.monthKey.localeCompare(a.monthKey));
  if (recent.length < 3) {
    const sum = recent.reduce(
      (acc, month) => acc.plus(month.validIncome),
      new Prisma.Decimal(0),
    );
    const monthly = pesos(sum.div(recent.length));
    return {
      valid: true,
      invalidReason: null,
      monthlyGross: monthly,
      monthlyNet: monthly,
      monthsUsed: recent.map((month) => month.monthKey).sort(),
      droppedMax: null,
      droppedMin: null,
    };
  }
  const ranked = [...recent].sort((a, b) => {
    const totalCmp = new Prisma.Decimal(a.validIncome).comparedTo(b.validIncome);
    if (totalCmp !== 0) return totalCmp;
    return a.monthKey.localeCompare(b.monthKey);
  });
  const droppedMin = ranked[0];
  const droppedMax = ranked[ranked.length - 1];
  const kept = ranked.slice(1, -1);
  const sum = kept.reduce(
    (acc, month) => acc.plus(month.validIncome),
    new Prisma.Decimal(0),
  );
  const monthly = pesos(sum.div(kept.length));
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: monthly,
    monthlyNet: monthly,
    monthsUsed: kept.map((month) => month.monthKey).sort(),
    droppedMax: droppedMax.monthKey,
    droppedMin: droppedMin.monthKey,
  };
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

function shareRatio(sharePercentage: number): Prisma.Decimal {
  return new Prisma.Decimal(sharePercentage).div(100);
}

/**
 * Santander: ingreso = promedio × factor × % → − deuda PM → × CE 0.50 → − deuda PF.
 * Scotiabank: promedio × % × 0.40, then − deuda PF. The 0.40 is the CE.
 * Banorte statements: promedio simple de 6 × 50% o 40% − deuda PM, luego × % × CE 0.60 − deuda PF.
 * Banorte tax: utilidad mensual × 85% × %.
 * HSBC: flujos o ventas × 30% × % × CE 0.50 − deuda PF.
 */
export function calculatePmCapacities(input: PmCapacityInput): PmCapacityResult {
  const activityFactor = resolvePmSantanderFactor(input.activityDescription);
  const banorteClientFactor = input.companyIsBanorteClient ? 0.5 : 0.4;
  return {
    activityFactor,
    banorteClientFactor,
    santanderStatements: santanderFromBase(
      input.bank,
      input.depositGateViable,
      activityFactor,
      input,
    ),
    santanderTaxReturn: santanderFromBase(input.tax, true, activityFactor, input),
    scotiabank: scotiabankFromBank(input),
    banorteStatements: banorteFromStatements(input, banorteClientFactor),
    banorteTaxReturn: banorteFromTax(input),
    hsbcStatements: hsbcFromBase(input.bank, input),
    hsbcTaxReturn: hsbcFromBase(input.tax, input),
    banregioStatements: banregioFromStatements(input),
    banregioTaxReturn: banregioFromBase(input.tax, input),
  };
}

export function simpleRecentAverage(
  months: CompanyStatementMonth[],
  count: number,
): number | null {
  if (months.length === 0 || count < 1) return null;
  const recent = [...months]
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, count);
  const sum = recent.reduce(
    (acc, month) => acc.plus(month.validIncome),
    new Prisma.Decimal(0),
  );
  return pesos(sum.div(recent.length));
}

function missingShareOrDebts(
  input: PmCapacityInput,
  debts: Array<'pm' | 'pf'>,
): PmBankCapacity | null {
  if (input.sharePercentage == null || !Number.isFinite(input.sharePercentage)) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHARE_PERCENTAGE');
  }
  if (debts.includes('pm') && input.pmMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_COMPANY_DEBT');
  }
  if (debts.includes('pf') && input.pfMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHAREHOLDER_DEBT');
  }
  return null;
}

function banorteFromStatements(
  input: PmCapacityInput,
  clientFactor: number,
): PmBankCapacity {
  const average = simpleRecentAverage(
    input.statementMonths ?? [],
    BANORTE_SIMPLE_MONTHS,
  );
  if (average == null) {
    return emptyCapacity('NOT_VIABLE', 'INSUFFICIENT_MONTHS');
  }
  const blocked = missingShareOrDebts(input, ['pm', 'pf']);
  if (blocked) return blocked;

  const factored = new Prisma.Decimal(average)
    .mul(clientFactor === 0.5 ? BANORTE_CLIENT_FACTOR : BANORTE_PROSPECT_FACTOR)
    .toDecimalPlaces(2);
  const afterCompanyDebt = factored
    .minus(input.pmMonthlyDebt ?? 0)
    .toDecimalPlaces(2);
  const shared = afterCompanyDebt
    .mul(shareRatio(input.sharePercentage ?? 0))
    .toDecimalPlaces(2);
  const maximumDebt = shared.mul(BANORTE_CE).toDecimalPlaces(2);
  const capacity = maximumDebt
    .minus(input.pfMonthlyDebt ?? 0)
    .toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: null,
    admissibleIncome: pesos(factored),
    incomeToConsider: pesos(shared),
    maximumDebt: pesos(maximumDebt),
    capacity: pesos(capacity),
  };
}

function banorteFromTax(input: PmCapacityInput): PmBankCapacity {
  if (input.fiscalProfit == null || !Number.isFinite(input.fiscalProfit)) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_NET_PROFIT');
  }
  if (input.fiscalProfit < 0) {
    return emptyCapacity('NOT_VIABLE', 'TAX_LOSS');
  }
  const blocked = missingShareOrDebts(input, []);
  if (blocked) return blocked;

  const monthly = new Prisma.Decimal(input.fiscalProfit).div(12);
  const capacity = monthly
    .mul(BANORTE_TAX_FACTOR)
    .mul(shareRatio(input.sharePercentage ?? 0))
    .toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: null,
    admissibleIncome: pesos(capacity),
    incomeToConsider: pesos(capacity),
    maximumDebt: pesos(capacity),
    capacity: pesos(capacity),
  };
}

function banregioFromStatements(input: PmCapacityInput): PmBankCapacity {
  const months = input.statementMonths ?? [];
  const average = simpleRecentAverage(months, BANREGIO_MONTHS);
  const used = Math.min(months.length, BANREGIO_MONTHS);
  return banregioFromAverage(average, used, input);
}

function banregioFromBase(base: IncomeBase, input: PmCapacityInput): PmBankCapacity {
  if (!base.valid || base.monthlyGross == null) {
    return emptyCapacity('NOT_VIABLE', base.invalidReason ?? 'MISSING_DOCUMENT');
  }
  return banregioFromAverage(base.monthlyGross, BANREGIO_MONTHS, input);
}

function banregioFromAverage(
  average: number | null,
  monthsUsed: number,
  input: PmCapacityInput,
): PmBankCapacity {
  if (average == null) {
    return emptyCapacity('NOT_VIABLE', 'INSUFFICIENT_MONTHS');
  }
  if (input.pmMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_COMPANY_DEBT');
  }
  if (input.pfMonthlyDebt == null) {
    return emptyCapacity('REQUIRES_REVIEW', 'MISSING_SHAREHOLDER_DEBT');
  }

  const admissible = new Prisma.Decimal(average)
    .mul(BANREGIO_ACCIONISTA)
    .toDecimalPlaces(2);
  const adjusted = admissible.mul(BANREGIO_ADJUSTMENT).toDecimalPlaces(2);
  const commitments = new Prisma.Decimal(input.pmMonthlyDebt ?? 0)
    .plus(input.pfMonthlyDebt ?? 0)
    .toDecimalPlaces(2);
  const capacity = adjusted.minus(commitments).toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: monthsUsed < BANREGIO_MONTHS ? 'BANREGIO_MENOS_DE_3_MESES' : null,
    admissibleIncome: pesos(admissible),
    incomeToConsider: pesos(adjusted),
    maximumDebt: pesos(adjusted),
    capacity: pesos(capacity),
  };
}

function hsbcFromBase(base: IncomeBase, input: PmCapacityInput): PmBankCapacity {
  if (!base.valid) {
    return emptyCapacity('NOT_VIABLE', base.invalidReason ?? 'MISSING_DOCUMENT');
  }
  const blocked = missingShareOrDebts(input, ['pf']);
  if (blocked) return blocked;

  const admissible = new Prisma.Decimal(base.monthlyGross ?? 0)
    .mul(HSBC_VISOR_FACTOR)
    .mul(shareRatio(input.sharePercentage ?? 0))
    .toDecimalPlaces(2);
  const maximumDebt = admissible.mul(HSBC_CE).toDecimalPlaces(2);
  const capacity = maximumDebt
    .minus(input.pfMonthlyDebt ?? 0)
    .toDecimalPlaces(2);

  return {
    status: 'CALCULATED',
    reason: null,
    admissibleIncome: pesos(admissible),
    incomeToConsider: pesos(admissible),
    maximumDebt: pesos(maximumDebt),
    capacity: pesos(capacity),
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
