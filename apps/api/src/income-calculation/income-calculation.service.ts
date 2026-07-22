import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  IncomeCalculationStatus,
  type IncomeCalculationResult,
  type IncomeReceiptResult,
} from './income-calculation.types';
import type { SaveConciliationDto } from './dto/save-conciliation.dto';

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
   * Build a fresh income-calculation snapshot from PAYROLL_RECEIPT
   * documents on the case. By default every receipt is `included: true`;
   * callers can pass a list of `excludedDocumentIds` to deselect receipts
   * before the initial computation. Throws 404 if no payroll docs exist,
   * 400 if every receipt is excluded.
   */
  async calculate(
    caseId: string,
    excludedDocumentIds: string[] = [],
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
    };
  }
}
