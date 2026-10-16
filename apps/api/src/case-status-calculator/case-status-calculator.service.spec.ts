import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { CaseStatusCalculatorService } from './case-status-calculator.service';

describe('CaseStatusCalculatorService', () => {
  let service: CaseStatusCalculatorService;

  const mockPrismaService = {
    mortgageCase: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    caseStatus: {
      findUnique: jest.fn(),
    },
    analysisRun: {
      findFirst: jest.fn(),
    },
  };

  // Status ID map (mimics DB after migration)
  const statusIds: Record<string, number> = {
    PENDING_DOCUMENTS: 1,
    DOCUMENTS_UPLOADED: 2,
    DOCUMENTS_PROCESSED: 3,
    PRELIMINARY_RESULT: 4,
  };

  const caseId = 'case-uuid-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseStatusCalculatorService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<CaseStatusCalculatorService>(CaseStatusCalculatorService);
  });

  describe('recalculate', () => {
    // Helper: set up caseStatus.findUnique mock to return IDs
    function mockStatusIds() {
      mockPrismaService.caseStatus.findUnique.mockImplementation(
        (args: { where: { code: string } }) => {
          const id = statusIds[args.where.code];
          return Promise.resolve(id ? { id, code: args.where.code } : null);
        },
      );
    }

    // Helper: build a mortgage case with documents
    function buildCaseWithDocs(
      docs: Array<{
        documentTypeCode: string;
        documentStatusCode: string;
        owner?: string;
      }>,
      initialStatusId: number = statusIds.PENDING_DOCUMENTS,
      personType: string = 'SALARIED',
    ) {
      return {
        id: caseId,
        personType,
        statusId: initialStatusId,
        documents: docs.map((d, i) => ({
          id: `doc-${i}`,
          documentType: { code: d.documentTypeCode },
          documentStatus: { code: d.documentStatusCode },
          owner: d.owner,
        })),
      };
    }

    // Helper: make analysisRun.findFirst filter-aware (respects executionStatus)
    function mockAnalysisRunFilter(run: { id: string; executionStatus: string } | null) {
      mockPrismaService.analysisRun.findFirst.mockImplementation(
        (args: { where: { executionStatus?: string } }) => {
          if (!run) return Promise.resolve(null);
          if (args.where.executionStatus && run.executionStatus !== args.where.executionStatus) {
            return Promise.resolve(null);
          }
          return Promise.resolve(run);
        },
      );
    }

    // ── Path 1: PENDING_DOCUMENTS ──────────────────────────────────────

    it('should return PENDING_DOCUMENTS when a required document type is missing', async () => {
      // Only 3 of 4 required types present — missing INE
      // Initial status is DOCUMENTS_PROCESSED (different) so the update IS triggered
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
      ], statusIds.DOCUMENTS_PROCESSED);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: caseId },
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should return PENDING_DOCUMENTS when case has zero documents', async () => {
      const mortgageCase = buildCaseWithDocs([], statusIds.DOCUMENTS_UPLOADED);
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    // ── Path 2: DOCUMENTS_UPLOADED ─────────────────────────────────────

    it('should return DOCUMENTS_UPLOADED when all required types exist but one is not PROCESSED', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'UPLOADED' }, // NOT processed
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });

    it('should return DOCUMENTS_UPLOADED when a document has ERROR status', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'ERROR' }, // ERROR
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });

    it('should return DOCUMENTS_UPLOADED when a document has PROCESSING status', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'PROCESSING' },
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });

    // ── Path 3: DOCUMENTS_PROCESSED ────────────────────────────────────

    it('should return DOCUMENTS_PROCESSED when all required docs are PROCESSED and no COMPLETED analysis', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED' },
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null); // No COMPLETED analysis
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    // ── Path 4: PRELIMINARY_RESULT ─────────────────────────────────────

    it('should return PRELIMINARY_RESULT when all docs PROCESSED and a COMPLETED analysis exists', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED' },
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockAnalysisRunFilter({ id: 'run-1', executionStatus: 'COMPLETED', outcome: 'PASS' } as any);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PRELIMINARY_RESULT },
        }),
      );
    });

    // ── Edge cases ─────────────────────────────────────────────────────

    it('should NOT update if the status has not changed', async () => {
      // Case already at PRELIMINARY_RESULT with all docs processed + analysis
      const mortgageCase = {
        id: caseId,
        statusId: statusIds.PRELIMINARY_RESULT, // Already at this status
        documents: [
          { id: 'doc-0', documentType: { code: 'PAYROLL_RECEIPT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-1', documentType: { code: 'BANK_STATEMENT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-2', documentType: { code: 'CREDIT_BUREAU_REPORT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-3', documentType: { code: 'INE' }, documentStatus: { code: 'PROCESSED' } },
        ],
      };

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockAnalysisRunFilter({ id: 'run-1', executionStatus: 'COMPLETED' });
      mockStatusIds();

      await service.recalculate(caseId);

      // Should NOT call update since status hasn't changed
      expect(mockPrismaService.mortgageCase.update).not.toHaveBeenCalled();
    });

    it('should ignore non-required document types when evaluating', async () => {
      // Has an extra non-required doc type + only 3 required types
      const mortgageCase = {
        id: caseId,
        statusId: statusIds.DOCUMENTS_UPLOADED, // Different from PENDING_DOCUMENTS so update IS triggered
        documents: [
          { id: 'doc-0', documentType: { code: 'PAYROLL_RECEIPT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-1', documentType: { code: 'BANK_STATEMENT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-2', documentType: { code: 'CREDIT_BUREAU_REPORT' }, documentStatus: { code: 'PROCESSED' } },
          // Missing INE, but has an extra type
          { id: 'doc-3', documentType: { code: 'SOME_OTHER_TYPE' }, documentStatus: { code: 'PROCESSED' } },
        ],
      };

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      // Still PENDING_DOCUMENTS because INE is missing
      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should handle multiple documents of the same required type (all must be PROCESSED)', async () => {
      const mortgageCase = {
        id: caseId,
        statusId: statusIds.PENDING_DOCUMENTS, // Different from DOCUMENTS_UPLOADED so update IS triggered
        documents: [
          { id: 'doc-0', documentType: { code: 'PAYROLL_RECEIPT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-1', documentType: { code: 'PAYROLL_RECEIPT' }, documentStatus: { code: 'UPLOADED' } }, // 2nd payroll, not processed
          { id: 'doc-2', documentType: { code: 'BANK_STATEMENT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-3', documentType: { code: 'CREDIT_BUREAU_REPORT' }, documentStatus: { code: 'PROCESSED' } },
          { id: 'doc-4', documentType: { code: 'INE' }, documentStatus: { code: 'PROCESSED' } },
        ],
      };

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      // DOCUMENTS_UPLOADED because one PAYROLL_RECEIPT is still UPLOADED
      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });

    it('should treat a PENDING or RUNNING analysis as no completed analysis', async () => {
      const mortgageCase = buildCaseWithDocs([
        { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
        { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED' },
      ]);

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      // Latest run is RUNNING — service filters by COMPLETED, so mock returns null
      mockAnalysisRunFilter({ id: 'run-1', executionStatus: 'RUNNING' });
      mockStatusIds();

      await service.recalculate(caseId);

      // DOCUMENTS_PROCESSED (no COMPLETED run)
      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    // ── PFAE Profile Tests ─────────────────────────────────────────────

    it('should return PENDING_DOCUMENTS for PFAE case when CSF or TAX_RETURN is missing', async () => {
      const mortgageCase = buildCaseWithDocs(
        [
          { documentTypeCode: 'CSF', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED' },
        ],
        statusIds.DOCUMENTS_PROCESSED,
        'PFAE',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should return DOCUMENTS_PROCESSED for PFAE case with all required docs (CSF, TAX_RETURN, BANK_STATEMENT, CREDIT_BUREAU_REPORT, PASSPORT)', async () => {
      const mortgageCase = buildCaseWithDocs(
        [
          { documentTypeCode: 'CSF', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'TAX_RETURN', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED' },
          { documentTypeCode: 'PASSPORT', documentStatusCode: 'PROCESSED' },
        ],
        statusIds.PENDING_DOCUMENTS,
        'PFAE',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    // ── PM Dual Checklist ──────────────────────────────────────────────

    const processedShareholderPacket = [
      { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED', owner: 'SHAREHOLDER' },
      { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED', owner: 'SHAREHOLDER' },
      { documentTypeCode: 'CSF', documentStatusCode: 'PROCESSED', owner: 'SHAREHOLDER' },
    ];

    const processedCompanyPacket = [
      { documentTypeCode: 'CREDIT_BUREAU_REPORT', documentStatusCode: 'PROCESSED', owner: 'COMPANY' },
      { documentTypeCode: 'CSF', documentStatusCode: 'PROCESSED', owner: 'COMPANY' },
      { documentTypeCode: 'BANK_STATEMENT', documentStatusCode: 'PROCESSED', owner: 'COMPANY' },
      { documentTypeCode: 'TAX_RETURN', documentStatusCode: 'PROCESSED', owner: 'COMPANY' },
      { documentTypeCode: 'ARTICLES_OF_INCORPORATION', documentStatusCode: 'PROCESSED', owner: 'COMPANY' },
    ];

    // Extra SALARIED type so fallthrough cannot accidentally match PM PENDING.
    const extraPayroll = [
      { documentTypeCode: 'PAYROLL_RECEIPT', documentStatusCode: 'PROCESSED', owner: 'SHAREHOLDER' },
    ];

    it('should return PENDING_DOCUMENTS for PM when only shareholder docs are present', async () => {
      const mortgageCase = buildCaseWithDocs(
        [...processedShareholderPacket, ...extraPayroll],
        statusIds.DOCUMENTS_PROCESSED,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should return PENDING_DOCUMENTS for PM when company packet is missing ARTICLES_OF_INCORPORATION', async () => {
      const companyWithoutArticles = processedCompanyPacket.filter(
        (d) => d.documentTypeCode !== 'ARTICLES_OF_INCORPORATION',
      );
      const mortgageCase = buildCaseWithDocs(
        [...processedShareholderPacket, ...companyWithoutArticles, ...extraPayroll],
        statusIds.DOCUMENTS_PROCESSED,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should return DOCUMENTS_PROCESSED for PM without personal bank statements or a personal tax return', async () => {
      const mortgageCase = buildCaseWithDocs(
        [...processedShareholderPacket, ...processedCompanyPacket],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    it('should return DOCUMENTS_PROCESSED for PM when both shareholder and company packets are complete', async () => {
      const mortgageCase = buildCaseWithDocs(
        [...processedShareholderPacket, ...processedCompanyPacket],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    it('should return DOCUMENTS_UPLOADED for PM when a required slot exists but is not PROCESSED', async () => {
      const companyWithUnprocessedArticles = processedCompanyPacket.map((d) =>
        d.documentTypeCode === 'ARTICLES_OF_INCORPORATION'
          ? { ...d, documentStatusCode: 'UPLOADED' }
          : d,
      );
      const mortgageCase = buildCaseWithDocs(
        [...processedShareholderPacket, ...companyWithUnprocessedArticles],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });

    it('should return DOCUMENTS_PROCESSED for PM when shareholder identity is PASSPORT instead of INE', async () => {
      const shareholderWithPassport = processedShareholderPacket.map((d) =>
        d.documentTypeCode === 'INE' ? { ...d, documentTypeCode: 'PASSPORT' } : d,
      );
      const mortgageCase = buildCaseWithDocs(
        [...shareholderWithPassport, ...processedCompanyPacket],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    it('should treat a missing Document.owner as SHAREHOLDER for PM slots', async () => {
      const shareholderWithoutOwner = processedShareholderPacket.map((d) => ({
        documentTypeCode: d.documentTypeCode,
        documentStatusCode: d.documentStatusCode,
      }));
      const mortgageCase = buildCaseWithDocs(
        [...shareholderWithoutOwner, ...processedCompanyPacket],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_PROCESSED },
        }),
      );
    });

    it('should not count company docs toward shareholder slots for PM', async () => {
      const mortgageCase = buildCaseWithDocs(
        [
          { documentTypeCode: 'INE', documentStatusCode: 'PROCESSED', owner: 'SHAREHOLDER' },
          ...processedCompanyPacket,
          ...extraPayroll,
        ],
        statusIds.DOCUMENTS_PROCESSED,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.PENDING_DOCUMENTS },
        }),
      );
    });

    it('should return DOCUMENTS_UPLOADED for PM when a shareholder CSF is not PROCESSED', async () => {
      const shareholderWithUnprocessedCsf = processedShareholderPacket.map((d) =>
        d.documentTypeCode === 'CSF' ? { ...d, documentStatusCode: 'UPLOADED' } : d,
      );
      const mortgageCase = buildCaseWithDocs(
        [...shareholderWithUnprocessedCsf, ...processedCompanyPacket],
        statusIds.PENDING_DOCUMENTS,
        'PM',
      );

      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockStatusIds();

      await service.recalculate(caseId);

      expect(mockPrismaService.mortgageCase.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { statusId: statusIds.DOCUMENTS_UPLOADED },
        }),
      );
    });
  });
});
