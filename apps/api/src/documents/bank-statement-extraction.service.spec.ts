import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  BankStatementExtractionService,
  BankStatementExtractionResult,
} from './bank-statement-extraction.service';

// ---------------------------------------------------------------------------
// Helpers — mock document builder
// ---------------------------------------------------------------------------

interface MockDocument {
  id: string;
  mortgageCaseId: string;
  documentType: { id: number; code: string; name: string; isActive: boolean };
  documentStatus: { id: number; code: string; name: string; order: number };
  ocrText: string | null;
  extractedData: unknown | null;
}

const makeDocument = (
  overrides: Partial<MockDocument> = {},
): MockDocument => ({
  id: 'doc-bank-1',
  mortgageCaseId: 'case-1',
  documentType: {
    id: 4,
    code: 'BANK_STATEMENT',
    name: 'Estado de cuenta bancario',
    isActive: true,
  },
  documentStatus: {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  },
  ocrText:
    'BANCO: BBVA\nTITULAR: MARIA PEREZ\nCUENTA: 0123456789\nPERIODO: 2026-05-01 A 2026-05-31\nSALDO PROMEDIO: 25000\nSALDO FINAL: 32000\nNOMINA 15/05/2026 15500 MXN',
  extractedData: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Gemini response builders — baseline = fully valid, minimal alerts
// ---------------------------------------------------------------------------

const createMockExtractionResult = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schemaVersion: '1.1',
  documentType: 'BANK_STATEMENT',
  extractionMetadata: {
    sourceDocumentId: 'doc-bank-1',
    mortgageCaseId: 'case-1',
    ocrProcessedAt: '2026-06-29T12:00:00Z',
    extractedAt: '2026-06-29T12:01:00Z',
    model: 'gemini-2.5-flash',
    confidence: 0.9,
  },
  accountHolder: {
    fullName: 'MARIA PEREZ',
    rfc: 'PEMJ900101ABC',
    isJointAccount: false,
  },
  bank: {
    institutionName: 'BBVA',
    accountNumber: '0123456789',
    clabe: '012180012345678901',
  },
  statementPeriod: {
    periodStartDate: '2026-05-01',
    periodEndDate: '2026-05-31',
    cutoffDate: '2026-05-31',
    isClosedMonth: true,
    isCurrentIncompleteMonth: false,
    averageBalance: 25000,
    endingBalance: 32000,
  },
  payrollDeposits: [
    {
      date: '2026-05-15',
      amount: 15500,
      currency: 'MXN',
      originalConcept: 'NOMINA MAYO',
      detectedEmployerOrPayerName: 'EMPRESA SA',
      detectedPayerRfc: 'ESA123456XYZ',
      isPayrollConcept: true,
      containsPayrollKeyword: true,
      possiblePayrollProvider: false,
      matchCandidateForPayrollReceipt: {
        expectedPayrollReceiptId: null,
        amountMatchesPayrollNetIncome: null,
        dateMatchesPayrollPaymentDate: null,
        conceptMatchesEmployer: null,
        matchConfidence: null,
      },
    },
  ],
  possiblePayrollProviders: [],
  otherRelevantMovements: [],
  documentRequirementContext: {
    incomeBehavior: 'FIXED',
    requiredPayrollReceiptMonths: 3,
    requiredBankStatementMonths: 3,
    detectedDocumentMonths: 3,
    isRequirementSatisfied: true,
    requirementNotes: null,
  },
  bankarizationValidationPreparation: {
    purpose: 'MATCH_PAYROLL_NET_INCOME_WITH_BANK_DEPOSIT',
    requiresPayrollReceiptComparison: true,
    notes: 'Conciliar depósitos detectados con recibos de nómina.',
  },
  missingFields: [],
  alerts: [],
  ...overrides,
});

const validGeminiSuccess = (extractedData: Record<string, unknown>) => ({
  success: true,
  documentType: 'BANK_STATEMENT',
  extractedData,
});

const geminiFailure = (code = GeminiErrorCode.GEMINI_TIMEOUT) => ({
  success: false,
  documentType: 'BANK_STATEMENT',
  extractedData: null,
  error: {
    code,
    message: 'Gemini temporarily unavailable.',
  },
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('BankStatementExtractionService', () => {
  let service: BankStatementExtractionService;
  let mockPrisma: {
    document: { findUnique: jest.Mock; update: jest.Mock };
    documentStatus: { findUnique: jest.Mock };
  };
  let mockGemini: { extractStructuredData: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      document: { findUnique: jest.fn(), update: jest.fn() },
      documentStatus: {
        findUnique: jest.fn().mockImplementation(
          (args: { where: { code: string } }) => {
            const statuses: Record<
              string,
              { id: number; code: string; name: string; order: number }
            > = {
              PROCESSED: { id: 4, code: 'PROCESSED', name: 'Procesado', order: 4 },
              EXTRACTION_ERROR: {
                id: 7,
                code: 'EXTRACTION_ERROR',
                name: 'Error de extracción',
                order: 7,
              },
            };
            return Promise.resolve(statuses[args.where.code] ?? null);
          },
        ),
      },
    };
    mockGemini = { extractStructuredData: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BankStatementExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
      ],
    }).compile();

    service = module.get<BankStatementExtractionService>(
      BankStatementExtractionService,
    );
    mockPrisma.document.update.mockResolvedValue({});
  });

  // ── isBankStatementDocument guard ────────────────────────────────────
  describe('isBankStatementDocument', () => {
    it('returns true for BANK_STATEMENT', () => {
      expect(
        BankStatementExtractionService.isBankStatementDocument(
          'BANK_STATEMENT',
        ),
      ).toBe(true);
    });

    it('returns false for PAYROLL_RECEIPT', () => {
      expect(
        BankStatementExtractionService.isBankStatementDocument(
          'PAYROLL_RECEIPT',
        ),
      ).toBe(false);
    });

    it('returns false for INE', () => {
      expect(
        BankStatementExtractionService.isBankStatementDocument('INE'),
      ).toBe(false);
    });
  });

  // ── 5.1 Status / gate tests ──────────────────────────────────────────
  describe('extract — status gates', () => {
    it('throws when document is not found', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(null);
      await expect(
        service.extract('case-1', 'doc-bank-1'),
      ).rejects.toThrow('Document not found');
    });

    it('throws when mortgageCaseId does not match', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ mortgageCaseId: 'other-case' }),
      );
      await expect(
        service.extract('case-1', 'doc-bank-1'),
      ).rejects.toThrow('Document not found');
    });

    it('returns DOCUMENT_NOT_PROCESSED when status is UPLOADED', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 2,
            code: 'UPLOADED',
            name: 'Subido',
            order: 2,
          },
        }),
      );
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_NOT_PROCESSED');
    });

    it('returns DOCUMENT_TYPE_MISMATCH when type is not BANK_STATEMENT', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentType: {
            id: 3,
            code: 'PAYROLL_RECEIPT',
            name: 'Recibo de nómina',
            isActive: true,
          },
        }),
      );
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_TYPE_MISMATCH');
    });

    it('returns OCR_TEXT_EMPTY when ocrText is empty', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: '' }),
      );
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_TEXT_EMPTY');
    });

    it('returns OCR_TEXT_EMPTY when ocrText is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: null }),
      );
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('OCR_TEXT_EMPTY');
    });

    it('throws when PROCESSED status lookup returns null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.documentStatus.findUnique.mockResolvedValue(null);

      await expect(
        service.extract('case-1', 'doc-bank-1'),
      ).rejects.toThrow('Required document status codes not found in database');
    });
  });

  // ── 5.1 Happy path / Gemini integration ──────────────────────────────
  describe('extract — happy path', () => {
    const setupHappy = (data: Record<string, unknown>) => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );
    };

    it('returns success when status is PROCESSED', async () => {
      setupHappy(createMockExtractionResult());
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(true);
      expect(result.documentId).toBe('doc-bank-1');
    });

    it('proceeds normally when status is EXTRACTION_ERROR (retry)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 7,
            code: 'EXTRACTION_ERROR',
            name: 'Error de extracción',
            order: 7,
          },
        }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(true);
    });

    it('calls Gemini with OCR text and BANK_STATEMENT type', async () => {
      setupHappy(createMockExtractionResult());
      await service.extract('case-1', 'doc-bank-1');
      expect(mockGemini.extractStructuredData).toHaveBeenCalledWith(
        expect.stringContaining('BANCO: BBVA'),
        'BANK_STATEMENT',
        expect.any(Object),
        expect.any(String),
      );
    });

    it('returns extractedData with accountHolder info', async () => {
      setupHappy(createMockExtractionResult());
      const result = await service.extract('case-1', 'doc-bank-1');
      const ed = result.extractedData as Record<string, unknown>;
      const accountHolder = ed.accountHolder as Record<string, unknown>;
      expect(accountHolder.fullName).toBe('MARIA PEREZ');
    });

    it('persists extractedData and sets status to PROCESSED (id=4)', async () => {
      setupHappy(createMockExtractionResult());
      await service.extract('case-1', 'doc-bank-1');
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-bank-1' },
        data: expect.objectContaining({
          extractedData: expect.any(Object),
          documentStatusId: 4,
        }),
      });
    });
  });

  // ── 5.1 Gemini failure → EXTRACTION_ERROR ────────────────────────────
  describe('extract — Gemini failure', () => {
    it('sets EXTRACTION_ERROR status and returns error envelope', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(geminiFailure());

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('GEMINI_TIMEOUT');
      expect(result.extractedData).toBeNull();
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-bank-1' },
        data: { documentStatusId: 7 },
      });
    });

    it('propagates Gemini TEMPORARILY_UNAVAILABLE code', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_TEMPORARILY_UNAVAILABLE),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.error?.code).toBe('GEMINI_TEMPORARILY_UNAVAILABLE');
    });

    it('returns UNKNOWN envelope code when Gemini has no error object', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'BANK_STATEMENT',
        extractedData: null,
      });

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.error?.code).toBe('UNKNOWN');
    });
  });

  // ── DB persistence failure ───────────────────────────────────────────
  describe('extract — DB persistence failure', () => {
    it('throws error when final DB update fails', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );
      mockPrisma.document.update.mockRejectedValue(
        new Error('DB connection lost'),
      );

      await expect(
        service.extract('case-1', 'doc-bank-1'),
      ).rejects.toThrow('DB connection lost');
    });
  });

  // ── 5.2 Alert computation tests ───────────────────────────────────────
  describe('extract — alert: BANK_NO_PAYROLL_DEPOSITS', () => {
    it('fires when payrollDeposits[] is empty', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({ payrollDeposits: [] }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NO_PAYROLL_DEPOSITS' }),
        ]),
      );
    });

    it('does NOT fire when payrollDeposits has at least one entry', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NO_PAYROLL_DEPOSITS'),
      ).toHaveLength(0);
    });
  });

  // CUR-001..003: Currency Enum and Validation
  describe('extract — currency enum (spec CUR scenarios)', () => {
    it('MXN: no non-MXN currency alert (CUR-001)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NON_MXN_CURRENCY'),
      ).toHaveLength(0);
    });

    it('USD: BANK_NON_MXN_CURRENCY alert (CUR-002)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      const data = createMockExtractionResult({
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 800,
            currency: 'USD',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(true);
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NON_MXN_CURRENCY' }),
        ]),
      );
    });

    it('Unknown currency normalizes to OTHER + BANK_NON_MXN_CURRENCY (CUR-003)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      const data = createMockExtractionResult({
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 800,
            currency: 'EUROS',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      const ed = result.extractedData as Record<string, unknown>;
      const deposits = ed.payrollDeposits as { currency: string }[];
      expect(deposits[0].currency).toBe('OTHER');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NON_MXN_CURRENCY' }),
        ]),
      );
    });

    it('empty/null currency defaults to MXN, no alert (CUR-002 default)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      const data = createMockExtractionResult({
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 15500,
            currency: '',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      const ed = result.extractedData as Record<string, unknown>;
      const deposits = ed.payrollDeposits as { currency: string }[];
      expect(deposits[0].currency).toBe('MXN');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NON_MXN_CURRENCY'),
      ).toHaveLength(0);
    });

    it('non-MXN currency does NOT block extraction (CUR-004)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            payrollDeposits: [
              {
                date: '2026-05-15',
                amount: 800,
                currency: 'USD',
                originalConcept: 'NOMINA',
                detectedEmployerOrPayerName: 'EMPRESA SA',
                detectedPayerRfc: 'ESA123456XYZ',
                isPayrollConcept: true,
                containsPayrollKeyword: true,
                possiblePayrollProvider: false,
                matchCandidateForPayrollReceipt: {
                  expectedPayrollReceiptId: null,
                  amountMatchesPayrollNetIncome: null,
                  dateMatchesPayrollPaymentDate: null,
                  conceptMatchesEmployer: null,
                  matchConfidence: null,
                },
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(true);
    });
  });

  describe('extract — alert: BANK_NEGATIVE_BALANCE (spec BAL scenarios)', () => {
    it('fires when endingBalance < 0 (overdraft)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '2026-05-01',
              periodEndDate: '2026-05-31',
              cutoffDate: '2026-05-31',
              isClosedMonth: true,
              isCurrentIncompleteMonth: false,
              averageBalance: 25000,
              endingBalance: -1200,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NEGATIVE_BALANCE' }),
        ]),
      );
      // Spec BAL-002: balances present and valid kept their value
      const ed = result.extractedData as Record<string, unknown>;
      const sp = ed.statementPeriod as Record<string, unknown>;
      expect(sp.endingBalance).toBe(-1200);
    });

    it('fires when averageBalance < 0', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '2026-05-01',
              periodEndDate: '2026-05-31',
              cutoffDate: '2026-05-31',
              isClosedMonth: true,
              isCurrentIncompleteMonth: false,
              averageBalance: -500,
              endingBalance: 32000,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NEGATIVE_BALANCE' }),
        ]),
      );
    });

    it('does NOT fire when both balances are positive (BAL-001)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NEGATIVE_BALANCE'),
      ).toHaveLength(0);
    });

    it('null balances do NOT trigger the alert (BAL-003 not-available)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '2026-05-01',
              periodEndDate: '2026-05-31',
              cutoffDate: null,
              isClosedMonth: null,
              isCurrentIncompleteMonth: false,
              averageBalance: null,
              endingBalance: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NEGATIVE_BALANCE'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_JOINT_ACCOUNT (spec JNT scenarios)', () => {
    it('fires when isJointAccount === true', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            accountHolder: { fullName: 'MARIA PEREZ Y JUAN LOPEZ', isJointAccount: true },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_JOINT_ACCOUNT' }),
        ]),
      );
    });

    it('does NOT fire when isJointAccount is false (JNT-001 happy path)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_JOINT_ACCOUNT'),
      ).toHaveLength(0);
    });

    it('does NOT fire when isJointAccount is null (JNT-003 unclear)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            accountHolder: { fullName: 'MARIA PEREZ', isJointAccount: null },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_JOINT_ACCOUNT'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_INCOMPLETE_MONTH', () => {
    it('fires when isCurrentIncompleteMonth === true', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '2026-06-01',
              periodEndDate: '2026-06-15',
              cutoffDate: null,
              isClosedMonth: false,
              isCurrentIncompleteMonth: true,
              averageBalance: 25000,
              endingBalance: 32000,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_INCOMPLETE_MONTH'),
      ).toHaveLength(1);
    });

    it('does NOT fire when isCurrentIncompleteMonth is false', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_INCOMPLETE_MONTH'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_MISSING_PERIOD', () => {
    it('fires when periodEndDate is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '2026-05-01',
              periodEndDate: null,
              cutoffDate: null,
              isClosedMonth: null,
              isCurrentIncompleteMonth: false,
              averageBalance: 25000,
              endingBalance: 32000,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_MISSING_PERIOD' }),
        ]),
      );
    });

    it('fires when periodStartDate is empty string', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: '',
              periodEndDate: '2026-05-31',
              cutoffDate: '2026-05-31',
              isClosedMonth: true,
              isCurrentIncompleteMonth: false,
              averageBalance: 25000,
              endingBalance: 32000,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_MISSING_PERIOD'),
      ).toHaveLength(1);
    });

    it('does NOT fire when both period dates present', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_MISSING_PERIOD'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_TITULAR_MISMATCH', () => {
    it('fires when accountHolder.fullName is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            accountHolder: { fullName: null, isJointAccount: false },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_TITULAR_MISMATCH' }),
        ]),
      );
    });

    it('does NOT fire when fullName is present', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_TITULAR_MISMATCH'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_NO_TITULAR_RFC', () => {
    it('fires when accountHolder.rfc is null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            accountHolder: { fullName: 'MARIA PEREZ', rfc: null, isJointAccount: false },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NO_TITULAR_RFC' }),
        ]),
      );
    });

    it('does NOT fire when rfc is present', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NO_TITULAR_RFC'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_FEWER_MONTHS_THAN_REQUIRED', () => {
    it('fires when detectedDocumentMonths < requiredBankStatementMonths', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            documentRequirementContext: {
              incomeBehavior: 'FIXED',
              requiredPayrollReceiptMonths: 3,
              requiredBankStatementMonths: 3,
              detectedDocumentMonths: 2,
              isRequirementSatisfied: false,
              requirementNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: 'BANK_FEWER_MONTHS_THAN_REQUIRED',
            severity: 'WARNING',
          }),
        ]),
      );
    });

    it('does NOT fire when detectedDocumentMonths === required', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter(
          (a) => a.code === 'BANK_FEWER_MONTHS_THAN_REQUIRED',
        ),
      ).toHaveLength(0);
    });

    it('does NOT fire when detectedDocumentMonths is null (not enough data)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            documentRequirementContext: {
              incomeBehavior: 'FIXED',
              requiredPayrollReceiptMonths: 3,
              requiredBankStatementMonths: 3,
              detectedDocumentMonths: null,
              isRequirementSatisfied: null,
              requirementNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter(
          (a) => a.code === 'BANK_FEWER_MONTHS_THAN_REQUIRED',
        ),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_NO_RFC_DETECTED', () => {
    it('fires when all detectedPayerRfc are null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            payrollDeposits: [
              {
                date: '2026-05-15',
                amount: 15500,
                currency: 'MXN',
                originalConcept: 'NOMINA',
                detectedEmployerOrPayerName: 'EMPRESA SA',
                detectedPayerRfc: null,
                isPayrollConcept: true,
                containsPayrollKeyword: true,
                possiblePayrollProvider: false,
                matchCandidateForPayrollReceipt: {
                  expectedPayrollReceiptId: null,
                  amountMatchesPayrollNetIncome: null,
                  dateMatchesPayrollPaymentDate: null,
                  conceptMatchesEmployer: null,
                  matchConfidence: null,
                },
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_NO_RFC_DETECTED' }),
        ]),
      );
    });

    it('does NOT fire when at least one valid RFC exists', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NO_RFC_DETECTED'),
      ).toHaveLength(0);
    });

    it('does NOT fire when payrollDeposits is empty (covered by BANK_NO_PAYROLL_DEPOSITS)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({ payrollDeposits: [] }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NO_RFC_DETECTED'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert: BANK_PAYROLL_MISMATCH', () => {
    const depositBuilder = (
      overrides: Record<string, unknown>,
    ): Record<string, unknown> => ({
      date: '2026-05-15',
      amount: 15500,
      currency: 'MXN',
      originalConcept: 'NOMINA',
      detectedEmployerOrPayerName: 'EMPRESA SA',
      detectedPayerRfc: 'ESA123456XYZ',
      isPayrollConcept: true,
      containsPayrollKeyword: true,
      possiblePayrollProvider: false,
      matchCandidateForPayrollReceipt: {
        expectedPayrollReceiptId: null,
        amountMatchesPayrollNetIncome: null,
        dateMatchesPayrollPaymentDate: null,
        conceptMatchesEmployer: null,
        matchConfidence: null,
        ...overrides,
      },
    });

    it('fires when amountMatchesPayrollNetIncome === false', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            payrollDeposits: [
              depositBuilder({ amountMatchesPayrollNetIncome: false }),
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_PAYROLL_MISMATCH' }),
        ]),
      );
    });

    it('fires when dateMatchesPayrollPaymentDate === false', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            payrollDeposits: [
              depositBuilder({ dateMatchesPayrollPaymentDate: false }),
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.alerts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: 'BANK_PAYROLL_MISMATCH' }),
        ]),
      );
    });

    it('does NOT fire when match data is null (pending reconciliation)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(
        result.alerts.filter((a) => a.code === 'BANK_PAYROLL_MISMATCH'),
      ).toHaveLength(0);
    });
  });

  describe('extract — alert deduplication', () => {
    it('does not duplicate BANK_NON_MXN_CURRENCY when Gemini already reported it', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      const data = createMockExtractionResult({
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 800,
            currency: 'USD',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
        alerts: [
          {
            code: 'BANK_NON_MXN_CURRENCY',
            severity: 'WARNING',
            category: 'BANK_STATEMENT',
            message: 'Foreign currency detected by Gemini.',
            field: 'payrollDeposits[].currency',
            requiresManualReview: true,
          },
        ],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      const currencyAlerts = result.alerts.filter(
        (a) => a.code === 'BANK_NON_MXN_CURRENCY',
      );
      expect(currencyAlerts).toHaveLength(1);
      expect(currencyAlerts[0]).toEqual(
        expect.objectContaining({
          message: 'Foreign currency detected by Gemini.',
        }),
      );
    });

    it('remaps Gemini non-standard alert code to BANK_ prefix, then dedups', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      const data = createMockExtractionResult({
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 800,
            currency: 'USD',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
        alerts: [
          {
            code: 'NON_MXN_CURRENCY',
            severity: 'WARNING',
            category: 'BANK_STATEMENT',
            message: 'Foreign currency found.',
            field: 'payrollDeposits[].currency',
            requiresManualReview: true,
          },
        ],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(data),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      const currencyAlerts = result.alerts.filter(
        (a) => a.code === 'BANK_NON_MXN_CURRENCY',
      );
      expect(currencyAlerts).toHaveLength(1);
    });
  });

  // ── 5.3 RFC post-validation tests ────────────────────────────────────
  describe('normalizeBankStatement — RFC post-validation (spec RFC scenarios)', () => {
    const setupRfc = (
      payrollDeposits: Record<string, unknown>[],
      possiblePayrollProviders: Record<string, unknown>[] = [],
    ) => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            payrollDeposits,
            possiblePayrollProviders,
          }),
        ),
      );
    };

    const getDeposits = (
      result: BankStatementExtractionResult,
    ): Record<string, unknown>[] => {
      const ed = result.extractedData as Record<string, unknown>;
      return ed.payrollDeposits as Record<string, unknown>[];
    };

    const getProviders = (
      result: BankStatementExtractionResult,
    ): Record<string, unknown>[] => {
      const ed = result.extractedData as Record<string, unknown>;
      return ed.possiblePayrollProviders as Record<string, unknown>[];
    };

    const buildRfcDeposit = (rfc: string | null): Record<string, unknown> => ({
      date: '2026-05-15',
      amount: 15500,
      currency: 'MXN',
      originalConcept: 'NOMINA',
      detectedEmployerOrPayerName: 'EMPRESA SA',
      detectedPayerRfc: rfc,
      isPayrollConcept: true,
      containsPayrollKeyword: true,
      possiblePayrollProvider: false,
      matchCandidateForPayrollReceipt: {
        expectedPayrollReceiptId: null,
        amountMatchesPayrollNetIncome: null,
        dateMatchesPayrollPaymentDate: null,
        conceptMatchesEmployer: null,
        matchConfidence: null,
      },
    });

    it('preserves valid RFC pattern (RFC-001)', async () => {
      setupRfc([buildRfcDeposit('RFC123456ABC')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBe('RFC123456ABC');
    });

    it('valid RFC with Ñ character is preserved (spec regex supports Ñ)', async () => {
      setupRfc([buildRfcDeposit('ÑEA123456ABC')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBe('ÑEA123456ABC');
    });

    it('invalid RFC pattern degrades to null (RFC-003 / false positive)', async () => {
      setupRfc([buildRfcDeposit('INVALIDRFC12')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBeNull();
    });

    it('null RFC stays null (RFC-003)', async () => {
      setupRfc([buildRfcDeposit(null)]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBeNull();
    });

    it('empty string RFC stays null', async () => {
      setupRfc([buildRfcDeposit('')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBeNull();
    });

    it('lowercase RFC is uppercased and preserved when valid', async () => {
      setupRfc([buildRfcDeposit('esa123456xyz')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBe('ESA123456XYZ');
    });

    it('whitespace around RFC is trimmed before validation', async () => {
      setupRfc([buildRfcDeposit('  ESA123456XYZ  ')]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getDeposits(result)[0].detectedPayerRfc).toBe('ESA123456XYZ');
    });

    it('mixed valid and invalid RFCs in same payrollDeposits[]', async () => {
      setupRfc([
        buildRfcDeposit('ESA123456XYZ'),
        buildRfcDeposit('INVALIDRFC12'),
        buildRfcDeposit(null),
      ]);
      const result = await service.extract('case-1', 'doc-bank-1');
      const deposits = getDeposits(result);
      expect(deposits[0].detectedPayerRfc).toBe('ESA123456XYZ');
      expect(deposits[1].detectedPayerRfc).toBeNull();
      expect(deposits[2].detectedPayerRfc).toBeNull();
      // At least one valid RFC → no BANK_NO_RFC_DETECTED
      expect(
        result.alerts.filter((a) => a.code === 'BANK_NO_RFC_DETECTED'),
      ).toHaveLength(0);
    });

    it('valid RFC in possiblePayrollProviders[] is preserved', async () => {
      setupRfc([buildRfcDeposit('ESA123456XYZ')], [
        {
          payerName: 'STAFFING SA',
          depositDate: '2026-05-15',
          amount: 9000,
          originalConcept: 'HONORARIOS',
          detectedPayerRfc: 'STA987654ABC',
          receivingBank: 'BBVA',
          receivingAccount: '0123456789',
          estimatedRecurrence: 'MONTHLY',
          containsPayrollKeyword: false,
        },
      ]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getProviders(result)[0].detectedPayerRfc).toBe('STA987654ABC');
    });

    it('invalid RFC in possiblePayrollProviders[] is nulled', async () => {
      setupRfc([buildRfcDeposit('ESA123456XYZ')], [
        {
          payerName: 'STAFFING SA',
          depositDate: '2026-05-15',
          amount: 9000,
          originalConcept: 'HONORARIOS',
          detectedPayerRfc: 'NOT_A_VALID_RFC_AT_ALL',
          receivingBank: 'BBVA',
          receivingAccount: '0123456789',
          estimatedRecurrence: 'MONTHLY',
          containsPayrollKeyword: false,
        },
      ]);
      const result = await service.extract('case-1', 'doc-bank-1');
      expect(getProviders(result)[0].detectedPayerRfc).toBeNull();
    });
  });

  // ── Missing fields ───────────────────────────────────────────────────
  describe('extract — missing fields', () => {
    it('reports accountHolder.fullName when null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            accountHolder: { fullName: null, isJointAccount: false },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.missingFields).toContain('accountHolder.fullName');
    });

    it('reports bank.institutionName and accountNumber when missing', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            bank: { institutionName: '', accountNumber: null, clabe: null },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.missingFields).toContain('bank.institutionName');
      expect(result.missingFields).toContain('bank.accountNumber');
    });

    it('reports statementPeriod.periodStartDate when missing', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            statementPeriod: {
              periodStartDate: null,
              periodEndDate: '2026-05-31',
              cutoffDate: '2026-05-31',
              isClosedMonth: true,
              isCurrentIncompleteMonth: false,
              averageBalance: 25000,
              endingBalance: 32000,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.missingFields).toContain('statementPeriod.periodStartDate');
    });

    it('reports nothing when all key fields present', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.missingFields).toHaveLength(0);
    });
  });

  // ── Schema backward compatibility (spec BC scenarios) ─────────────────
  describe('extract — schema backward compatibility (spec BC scenarios)', () => {
    it('extraction succeeds even when response omits new fields', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      // Mimics an older consumer: missing bankarizationValidationPreparation,
      // otherRelevantMovements is undefined (older shape)
      const minimalData: Record<string, unknown> = {
        schemaVersion: '1.0',
        documentType: 'BANK_STATEMENT',
        accountHolder: { fullName: 'MARIA PEREZ', isJointAccount: null },
        bank: { institutionName: 'BBVA', accountNumber: '0123', clabe: null },
        statementPeriod: {
          periodStartDate: '2026-05-01',
          periodEndDate: '2026-05-31',
          cutoffDate: null,
          isClosedMonth: null,
          isCurrentIncompleteMonth: false,
          averageBalance: null,
          endingBalance: null,
        },
        payrollDeposits: [
          {
            date: '2026-05-15',
            amount: 15500,
            currency: 'MXN',
            originalConcept: 'NOMINA',
            detectedEmployerOrPayerName: 'EMPRESA SA',
            detectedPayerRfc: 'ESA123456XYZ',
            isPayrollConcept: true,
            containsPayrollKeyword: true,
            possiblePayrollProvider: false,
            matchCandidateForPayrollReceipt: {
              expectedPayrollReceiptId: null,
              amountMatchesPayrollNetIncome: null,
              dateMatchesPayrollPaymentDate: null,
              conceptMatchesEmployer: null,
              matchConfidence: null,
            },
          },
        ],
        missingFields: [],
        alerts: [],
      };
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(minimalData),
      );

      const result = await service.extract('case-1', 'doc-bank-1');
      expect(result.success).toBe(true);
    });
  });
});