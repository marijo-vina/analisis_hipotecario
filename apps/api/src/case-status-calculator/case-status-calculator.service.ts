import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Document type codes that are required for a case to advance beyond
 * PENDING_DOCUMENTS. A case must have at least one Document for each
 * of these types before it can move to DOCUMENTS_UPLOADED.
 */
const REQUIRED_DOCUMENT_TYPE_CODES = [
  'PAYROLL_RECEIPT',
  'BANK_STATEMENT',
  'CREDIT_BUREAU_REPORT',
  'CREDIT_SCORE',
  'INE',
  'PROOF_OF_ADDRESS',
] as const;

/**
 * Auto-calculates and persists MortgageCase.statusId based on the
 * current state of documents and analysis runs.
 *
 * Decision tree (executed in order):
 * 1. Missing any required document type → PENDING_DOCUMENTS
 * 2. Any required doc not PROCESSED → DOCUMENTS_UPLOADED
 * 3. No COMPLETED AnalysisRun → DOCUMENTS_PROCESSED
 * 4. Otherwise → PRELIMINARY_RESULT
 */
@Injectable()
export class CaseStatusCalculatorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Recompute and persist MortgageCase.statusId based on current state. */
  async recalculate(caseId: string): Promise<void> {
    // 1. Fetch case with documents (including documentType + documentStatus)
    const mortgageCase = await this.prisma.mortgageCase.findUnique({
      where: { id: caseId },
      include: {
        documents: {
          include: {
            documentType: true,
            documentStatus: true,
          },
        },
      },
    });

    if (!mortgageCase) return;

    const documents = mortgageCase.documents;

    // 2. Walk the decision tree (sync part)
    const syncResult = this.evaluateSync(documents);

    // 3. If still DOCUMENTS_PROCESSED from sync evaluation, check analysis
    let finalStatusCode: string;
    if (syncResult === 'DOCUMENTS_PROCESSED') {
      const completedRun = await this.prisma.analysisRun.findFirst({
        where: {
          mortgageCaseId: caseId,
          executionStatus: 'COMPLETED',
        },
        orderBy: { createdAt: 'desc' },
      });

      finalStatusCode = completedRun ? 'PRELIMINARY_RESULT' : 'DOCUMENTS_PROCESSED';
    } else {
      finalStatusCode = syncResult;
    }

    // 4. Resolve the new statusId
    const newStatus = await this.prisma.caseStatus.findUnique({
      where: { code: finalStatusCode },
    });

    if (!newStatus) return;

    // 5. Only update if changed
    if (mortgageCase.statusId === newStatus.id) return;

    await this.prisma.mortgageCase.update({
      where: { id: caseId },
      data: { statusId: newStatus.id },
    });
  }

  /**
   * Synchronous evaluation of the decision tree (steps 1-2).
   * Returns the status code, or 'DOCUMENTS_PROCESSED' if documents
   * are all processed (caller must still check for analysis runs).
   */
  private evaluateSync(
    documents: Array<{
      documentType: { code: string };
      documentStatus: { code: string };
    }>,
  ): string {
    // Step 1: Check all required document types are present
    for (const requiredCode of REQUIRED_DOCUMENT_TYPE_CODES) {
      const hasDoc = documents.some(
        (d) => d.documentType.code === requiredCode,
      );
      if (!hasDoc) return 'PENDING_DOCUMENTS';
    }

    // Step 2: Check all required-type documents are PROCESSED
    for (const requiredCode of REQUIRED_DOCUMENT_TYPE_CODES) {
      const typeDocs = documents.filter(
        (d) => d.documentType.code === requiredCode,
      );
      const allProcessed = typeDocs.every(
        (d) => d.documentStatus.code === 'PROCESSED',
      );
      if (!allProcessed) return 'DOCUMENTS_UPLOADED';
    }

    // Documents are all processed — caller must check for analysis run
    return 'DOCUMENTS_PROCESSED';
  }
}
