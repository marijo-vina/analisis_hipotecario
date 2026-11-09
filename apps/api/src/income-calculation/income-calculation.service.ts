import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  IncomeCalculationStatus,
  type BankIncomeBase,
  type IncomeBase,
  type IncomeCalculationResult,
  type IncomeReceiptResult,
  type IncomeSource,
  type PfaeIncomeBases,
  type PmIncomeBases,
} from './income-calculation.types';
import type { SaveConciliationDto } from './dto/save-conciliation.dto';
import {
  assembleMonths,
  chooseSource,
  resolveActivity,
  smooth,
  taxMonthly,
  type BankStatementExtract,
  type CsfActivityInput,
  type TaxReturnExtract,
} from './pfae-income.helpers';
import {
  evaluateSantanderDepositGate,
  groupCompanyStatementMonths,
  rollupCompanyStatements,
  selectLatestProcessedFiscal,
  type CompanyStatementInput,
  type CompanyStatementRollup,
} from './pm-company-statements';
import {
  calculatePmCapacities,
  pmTaxBase,
  smoothCompanyDeposits,
} from './pm-capacity';
import { companyLegalForm, pmSharePercentage } from '../case-analysis/pm-gates-input';

const PFAE_DOCUMENT_CODES = ['CSF', 'BANK_STATEMENT', 'TAX_RETURN'] as const;
const ZERO = new Prisma.Decimal(0);

// ── Pure helpers ──────────────────────────────────────────────────────────

/**
 * Map a payroll-receipt Document row to an `IncomeReceiptResult`.
 *
 * The payroll-extraction service (Gemini) stores data in nested objects:
 *   - `employer.legalName`, `employer.rfc`
 *   - `payrollPeriod.periodLabel` / `payrollPeriod.periodRaw`, `payrollPeriod.paymentDate`
 *   - `income.grossIncome`, `income.netIncome`
 *
 * This function also tolerates flat top-level fallbacks (`data.employer`,
 * `data.grossIncome`, etc.) for legacy or differently-extracted documents.
 * All extracted fields default to `null` when missing — the design's
 * "No inventes datos" rule at extraction time already guarantees this.
 */
export function mapDocumentToReceipt(
  doc: Record<string, unknown>,
): IncomeReceiptResult {
  const data = (doc.extractedData ?? {}) as Record<string, any>;
  const income = data.income ?? {};
  const employer = data.employer ?? {};
  const period = data.payrollPeriod ?? {};

  return {
    documentId: String(doc.id),
    period: period.periodLabel ?? period.periodRaw ?? data.period ?? null,
    paymentDate: period.paymentDate ?? data.paymentDate ?? null,
    employer: employer.legalName ?? data.employer ?? null,
    employerRfc: employer.rfc ?? data.employerRfc ?? null,
    grossIncome: income.grossIncome ?? data.grossIncome ?? null,
    netIncome: income.netIncome ?? data.netIncome ?? null,
    conciliationStatus: ((doc.processingResults as any)?.conciliation?.status as string) ?? null,
    reviewStatus: ((doc.processingResults as any)?.conciliation?.reviewStatus as string) ?? null,
    included: true,
  };
}

interface Averages {
  gross: Prisma.Decimal;
  net: Prisma.Decimal;
}

/**
 * Compute average gross/net income across the given receipts using
 * `Prisma.Decimal` arithmetic so (15,000.50 + 14,999.50) / 2 lands on
 * exactly 15,000.00 with no IEEE-754 drift. Null income contributes 0.
 */
export function computeAverages(receipts: IncomeReceiptResult[]): Averages {
  const zero = new Prisma.Decimal(0);
  const grossSum = receipts.reduce(
    (sum, r) => sum.plus(new Prisma.Decimal(r.grossIncome ?? 0)),
    zero,
  );
  const netSum = receipts.reduce(
    (sum, r) => sum.plus(new Prisma.Decimal(r.netIncome ?? 0)),
    zero,
  );
  const count = new Prisma.Decimal(receipts.length);
  return {
    gross: grossSum.div(count),
    net: netSum.div(count),
  };
}

function projectChosenBase(
  bank: BankIncomeBase,
  tax: IncomeBase,
): {
  source: IncomeSource;
  gross: Prisma.Decimal;
  net: Prisma.Decimal;
  status: IncomeCalculationStatus;
} {
  const chosen = chooseSource(bank, tax);
  if (chosen === 'BANK_STATEMENTS') {
    return {
      source: chosen,
      gross: new Prisma.Decimal(bank.monthlyGross ?? 0),
      net: new Prisma.Decimal(bank.monthlyNet ?? 0),
      status: IncomeCalculationStatus.CALCULATED,
    };
  }
  if (chosen === 'TAX_RETURN') {
    return {
      source: chosen,
      gross: new Prisma.Decimal(tax.monthlyGross ?? 0),
      net: new Prisma.Decimal(tax.monthlyNet ?? 0),
      status: IncomeCalculationStatus.CALCULATED,
    };
  }
  return {
    source: 'BANK_STATEMENTS',
    gross: ZERO,
    net: ZERO,
    status: IncomeCalculationStatus.REQUIRES_REVIEW,
  };
}

function decimalToNumber(
  value: { toString(): string } | number | null | undefined,
): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value.toString());
  return Number.isFinite(parsed) ? parsed : null;
}

function timestamp(value: Date | null | undefined): number {
  if (value == null) return Number.NEGATIVE_INFINITY;
  const time = value.getTime();
  return Number.isNaN(time) ? Number.NEGATIVE_INFINITY : time;
}

function latestProcessedCompanyTax(
  docs: Array<{
    documentType: { code: string };
    documentStatus?: { code: string } | null;
    processedAt?: Date | null;
    createdAt?: Date | null;
    extractedData: unknown;
  }>,
): TaxReturnExtract | null {
  const processed = docs.filter(
    (doc) =>
      doc.documentType.code === 'TAX_RETURN' &&
      doc.documentStatus?.code === 'PROCESSED',
  );
  processed.sort((left, right) => {
    const byProcessed = timestamp(right.processedAt) - timestamp(left.processedAt);
    if (byProcessed !== 0) return byProcessed;
    return timestamp(right.createdAt) - timestamp(left.createdAt);
  });
  return (processed[0]?.extractedData as TaxReturnExtract | undefined) ?? null;
}

function projectPmSnapshot(
  bank: BankIncomeBase,
  tax: IncomeBase,
): {
  source: IncomeSource;
  gross: Prisma.Decimal;
  net: Prisma.Decimal;
  status: IncomeCalculationStatus;
} {
  if (bank.valid && bank.monthlyGross != null) {
    return {
      source: 'BANK_STATEMENTS',
      gross: new Prisma.Decimal(bank.monthlyGross),
      net: new Prisma.Decimal(bank.monthlyNet ?? bank.monthlyGross),
      status: IncomeCalculationStatus.CALCULATED,
    };
  }
  if (tax.valid && tax.monthlyGross != null) {
    return {
      source: 'TAX_RETURN',
      gross: new Prisma.Decimal(tax.monthlyGross),
      net: new Prisma.Decimal(tax.monthlyNet ?? tax.monthlyGross),
      status: IncomeCalculationStatus.CALCULATED,
    };
  }
  return {
    source: 'BANK_STATEMENTS',
    gross: ZERO,
    net: ZERO,
    status: IncomeCalculationStatus.REQUIRES_REVIEW,
  };
}

// ── Service ────────────────────────────────────────────────────────────────

/**
 * Computes admissible monthly income from payroll receipts (HU-12).
 *
 * Mirrors HU-11's immutable `LiabilitySnapshot` pattern: every mutation
 * (calculate, toggle, confirm) persists a NEW `IncomeCalculation` row.
 * Monetary averages use Prisma `Decimal` with 2 decimal places.
 */
@Injectable()
export class IncomeCalculationService {
  constructor(private readonly prisma: PrismaService) {}

  // ── Public API ───────────────────────────────────────────────────────

  /**
   * Build a fresh income-calculation snapshot for the case.
   * SALARIED (or absent personType) uses payroll receipts.
   * PFAE skips payroll and computes independent bank/tax bases.
   * PM computes Santander and Scotiabank capacity from company documents.
   */
  async calculate(
    caseId: string,
    excludedDocumentIds: string[] = [],
  ): Promise<IncomeCalculationResult> {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: { personType: true },
    });

    if (mortgageCase?.personType === 'PM') {
      return this.calculatePm(caseId);
    }

    if (mortgageCase?.personType === 'PFAE') {
      return this.calculatePfae(caseId);
    }

    return this.calculateFromPayroll(caseId, excludedDocumentIds);
  }

  /**
   * Groups cleaned company bank statements and evaluates the Santander
   * minimum of 5 valid deposits per month. Does not smooth the average
   * or compute capacity.
   */
  async evaluateCompanyStatements(
    caseId: string,
  ): Promise<CompanyStatementRollup> {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: { id: true },
    });
    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    const docs = await this.prisma.document.findMany({
      where: {
        mortgageCaseId: caseId,
        owner: 'COMPANY',
        documentType: {
          code: { in: ['CSF', 'TAX_SITUATION_PROOF', 'BANK_STATEMENT'] },
        },
      },
      include: { documentType: true, documentStatus: true },
    });

    const fiscal = selectLatestProcessedFiscal(
      docs.map((doc) => ({
        typeCode: doc.documentType.code,
        statusCode: doc.documentStatus?.code ?? '',
        processedAt: doc.processedAt,
        createdAt: doc.createdAt,
        value: doc.extractedData,
      })),
    );
    const activities = (
      (fiscal ?? {}) as { activities?: CsfActivityInput[] }
    ).activities ?? [];
    const statements = docs
      .filter((doc) => doc.documentType.code === 'BANK_STATEMENT')
      .map((doc) => (doc.extractedData ?? {}) as CompanyStatementInput);

    return rollupCompanyStatements(statements, activities);
  }

  /**
   * Company deposits and the company tax return, priced with the closed
   * Santander and Scotiabank formulas. Shareholder payroll is not read.
   * Average columns stay unfactored; capacities live on `bases`.
   */
  private async calculatePm(caseId: string): Promise<IncomeCalculationResult> {
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: { id: true, sharePercentage: true, companyIsBanorteClient: true },
    });
    if (!mortgageCase) {
      throw new NotFoundException('Mortgage case not found');
    }

    const docs = await this.prisma.document.findMany({
      where: {
        mortgageCaseId: caseId,
        owner: 'COMPANY',
        documentType: {
          code: {
            in: [
              'CSF',
              'TAX_SITUATION_PROOF',
              'BANK_STATEMENT',
              'TAX_RETURN',
              'ARTICLES_OF_INCORPORATION',
              'CORPORATE_AMENDMENT',
            ],
          },
        },
      },
      include: { documentType: true, documentStatus: true },
    });

    const fiscal = selectLatestProcessedFiscal(
      docs.map((doc) => ({
        typeCode: doc.documentType.code,
        statusCode: doc.documentStatus?.code ?? '',
        processedAt: doc.processedAt,
        createdAt: doc.createdAt,
        value: doc.extractedData,
      })),
    );
    const activities = (
      (fiscal ?? {}) as { activities?: CsfActivityInput[] }
    ).activities ?? [];
    const activity = resolveActivity(activities);
    const statements = docs
      .filter((doc) => doc.documentType.code === 'BANK_STATEMENT')
      .map((doc) => (doc.extractedData ?? {}) as CompanyStatementInput);
    const months = groupCompanyStatementMonths(statements);
    const gate = evaluateSantanderDepositGate(months, activity.windowMonths);
    const bank = smoothCompanyDeposits(months, activity.windowMonths);
    const taxExtract = latestProcessedCompanyTax(docs);
    const tax = pmTaxBase(taxExtract);

    const liability = await this.prisma.liabilitySnapshot.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { calculatedAt: 'desc' },
      select: { pmMonthlyDebt: true, grossCurrentMonthlyDebt: true },
    });
    const caseShare =
      mortgageCase.sharePercentage == null
        ? null
        : Number(mortgageCase.sharePercentage);
    const sharePercentage = pmSharePercentage(
      docs,
      Number.isFinite(caseShare) ? caseShare : null,
    );
    const capacities = calculatePmCapacities({
      bank,
      tax,
      depositGateViable: gate.viable,
      activityDescription: activity.description,
      sharePercentage,
      pmMonthlyDebt: decimalToNumber(liability?.pmMonthlyDebt),
      pfMonthlyDebt: decimalToNumber(liability?.grossCurrentMonthlyDebt),
      statementMonths: months,
      companyIsBanorteClient: mortgageCase.companyIsBanorteClient,
      fiscalProfit: taxExtract?.fiscalResult?.fiscalProfit ?? null,
      legalForm: companyLegalForm(docs),
    });

    const projected = projectPmSnapshot(bank, tax);
    const bases: PmIncomeBases = {
      profile: 'PM',
      sharePercentage,
      activityFactor: capacities.activityFactor,
      banorteClientFactor: capacities.banorteClientFactor,
      bank,
      taxReturn: tax,
      activity,
      capacities: {
        santanderStatements: capacities.santanderStatements,
        santanderTaxReturn: capacities.santanderTaxReturn,
        scotiabank: capacities.scotiabank,
        banorteStatements: capacities.banorteStatements,
        banorteTaxReturn: capacities.banorteTaxReturn,
        hsbcStatements: capacities.hsbcStatements,
        hsbcTaxReturn: capacities.hsbcTaxReturn,
        banregioStatements: capacities.banregioStatements,
        banregioTaxReturn: capacities.banregioTaxReturn,
        banamexStatements: capacities.banamexStatements,
        banamexTaxReturn: capacities.banamexTaxReturn,
      },
    };

    const snapshot = await this.prisma.incomeCalculation.create({
      data: {
        mortgageCaseId: caseId,
        receiptResults: [] as unknown as never,
        averageGrossIncome: projected.gross.toFixed(2),
        averageNetIncome: projected.net.toFixed(2),
        status: projected.status,
        source: projected.source,
        bases: bases as unknown as Prisma.InputJsonValue,
      },
    });

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * SALARIED (or absent personType) path — payroll receipts only.
   * Behavior matches the pre-HU-18 `calculate()` implementation.
   */
  private async calculateFromPayroll(
    caseId: string,
    excludedDocumentIds: string[],
  ): Promise<IncomeCalculationResult> {
    const docs = await this.prisma.document.findMany({
      where: {
        mortgageCaseId: caseId,
        documentType: { code: 'PAYROLL_RECEIPT' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (docs.length === 0) {
      throw new NotFoundException(
        'No PAYROLL_RECEIPT documents found for this case',
      );
    }

    const excluded = new Set(excludedDocumentIds);
    const receiptResults: IncomeReceiptResult[] = docs.map((doc) => {
      const receipt = mapDocumentToReceipt(doc);
      if (excluded.has(receipt.documentId)) {
        receipt.included = false;
      }
      return receipt;
    });

    const included = receiptResults.filter((r) => r.included);
    if (included.length === 0) {
      throw new BadRequestException('At least one receipt must be selected');
    }

    const { gross, net } = computeAverages(included);

    const snapshot = await this.prisma.incomeCalculation.create({
      data: {
        mortgageCaseId: caseId,
        receiptResults: receiptResults as unknown as never,
        averageGrossIncome: gross.toFixed(2),
        averageNetIncome: net.toFixed(2),
        status: IncomeCalculationStatus.CALCULATED,
        source: 'PAYROLL',
      },
    });

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * PFAE path — skip payroll. Build independent bank and tax bases,
   * pick a default source, and project the chosen figures into the
   * existing average columns. Both invalid ⇒ REQUIRES_REVIEW, no throw.
   */
  private async calculatePfae(
    caseId: string,
  ): Promise<IncomeCalculationResult> {
    const docs = await this.prisma.document.findMany({
      where: {
        mortgageCaseId: caseId,
        documentType: { code: { in: [...PFAE_DOCUMENT_CODES] } },
      },
      include: { documentType: true },
    });

    const csfDoc = docs.find((doc) => doc.documentType.code === 'CSF');
    const bankDocs = docs.filter(
      (doc) => doc.documentType.code === 'BANK_STATEMENT',
    );
    const taxDoc = docs.find((doc) => doc.documentType.code === 'TAX_RETURN');

    const csfData = (csfDoc?.extractedData ?? {}) as {
      activities?: CsfActivityInput[];
    };
    const activity = resolveActivity(csfData.activities ?? []);
    const months = assembleMonths(
      bankDocs.map(
        (doc) => (doc.extractedData ?? {}) as BankStatementExtract,
      ),
    );
    const bank = smooth(months, activity.windowMonths);
    const tax = taxMonthly((taxDoc?.extractedData ?? {}) as TaxReturnExtract);
    const projected = projectChosenBase(bank, tax);

    const bases: PfaeIncomeBases = {
      bank,
      taxReturn: tax,
      activity,
    };

    const snapshot = await this.prisma.incomeCalculation.create({
      data: {
        mortgageCaseId: caseId,
        receiptResults: [] as unknown as never,
        averageGrossIncome: projected.gross.toFixed(2),
        averageNetIncome: projected.net.toFixed(2),
        status: projected.status,
        source: projected.source,
        bases: bases as unknown as Prisma.InputJsonValue,
      },
    });

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * Return the most recent `IncomeCalculation` snapshot for the case,
   * ordered by `calculatedAt` desc. Throws 404 if none exists.
   */
  async getLatest(caseId: string): Promise<IncomeCalculationResult> {
    const snapshot = await this.prisma.incomeCalculation.findFirst({
      where: { mortgageCaseId: caseId },
      orderBy: { calculatedAt: 'desc' },
    });

    if (!snapshot) {
      throw new NotFoundException('No income calculation found for this case');
    }

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * Toggle the `included` flag on a single receipt inside the latest
   * snapshot, recompute averages, and persist a NEW immutable snapshot
   * with `status = CALCULATED`. The receipt is identified by its
   * zero-based index within `receiptResults`.
   */
  async toggleReceipt(
    caseId: string,
    receiptIndex: number,
    included: boolean,
  ): Promise<IncomeCalculationResult> {
    const latest = await this.getLatest(caseId);

    const receiptResults: IncomeReceiptResult[] = [...latest.receiptResults];
    if (receiptIndex < 0 || receiptIndex >= receiptResults.length) {
      throw new NotFoundException(`Receipt index ${receiptIndex} out of range`);
    }

    receiptResults[receiptIndex] = {
      ...receiptResults[receiptIndex],
      included,
    };

    const includedReceipts = receiptResults.filter((r) => r.included);
    if (includedReceipts.length === 0) {
      throw new BadRequestException('At least one receipt must be selected');
    }

    const { gross, net } = computeAverages(includedReceipts);

    const snapshot = await this.prisma.incomeCalculation.create({
      data: {
        mortgageCaseId: caseId,
        receiptResults: receiptResults as unknown as never,
        averageGrossIncome: gross.toFixed(2),
        averageNetIncome: net.toFixed(2),
        status: IncomeCalculationStatus.CALCULATED,
      },
    });

    return this.snapshotToResult(snapshot, caseId);
  }

  /**
   * Clone the latest PFAE `bases`, persist a new snapshot with the chosen
   * `source`, and project that base into the unfactored average columns.
   * Rejects SALARIED cases and invalid/tax-loss chosen bases with 400.
   */
  async switchSource(
    caseId: string,
    source: IncomeSource,
  ): Promise<IncomeCalculationResult> {
    if (source !== 'BANK_STATEMENTS' && source !== 'TAX_RETURN') {
      throw new BadRequestException(
        'Income source must be BANK_STATEMENTS or TAX_RETURN',
      );
    }

    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      select: { personType: true },
    });
    if (mortgageCase?.personType !== 'PFAE') {
      throw new BadRequestException(
        'Income source switch is only available for PFAE cases',
      );
    }

    const latest = await this.getLatest(caseId);
    const bases = latest.bases;
    if (!bases) {
      throw new BadRequestException(
        'Income snapshot has no PFAE bases to clone',
      );
    }

    const chosen = source === 'BANK_STATEMENTS' ? bases.bank : bases.taxReturn;
    if (!chosen.valid) {
      throw new BadRequestException(
        `Cannot switch to ${source}: ${chosen.invalidReason ?? 'invalid base'}`,
      );
    }

    const clonedBases = structuredClone(bases);
    const snapshot = await this.prisma.incomeCalculation.create({
      data: {
        mortgageCaseId: caseId,
        receiptResults: [] as unknown as never,
        averageGrossIncome: new Prisma.Decimal(chosen.monthlyGross ?? 0).toFixed(
          2,
        ),
        averageNetIncome: new Prisma.Decimal(chosen.monthlyNet ?? 0).toFixed(2),
        status: IncomeCalculationStatus.CALCULATED,
        source,
        bases: clonedBases as unknown as Prisma.InputJsonValue,
      },
    });

    return this.snapshotToResult(snapshot, caseId);
  }

  // ── Conciliation persistence ─────────────────────────────────────────

  /**
   * Persist conciliation results into each document's `processingResults`
   * JSON field. Called after the front-end reconciliation preview runs.
   */
  async saveConciliation(
    caseId: string,
    dto: SaveConciliationDto,
  ): Promise<{ saved: number }> {
    let saved = 0;
    for (const item of dto.items) {
      await this.prisma.document.update({
        where: { id: item.documentId },
        data: {
          processingResults: {
            conciliation: {
              status: item.status,
              method: item.method ?? null,
              reviewStatus: item.reviewStatus ?? 'PENDING',
              reviewedAt: item.reviewStatus === 'REVIEWED' ? new Date().toISOString() : null,
            },
          },
        } as any,
      });
      saved++;
    }
    return { saved };
  }

  // ── Snapshot conversion ─────────────────────────────────────────────

  /**
   * Convert a raw Prisma `IncomeCalculation` row to the typed result.
   * Decimal fields are coerced via `Number()` which yields a plain JS
   * number for the API consumer; null confirmed fields stay null.
   */
  private snapshotToResult(
    snapshot: Record<string, unknown>,
    caseId: string,
  ): IncomeCalculationResult {
    const receiptResults = snapshot.receiptResults as IncomeReceiptResult[];
    const calculatedAt =
      snapshot.calculatedAt instanceof Date
        ? snapshot.calculatedAt.toISOString()
        : String(snapshot.calculatedAt);
    const confirmedAt =
      snapshot.confirmedAt instanceof Date
        ? snapshot.confirmedAt.toISOString()
        : snapshot.confirmedAt !== null && snapshot.confirmedAt !== undefined
          ? String(snapshot.confirmedAt)
          : null;

    return {
      id: snapshot.id as string,
      caseId,
      calculatedAt,
      receiptResults,
      averageGrossIncome: Number(snapshot.averageGrossIncome),
      averageNetIncome: Number(snapshot.averageNetIncome),
      confirmedGrossIncome:
        snapshot.confirmedGrossIncome !== null &&
        snapshot.confirmedGrossIncome !== undefined
          ? Number(snapshot.confirmedGrossIncome)
          : null,
      confirmedNetIncome:
        snapshot.confirmedNetIncome !== null &&
        snapshot.confirmedNetIncome !== undefined
          ? Number(snapshot.confirmedNetIncome)
          : null,
      receiptCount: receiptResults.length,
      includedCount: receiptResults.filter((r) => r.included).length,
      status: snapshot.status as IncomeCalculationStatus,
      confirmedBy: (snapshot.confirmedBy as string | null) ?? null,
      confirmedAt,
      observations: (snapshot.observations as string | null) ?? null,
      source: (snapshot.source as IncomeSource | undefined) ?? 'PAYROLL',
      bases: (snapshot.bases as PfaeIncomeBases | PmIncomeBases | null) ?? null,
    };
  }
}
