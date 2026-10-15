import { Prisma } from '../generated/prisma/client';
import type { ActivityResolution } from './income-calculation.types';
import {
  resolveActivity,
  type CsfActivityInput,
} from './pfae-income.helpers';

/** Santander requires at least this many valid deposits in each window month. */
export const SANTANDER_MIN_VALID_DEPOSITS_PER_MONTH = 5;

export type CompanyStatementGateStatus = 'VIABLE' | 'BELOW_MINIMUM' | 'NO_MONTHS';

/**
 * One company bank statement after the PFAE cleaner has run.
 * Month identity follows `assembleMonths`: the statement period, not each deposit date.
 */
export interface CompanyStatementInput {
  statementPeriod?: {
    periodStartDate?: string | null;
    periodEndDate?: string | null;
    isCurrentIncompleteMonth?: boolean | null;
  };
  financialDepuration?: {
    depurationSummary?: {
      totalValidIncome?: number | null;
      validDepositsCount?: number | null;
    };
  };
}

export interface CompanyStatementMonth {
  monthKey: string;
  validIncome: number;
  validDepositCount: number;
  statementCount: number;
}

export interface SantanderDepositGate {
  minimumValidDeposits: number;
  windowMonths: 6 | 12;
  /** False when fewer than `windowMonths` complete months are present. */
  windowComplete: boolean;
  status: CompanyStatementGateStatus;
  /** True only when every evaluated month has at least the minimum. */
  viable: boolean;
  evaluatedMonths: string[];
  failingMonths: string[];
}

/**
 * Grouped company deposits plus the Santander count gate.
 * Does not drop max/min or compute capacity — that stays in HU-27.
 */
export interface CompanyStatementRollup {
  activity: ActivityResolution;
  months: CompanyStatementMonth[];
  santanderDepositGate: SantanderDepositGate;
}

interface MonthAccumulator {
  validIncome: Prisma.Decimal;
  validDepositCount: number;
  statementCount: number;
}

function monthKeyFromDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.length < 7) return null;
  return trimmed.slice(0, 7);
}

function money(value: Prisma.Decimal): number {
  return Number(value.toFixed(2));
}

/**
 * Sums valid income and valid deposit counts of company statements that share
 * a YYYY-MM period. Skips the incomplete current month.
 */
export function groupCompanyStatementMonths(
  statements: CompanyStatementInput[],
): CompanyStatementMonth[] {
  const totals = new Map<string, MonthAccumulator>();
  for (const statement of statements) {
    const period = statement.statementPeriod ?? {};
    if (period.isCurrentIncompleteMonth === true) continue;
    const monthKey =
      monthKeyFromDate(period.periodStartDate) ??
      monthKeyFromDate(period.periodEndDate);
    if (!monthKey) continue;
    const summary = statement.financialDepuration?.depurationSummary;
    const income = new Prisma.Decimal(summary?.totalValidIncome ?? 0);
    const count = summary?.validDepositsCount ?? 0;
    const current = totals.get(monthKey) ?? {
      validIncome: new Prisma.Decimal(0),
      validDepositCount: 0,
      statementCount: 0,
    };
    totals.set(monthKey, {
      validIncome: current.validIncome.plus(income),
      validDepositCount: current.validDepositCount + count,
      statementCount: current.statementCount + 1,
    });
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([monthKey, total]) => ({
      monthKey,
      validIncome: money(total.validIncome),
      validDepositCount: total.validDepositCount,
      statementCount: total.statementCount,
    }));
}

/**
 * Judges the most recent `windowMonths` (or every month when fewer exist).
 * A month with fewer than 5 valid deposits makes the bank-statement path not viable.
 */
export function evaluateSantanderDepositGate(
  months: CompanyStatementMonth[],
  windowMonths: 6 | 12,
): SantanderDepositGate {
  const minimumValidDeposits = SANTANDER_MIN_VALID_DEPOSITS_PER_MONTH;
  if (months.length === 0) {
    return {
      minimumValidDeposits,
      windowMonths,
      windowComplete: false,
      status: 'NO_MONTHS',
      viable: false,
      evaluatedMonths: [],
      failingMonths: [],
    };
  }
  const evaluated = [...months]
    .sort((a, b) => b.monthKey.localeCompare(a.monthKey))
    .slice(0, windowMonths)
    .sort((a, b) => a.monthKey.localeCompare(b.monthKey));
  const failingMonths = evaluated
    .filter((month) => month.validDepositCount < minimumValidDeposits)
    .map((month) => month.monthKey);
  const status: CompanyStatementGateStatus =
    failingMonths.length > 0 ? 'BELOW_MINIMUM' : 'VIABLE';
  return {
    minimumValidDeposits,
    windowMonths,
    windowComplete: months.length >= windowMonths,
    status,
    viable: status === 'VIABLE',
    evaluatedMonths: evaluated.map((month) => month.monthKey),
    failingMonths,
  };
}

export interface ProcessedFiscalCandidate<T> {
  typeCode: string;
  statusCode: string;
  processedAt?: Date | string | null;
  createdAt?: Date | string | null;
  value: T;
}

function fiscalTimestamp(value: Date | string | null | undefined): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

/**
 * Latest processed CSF or tax-situation proof.
 * `processedAt` wins, then `createdAt`. Bank-statement extraction uses the
 * same order on its processed fiscal lookup.
 */
export function selectLatestProcessedFiscal<T>(
  docs: ProcessedFiscalCandidate<T>[],
): T | undefined {
  const processed = docs.filter(
    (doc) =>
      doc.statusCode === 'PROCESSED' &&
      (doc.typeCode === 'CSF' || doc.typeCode === 'TAX_SITUATION_PROOF'),
  );
  processed.sort((left, right) => {
    const byProcessed =
      fiscalTimestamp(right.processedAt) - fiscalTimestamp(left.processedAt);
    if (byProcessed !== 0) return byProcessed;
    return fiscalTimestamp(right.createdAt) - fiscalTimestamp(left.createdAt);
  });
  return processed[0]?.value;
}

export function rollupCompanyStatements(
  statements: CompanyStatementInput[],
  activities: CsfActivityInput[],
): CompanyStatementRollup {
  const activity = resolveActivity(activities);
  const months = groupCompanyStatementMonths(statements);
  return {
    activity,
    months,
    santanderDepositGate: evaluateSantanderDepositGate(
      months,
      activity.windowMonths,
    ),
  };
}
