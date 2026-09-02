import { Prisma } from '../generated/prisma/client';
import type {
  ActivityResolution,
  BankIncomeBase,
  IncomeBase,
  IncomeSource,
} from './income-calculation.types';

const ZERO = new Prisma.Decimal(0);
const TWELVE = new Prisma.Decimal(12);

const TWELVE_MONTH_KEYWORDS = [
  'primaria',
  'restaurantero',
  'alimentos y bebidas',
] as const;

export interface AssembledMonth {
  monthKey: string;
  total: Prisma.Decimal;
}

export interface CsfActivityInput {
  description?: string | null;
  percentage?: number | null;
  order?: number | null;
  endDate?: string | null;
}

export interface BankStatementExtract {
  statementPeriod?: {
    periodStartDate?: string | null;
    periodEndDate?: string | null;
    isCurrentIncompleteMonth?: boolean | null;
  };
  financialDepuration?: {
    depurationSummary?: {
      totalValidIncome?: number | null;
    };
  };
}

export interface TaxReturnExtract {
  fiscalResult?: {
    fiscalProfit?: number | null;
    accumulableIncomeTotal?: number | null;
  };
  hasTaxLoss?: boolean;
}

function toMonthlyNumber(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

function normalizeKeywordHaystack(description: string): string {
  return description.toLowerCase().replace(/-/g, ' ');
}

function matchKeyword(
  description: string | null,
): (typeof TWELVE_MONTH_KEYWORDS)[number] | null {
  if (!description) return null;
  const haystack = normalizeKeywordHaystack(description);
  return (
    TWELVE_MONTH_KEYWORDS.find((keyword) => haystack.includes(keyword)) ?? null
  );
}

function monthKeyFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 7) return null;
  return trimmed.slice(0, 7);
}

/**
 * Filters CSF activities to those still active (`endDate` null), then
 * picks the highest percentage; ties go to the lower `order`.
 */
export function resolveActivity(
  activities: CsfActivityInput[],
): ActivityResolution {
  const active = activities.filter(
    (activity) => activity.endDate == null || activity.endDate === '',
  );
  const sorted = [...active].sort((a, b) => {
    const percentageDelta = (b.percentage ?? 0) - (a.percentage ?? 0);
    if (percentageDelta !== 0) return percentageDelta;
    return (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER);
  });
  const winner = sorted[0];
  if (!winner) {
    return {
      description: null,
      percentage: null,
      order: null,
      matchedKeyword: null,
      windowMonths: 6,
    };
  }
  const description = winner.description ?? null;
  const matchedKeyword = matchKeyword(description);
  return {
    description,
    percentage: winner.percentage ?? null,
    order: winner.order ?? null,
    matchedKeyword,
    windowMonths: matchedKeyword ? 12 : 6,
  };
}

/**
 * Groups bank statements by YYYY-MM of `periodStartDate` (fallback
 * `periodEndDate`), skipping incomplete current months, and sums
 * `totalValidIncome` per month.
 */
export function assembleMonths(
  statements: BankStatementExtract[],
): AssembledMonth[] {
  const totals = new Map<string, Prisma.Decimal>();
  for (const statement of statements) {
    const period = statement.statementPeriod ?? {};
    if (period.isCurrentIncompleteMonth === true) continue;
    const monthKey =
      monthKeyFromDate(period.periodStartDate) ??
      monthKeyFromDate(period.periodEndDate);
    if (!monthKey) continue;
    const income = new Prisma.Decimal(
      statement.financialDepuration?.depurationSummary?.totalValidIncome ?? 0,
    );
    totals.set(monthKey, (totals.get(monthKey) ?? ZERO).plus(income));
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, total]) => ({ monthKey, total }));
}

function invalidBase(invalidReason: string): IncomeBase {
  return {
    valid: false,
    invalidReason,
    monthlyGross: null,
    monthlyNet: null,
  };
}

function invalidBank(windowMonths: 6 | 12): BankIncomeBase {
  return {
    ...invalidBase('INSUFFICIENT_MONTHS'),
    windowMonths,
    monthsUsed: [],
    droppedMax: null,
    droppedMin: null,
  };
}

/**
 * Takes the most recent N unique months, then drops the min and max
 * totals (tie-break: `total ASC`, then `monthKey ASC`) and returns
 * the Decimal mean of what remains. Fewer than N months ⇒ invalid.
 */
export function smooth(
  months: AssembledMonth[],
  windowMonths: 6 | 12,
): BankIncomeBase {
  if (months.length < windowMonths) {
    return invalidBank(windowMonths);
  }
  const recent = [...months]
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, windowMonths);
  const ranked = [...recent].sort((a, b) => {
    const totalCmp = a.total.comparedTo(b.total);
    if (totalCmp !== 0) return totalCmp;
    return a.monthKey.localeCompare(b.monthKey);
  });
  const droppedMin = ranked[0];
  const droppedMax = ranked[ranked.length - 1];
  const kept = ranked.slice(1, -1);
  const sum = kept.reduce((acc, month) => acc.plus(month.total), ZERO);
  const mean = sum.div(kept.length);
  const monthly = toMonthlyNumber(mean);
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: monthly,
    monthlyNet: monthly,
    windowMonths,
    monthsUsed: kept.map((month) => month.monthKey).sort(),
    droppedMax: droppedMax.monthKey,
    droppedMin: droppedMin.monthKey,
  };
}

/**
 * Tax monthly conversion: NETO = fiscalProfit / 12,
 * BRUTO = accumulableIncomeTotal / 12. Fiscal loss knocks out
 * this base only.
 */
export function taxMonthly(extracted: TaxReturnExtract): IncomeBase {
  if (extracted.hasTaxLoss === true) {
    return invalidBase('TAX_LOSS');
  }
  const fiscalProfit = extracted.fiscalResult?.fiscalProfit;
  const accumulable = extracted.fiscalResult?.accumulableIncomeTotal;
  if (fiscalProfit == null && accumulable == null) {
    return invalidBase('MISSING_DOCUMENT');
  }
  const net = new Prisma.Decimal(fiscalProfit ?? 0).div(TWELVE);
  const gross = new Prisma.Decimal(accumulable ?? 0).div(TWELVE);
  return {
    valid: true,
    invalidReason: null,
    monthlyGross: toMonthlyNumber(gross),
    monthlyNet: toMonthlyNumber(net),
  };
}

/**
 * Default source: bank statements if valid, else tax return if valid.
 */
export function chooseSource(
  bank: BankIncomeBase,
  tax: IncomeBase,
): IncomeSource | null {
  if (bank.valid) return 'BANK_STATEMENTS';
  if (tax.valid) return 'TAX_RETURN';
  return null;
}
