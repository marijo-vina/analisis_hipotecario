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
  'INE',
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
    const syncResult = this.evaluateSync(mortgageCase.personType, documents);

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
    personType: string,
    documents: Array<{
      documentType: { code: string };
      documentStatus: { code: string };
      owner?: string | null;
    }>,
  ): string {
    if (personType === 'PM') {
      return this.evaluatePm(documents);
    }

    const isPFAE = personType === 'PFAE';

    if (isPFAE) {
      const requiredCodes = ['CSF', 'TAX_RETURN', 'BANK_STATEMENT', 'CREDIT_BUREAU_REPORT'];
      for (const requiredCode of requiredCodes) {
        const hasDoc = documents.some((d) => d.documentType.code === requiredCode);
        if (!hasDoc) return 'PENDING_DOCUMENTS';
      }
      const hasIdentity = documents.some(
        (d) => d.documentType.code === 'INE' || d.documentType.code === 'PASSPORT',
      );
      if (!hasIdentity) return 'PENDING_DOCUMENTS';

      for (const requiredCode of requiredCodes) {
        const typeDocs = documents.filter((d) => d.documentType.code === requiredCode);
        const allProcessed = typeDocs.every((d) => d.documentStatus.code === 'PROCESSED');
        if (!allProcessed) return 'DOCUMENTS_UPLOADED';
      }
      const identityDocs = documents.filter(
        (d) => d.documentType.code === 'INE' || d.documentType.code === 'PASSPORT',
      );
      const allIdentityProcessed = identityDocs.every((d) => d.documentStatus.code === 'PROCESSED');
      if (!allIdentityProcessed) return 'DOCUMENTS_UPLOADED';
    } else {
      for (const requiredCode of REQUIRED_DOCUMENT_TYPE_CODES) {
        const hasDoc = documents.some((d) => d.documentType.code === requiredCode);
        if (!hasDoc) return 'PENDING_DOCUMENTS';
      }

      for (const requiredCode of REQUIRED_DOCUMENT_TYPE_CODES) {
        const typeDocs = documents.filter((d) => d.documentType.code === requiredCode);
        const allProcessed = typeDocs.every((d) => d.documentStatus.code === 'PROCESSED');
        if (!allProcessed) return 'DOCUMENTS_UPLOADED';
      }
    }

    return 'DOCUMENTS_PROCESSED';
  }

  /**
   * PM dual checklist: shareholder and company packets are independent
   * (code + owner). A missing Document.owner counts as SHAREHOLDER.
   */
  private evaluatePm(
    documents: Array<{
      documentType: { code: string };
      documentStatus: { code: string };
      owner?: string | null;
    }>,
  ): string {
    const resolveOwner = (owner?: string | null) => owner ?? 'SHAREHOLDER';
    const slots: Array<{ codes: readonly string[]; owner: 'SHAREHOLDER' | 'COMPANY' }> = [
      { codes: ['INE', 'PASSPORT'], owner: 'SHAREHOLDER' },
      { codes: ['CREDIT_BUREAU_REPORT'], owner: 'SHAREHOLDER' },
      { codes: ['CSF'], owner: 'SHAREHOLDER' },
      { codes: ['BANK_STATEMENT'], owner: 'SHAREHOLDER' },
      { codes: ['TAX_RETURN'], owner: 'SHAREHOLDER' },
      { codes: ['CREDIT_BUREAU_REPORT'], owner: 'COMPANY' },
      { codes: ['CSF'], owner: 'COMPANY' },
      { codes: ['BANK_STATEMENT'], owner: 'COMPANY' },
      { codes: ['TAX_RETURN'], owner: 'COMPANY' },
      { codes: ['ARTICLES_OF_INCORPORATION'], owner: 'COMPANY' },
    ];

    const docsForSlot = (codes: readonly string[], owner: 'SHAREHOLDER' | 'COMPANY') =>
      documents.filter(
        (d) => codes.includes(d.documentType.code) && resolveOwner(d.owner) === owner,
      );

    for (const slot of slots) {
      if (docsForSlot(slot.codes, slot.owner).length === 0) return 'PENDING_DOCUMENTS';
    }

    for (const slot of slots) {
      const allProcessed = docsForSlot(slot.codes, slot.owner).every(
        (d) => d.documentStatus.code === 'PROCESSED',
      );
      if (!allProcessed) return 'DOCUMENTS_UPLOADED';
    }

    return 'DOCUMENTS_PROCESSED';
  }
}
