import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  CreditBureauExtractionService,
  CreditBureauExtractionResult,
} from './credit-bureau-extraction.service';
import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import {
  FinancialFieldsConfidence,
  FinancialFieldsConfidenceMap,
  FinancialFieldsSource,
  LayoutCreditField,
  LayoutFinancialResult,
  OcrLayout,
} from './document-ai.types';

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
  ocrLayout?: OcrLayout | null;
}

const makeDocument = (
  overrides: Partial<MockDocument> = {},
): MockDocument => ({
  id: 'doc-buro-1',
  mortgageCaseId: 'case-1',
  documentType: {
    id: 3,
    code: 'CREDIT_BUREAU_REPORT',
    name: 'Buró de crédito',
    isActive: true,
  },
  documentStatus: {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  },
  ocrText:
    'BURÓ DE CRÉDITO\nNombre: MARIA PEREZ LOPEZ\nRFC: PELJ920412AB1\nScore: 685\nBBVA TARJETA CREDITO SALDO 100000 PAGO 2000',
  extractedData: null,
  ...overrides,
});

// ---------------------------------------------------------------------------
// Gemini response builders — baseline = valid extraction
// ---------------------------------------------------------------------------

const createMockExtractionResult = (
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => ({
  schemaVersion: '1.0',
  documentType: 'CREDIT_BUREAU_REPORT',
  extractionMetadata: {
    sourceDocumentId: 'doc-buro-1',
    mortgageCaseId: 'case-1',
    ocrProcessedAt: '2026-06-30T12:00:00Z',
    extractedAt: '2026-06-30T12:01:00Z',
    model: 'gemini-2.5-flash',
    confidence: 0.85,
  },
  documentRequirementContext: {
    incomeBehavior: 'NOT_APPLICABLE',
    requiredPayrollReceiptMonths: null,
    requiredBankStatementMonths: null,
    detectedDocumentMonths: null,
    isRequirementSatisfied: null,
    requirementNotes: null,
  },
  borrower: {
    fullName: 'MARIA PEREZ LOPEZ',
    birthDate: '1992-04-12',
    rfc: 'PELJ920412AB1',
    lastReportedAddress: 'AV REFORMA 100 COL JUAREZ CDMX CP 06600',
  },
  report: {
    consultationDate: '2026-06-01',
    numberOfInquiries: 3,
    publicScore: null,
  },
  credits: [
    {
      institution: 'BBVA',
      accountNumber: '1234567890',
      creditType: 'TARJETA DE CREDITO',
      classification: 'REVOLVING',
      status: 'ACTIVE',
      currentBalance: 100000.0,
      paymentDueAmount: 2000.0,
      lastPaymentAmount: 1000.0,
      creditLimit: 150000.0,
      currency: 'MXN',
      paymentHistory: '111111111111',
      mopCodes: ['1'],
      hasLatePayments: false,
      hasSeriousDelinquency: false,
      hasWriteOff: false,
      hasFraudFlag: false,
      hasIdentityTheft: false,
      isClosed: false,
      monthlyDebtContribution: 2000.0,
      rawTextReference: 'BBVA TARJETA CREDITO SALDO 100000 PAGO 2000',
    },
  ],
  riskSummary: {
    hasWriteOff: false,
    hasFraudFlag: false,
    hasMinorDelinquency: false,
    hasSeriousDelinquency: false,
    hasPreventiveKeys: false,
    possibleHomonym: null,
    riskNotes: null,
  },
  missingFields: [],
  alerts: [],
  ...overrides,
});

const validGeminiSuccess = (extractedData: Record<string, unknown>) => ({
  success: true,
  documentType: 'CREDIT_BUREAU_REPORT',
  extractedData,
});

const geminiFailure = (code = GeminiErrorCode.GEMINI_TIMEOUT) => ({
  success: false,
  documentType: 'CREDIT_BUREAU_REPORT',
  extractedData: null,
  error: {
    code,
    message: 'Gemini temporarily unavailable.',
  },
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CreditBureauExtractionService', () => {
  let service: CreditBureauExtractionService;
  let mockPrisma: {
    document: { findUnique: jest.Mock; update: jest.Mock };
    documentStatus: { findUnique: jest.Mock };
  };
  let mockGemini: { extractStructuredData: jest.Mock };
  let mockConfig: { get: jest.Mock };
  let mockLayoutExtractor: { extract: jest.Mock };

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
              PROCESSED: {
                id: 4,
                code: 'PROCESSED',
                name: 'Procesado',
                order: 4,
              },
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

    // USE_LAYOUT_EXTRACTION defaults to false so existing tests behave
    // exactly as before the layout-aware feature was introduced.
    mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'USE_LAYOUT_EXTRACTION') return 'false';
        return undefined;
      }),
    };

    mockLayoutExtractor = { extract: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditBureauExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
        { provide: ConfigService, useValue: mockConfig },
        {
          provide: LayoutFinancialExtractorService,
          useValue: mockLayoutExtractor,
        },
      ],
    }).compile();

    service = module.get<CreditBureauExtractionService>(
      CreditBureauExtractionService,
    );
  });

  describe('static isCreditBureauDocument', () => {
    it('returns true for CREDIT_BUREAU_REPORT', () => {
      expect(
        CreditBureauExtractionService.isCreditBureauDocument(
          'CREDIT_BUREAU_REPORT',
        ),
      ).toBe(true);
    });

    it('returns false for other document types', () => {
      expect(
        CreditBureauExtractionService.isCreditBureauDocument('INE'),
      ).toBe(false);
      expect(
        CreditBureauExtractionService.isCreditBureauDocument('BANK_STATEMENT'),
      ).toBe(false);
    });
  });

  // ── Status gates ──────────────────────────────────────────────────────

  describe('extract — status gates', () => {
    it('rejects UPLOADED status', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 1,
            code: 'UPLOADED',
            name: 'Cargado',
            order: 1,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_NOT_PROCESSED');
    });

    it('rejects PROCESSING status', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 3,
            code: 'PROCESSING',
            name: 'En procesamiento',
            order: 3,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(false);
    });

    it('allows PROCESSED status', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(true);
    });

    it('allows EXTRACTION_ERROR retry', async () => {
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

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(true);
    });

    it('rejects wrong document type', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentType: {
            id: 1,
            code: 'INE',
            name: 'INE',
            isActive: true,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_TYPE_MISMATCH');
    });

    it('rejects empty OCR text', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: '' }),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(GeminiErrorCode.OCR_TEXT_EMPTY);
    });
  });

  // ── Happy path ────────────────────────────────────────────────────────

  describe('extract — happy path', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('returns success with extracted data', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(true);
      expect(result.extractedData).toBeTruthy();
    });

    it('persists extractedData and sets PROCESSED status', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      await service.extract('case-1', 'doc-buro-1');
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-buro-1' },
        data: {
          extractedData: expect.any(Object),
          documentStatusId: 4, // PROCESSED
        },
      });
    });

    it('returns borrower info in extracted data', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const borrower = ed.borrower as Record<string, unknown>;
      expect(borrower.fullName).toBe('MARIA PEREZ LOPEZ');
      expect(borrower.rfc).toBe('PELJ920412AB1');
    });

    it('normalizes currency to MXN by default', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                amountToPay: 500,
                creditLimit: 10000,
                currency: '',
                paymentHistory: '111',
                mopCodes: ['1'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].currency).toBe('MXN');
    });
  });

  // ── Gemini failure ────────────────────────────────────────────────────

  describe('extract — Gemini failure', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('returns error on Gemini failure', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(geminiFailure());

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(false);
      expect(result.extractedData).toBeNull();
    });

    it('sets EXTRACTION_ERROR status on Gemini failure', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(geminiFailure());

      await service.extract('case-1', 'doc-buro-1');
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-buro-1' },
        data: { documentStatusId: 7 }, // EXTRACTION_ERROR
      });
    });
  });

  // ── Score isolation (ISO / SCO) ────────────────────────────────────────

  describe('extract — score isolation (ISO/SCO)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('forces publicScore to null even if Gemini returns a score', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            report: {
              consultationDate: '2026-06-01',
              numberOfInquiries: 1,
              publicScore: 685,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const report = ed.report as Record<string, unknown>;
      expect(report.publicScore).toBeNull();
    });

    it('does NOT generate any score alerts from bureau extraction', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            report: {
              consultationDate: '2026-06-01',
              numberOfInquiries: 1,
              publicScore: 450,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const scoreAlerts = result.alerts.filter((a) =>
        a.code.startsWith('BURO_SCORE'),
      );
      expect(scoreAlerts.length).toBe(0);
    });

    it('does NOT include report.publicScore in missingFields', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            report: {
              consultationDate: '2026-06-01',
              numberOfInquiries: 1,
              publicScore: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.missingFields).not.toContain('report.publicScore');
    });
  });

  // ── Risk alerts ───────────────────────────────────────────────────────

  describe('extract — risk alerts', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('generates BURO_SERIOUS_DELINQUENCY for MOP >= 4', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                amountToPay: 500,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '444',
                mopCodes: ['4'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                rawTextReference: null,
              },
            ],
            riskSummary: {
              hasWriteOff: false,
              hasFraudFlag: false,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: true,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_SERIOUS_DELINQUENCY'),
      ).toBe(true);
    });

    it('generates BURO_WRITE_OFF for MOP 8', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'SANTANDER',
                creditType: 'PERSONAL',
                classification: 'FIXED_PAYMENT',
                status: 'CLOSED',
                currentBalance: 0,
                amountToPay: 0,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '888',
                mopCodes: ['8'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                rawTextReference: null,
              },
            ],
            riskSummary: {
              hasWriteOff: true,
              hasFraudFlag: false,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: false,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_WRITE_OFF'),
      ).toBe(true);
    });

    it('generates BURO_FRAUD_FLAG for MOP 9', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'AMEX',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'CLOSED',
                currentBalance: 0,
                amountToPay: 0,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '999',
                mopCodes: ['9'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                rawTextReference: null,
              },
            ],
            riskSummary: {
              hasWriteOff: false,
              hasFraudFlag: true,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: false,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_FRAUD_FLAG'),
      ).toBe(true);
    });

    it('generates BURO_NO_CREDITS when credits[] is empty', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [],
            riskSummary: {
              hasWriteOff: false,
              hasFraudFlag: false,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: false,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_NO_CREDITS'),
      ).toBe(true);
    });
  });

  // ── MOP normalization ─────────────────────────────────────────────────

  describe('extract — MOP normalization', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('computes hasLatePayments from MOP codes', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                amountToPay: 500,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '112',
                mopCodes: ['1', '2'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasLatePayments).toBe(true);
      expect(credits[0].hasSeriousDelinquency).toBe(false);
    });

    it('does NOT override existing flags', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                amountToPay: 500,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: false, // Gemini ya lo puso
                hasSeriousDelinquency: false, // Gemini ya lo puso
                hasWriteOff: false,
                hasFraudFlag: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasLatePayments).toBe(false); // preserved
    });
  });

  // ── Missing fields ────────────────────────────────────────────────────

  describe('extract — missing fields', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('detects missing borrower fields', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            borrower: {
              fullName: '',
              birthDate: null,
              rfc: '',
              lastReportedAddress: null,
            },
            report: {
              consultationDate: null,
              numberOfInquiries: null,
              publicScore: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.missingFields).toContain('borrower.fullName');
      expect(result.missingFields).toContain('borrower.rfc');
      expect(result.missingFields).toContain('report.consultationDate');
      // publicScore is NOT a missing field (score is optional, from CREDIT_SCORE doc)
      expect(result.missingFields).not.toContain('report.publicScore');
    });
  });

  // ── Dedup ─────────────────────────────────────────────────────────────

  describe('extract — alert dedup', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('computes alerts deterministically (no Gemini alerts — alerts are 100% backend-computed)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '444',
                mopCodes: ['4'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: null,
              },
            ],
            // Let the backend normalizer compute riskSummary from credit flags
            riskSummary: {
              hasWriteOff: null,
              hasFraudFlag: null,
              hasMinorDelinquency: null,
              hasSeriousDelinquency: null,
              hasPreventiveKeys: null,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      // MOP 4 triggers hasSeriousDelinquency → BURO_SERIOUS_DELINQUENCY (CRITICAL)
      expect(result.alerts.some((a) => a.code === 'BURO_SERIOUS_DELINQUENCY')).toBe(true);
      // Score alerts are NEVER generated by the backend for bureau reports
      expect(result.alerts.some((a) => a.code === 'BURO_SCORE_CRITICAL')).toBe(false);
    });
  });

  // ── MOP thresholds (MOP) ───────────────────────────────────────────────

  describe('extract — MOP thresholds (MOP-001/002/003/004/005)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    function creditWithMop(mopCodes: string[], rawText = '') {
      return [
        {
          institution: 'BBVA',
          creditType: 'TARJETA',
          classification: 'REVOLVING',
          status: 'ACTIVE',
          currentBalance: 5000,
          paymentDueAmount: 500,
          lastPaymentAmount: null,
          creditLimit: 10000,
          currency: 'MXN',
          paymentHistory: mopCodes.join(''),
          mopCodes,
          hasLatePayments: null,
          hasSeriousDelinquency: null,
          hasWriteOff: null,
          hasFraudFlag: null,
          hasIdentityTheft: null,
          rawTextReference: rawText,
        },
      ];
    }

    it('MOP 1 does NOT trigger hasLatePayments', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['0', '1', '0', '1']),
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasLatePayments).toBe(false);
      expect(credits[0].hasSeriousDelinquency).toBe(false);
    });

    it('MOP 2 triggers hasLatePayments but not serious', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['0', '2', '0', '1']),
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasLatePayments).toBe(true);
      expect(credits[0].hasSeriousDelinquency).toBe(false);
    });

    it('MOP 4 triggers hasSeriousDelinquency', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['0', '4', '0', '1']),
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasSeriousDelinquency).toBe(true);
    });

    it('MOP "U" and "-" are neutral (no flags)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['0', 'U', '0', '-']),
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasLatePayments).toBe(false);
      expect(credits[0].hasSeriousDelinquency).toBe(false);
      const delinqAlerts = result.alerts.filter((a) =>
        a.code.startsWith('BURO_') &&
        (a.code.includes('DELINQUENCY') || a.code.includes('WRITE_OFF')),
      );
      expect(delinqAlerts.length).toBe(0);
    });

    it('MOP 9 sets hasSeriousDelinquency but NOT hasFraudFlag (fraud only via FD key)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['9']),
            riskSummary: {
              hasWriteOff: false,
              hasFraudFlag: false,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: true,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasSeriousDelinquency).toBe(true);
      expect(credits[0].hasFraudFlag).toBe(false);
      expect(credits[0].hasWriteOff).toBe(false);
    });

    it('MOP 8 sets hasSeriousDelinquency but NOT hasWriteOff (writeOff only via UP key)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: creditWithMop(['8']),
            riskSummary: {
              hasWriteOff: false,
              hasFraudFlag: false,
              hasMinorDelinquency: false,
              hasSeriousDelinquency: true,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasSeriousDelinquency).toBe(true);
      expect(credits[0].hasWriteOff).toBe(false);
    });
  });

  // ── Balance alert (BAL) ─────────────────────────────────────────────────

  describe('extract — balance alert (BAL-001/002/003)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('null balance triggers BURO_MISSING_BALANCE', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: null,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_MISSING_BALANCE'),
      ).toBe(true);
    });

    it('zero balance does NOT trigger BURO_MISSING_BALANCE', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 0,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_MISSING_BALANCE'),
      ).toBe(false);
    });

    it('write-off credit (UP key) is excluded from balance alert', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'SANTANDER',
                creditType: 'PERSONAL',
                classification: 'FIXED_PAYMENT',
                status: 'ACTIVE',
                currentBalance: null,
                paymentDueAmount: null,
                lastPaymentAmount: null,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: 'CLAVE UP',
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(
        result.alerts.some((a) => a.code === 'BURO_MISSING_BALANCE'),
      ).toBe(false);
    });
  });

  // ── Payment split (PAY) ─────────────────────────────────────────────────

  describe('extract — payment split (PAY-001/002/003/004)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('extracts both paymentDueAmount and lastPaymentAmount', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 5200,
                lastPaymentAmount: 3100,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '111',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].paymentDueAmount).toBe(5200);
      expect(credits[0].lastPaymentAmount).toBe(3100);
    });

    it('null fallbacks preserved when fields absent', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '111',
                mopCodes: ['0'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].paymentDueAmount).toBeNull();
      expect(credits[0].lastPaymentAmount).toBeNull();
    });
  });

  // ── Closed credits (CLS) ────────────────────────────────────────────────

  describe('extract — closed credits (CLS-001/002/003/004)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('closed credit has isClosed=true and monthlyDebtContribution=0', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'SANTANDER',
                creditType: 'PERSONAL',
                classification: 'FIXED_PAYMENT',
                status: 'CLOSED',
                currentBalance: 0,
                paymentDueAmount: 5000,
                lastPaymentAmount: 5000,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].isClosed).toBe(true);
      expect(credits[0].monthlyDebtContribution).toBe(0);
    });

    it('active credit has isClosed=false and contribution=paymentDueAmount', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 2500,
                lastPaymentAmount: 1000,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '111',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: false,
                hasFraudFlag: false,
                hasIdentityTheft: false,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].isClosed).toBe(false);
      expect(credits[0].monthlyDebtContribution).toBe(2500);
    });
  });

  // ── Observation keys (OBS) ──────────────────────────────────────────────

  describe('extract — observation keys (OBS-001/002/003/004)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('LC key sets hasSettlementOrDiscount (NOT hasWriteOff — UP is for quebranto)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: 'CLAVE LC',
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasSettlementOrDiscount).toBe(true);
      expect(credits[0].hasWriteOff).toBe(false);
    });

    it('UP key sets hasWriteOff', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: 'CLAVE UP',
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasWriteOff).toBe(true);
    });

    it('FD key sets hasFraudFlag', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: 'CLAVE FD',
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasFraudFlag).toBe(true);
    });

    it('RI key sets hasIdentityTheft but NOT hasFraudFlag', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 5000,
                paymentDueAmount: 500,
                lastPaymentAmount: null,
                creditLimit: 10000,
                currency: 'MXN',
                paymentHistory: '000',
                mopCodes: ['0'],
                hasLatePayments: null,
                hasSeriousDelinquency: null,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: 'CLAVE RI',
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      expect(credits[0].hasIdentityTheft).toBe(true);
      expect(credits[0].hasFraudFlag).toBe(false);
      expect(
        result.alerts.some((a) => a.code === 'BURO_FRAUD_FLAG'),
      ).toBe(false);
    });
  });

  // ── Validation case: BC - JUAN PEREZ ────────────────────────────────

  describe('extract — validation case BC JUAN PEREZ', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('yields 16 credits (8 active, 8 closed), score=null, RFC=PEGJ800101XX1', async () => {
      const activeCredits = Array.from({ length: 8 }, (_, i) => ({
        institution: `INST-A-${i}`,
        creditType: 'TARJETA',
        classification: 'REVOLVING',
        status: 'ACTIVE',
        currentBalance: 1000 * (i + 1),
        paymentDueAmount: 500,
        lastPaymentAmount: 400,
        creditLimit: 10000,
        currency: 'MXN',
        paymentHistory: '000',
        mopCodes: i < 2 ? ['2', '3'] : ['0'],
        hasLatePayments: null,
        hasSeriousDelinquency: null,
        hasWriteOff: null,
        hasFraudFlag: null,
        hasIdentityTheft: null,
        rawTextReference: null,
      }));
      const closedCredits = Array.from({ length: 8 }, (_, i) => ({
        institution: `INST-C-${i}`,
        creditType: 'PERSONAL',
        classification: 'FIXED_PAYMENT',
        status: 'CLOSED',
        currentBalance: 0,
        paymentDueAmount: 0,
        lastPaymentAmount: 0,
        creditLimit: null,
        currency: 'MXN',
        paymentHistory: '000',
        mopCodes: ['0'],
        hasLatePayments: false,
        hasSeriousDelinquency: false,
        hasWriteOff: false,
        hasFraudFlag: false,
        hasIdentityTheft: false,
        rawTextReference: null,
      }));

      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            borrower: {
              fullName: 'JUAN PEREZ',
              birthDate: '1980-01-01',
              rfc: 'PEGJ800101XX1',
              lastReportedAddress: null,
            },
            report: {
              consultationDate: '2025-08-22',
              numberOfInquiries: 2,
              publicScore: null,
            },
            credits: [...activeCredits, ...closedCredits],
            riskSummary: {
              hasWriteOff: null,
              hasFraudFlag: null,
              hasIdentityTheft: null,
              hasMinorDelinquency: null,
              hasSeriousDelinquency: null,
              hasPreventiveKeys: false,
              possibleHomonym: null,
              riskNotes: null,
            },
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];
      const report = ed.report as Record<string, unknown>;
      const borrower = ed.borrower as Record<string, unknown>;

      expect(credits.length).toBe(16);
      expect(credits.filter((c) => c.status === 'ACTIVE').length).toBe(8);
      expect(credits.filter((c) => c.status === 'CLOSED').length).toBe(8);
      expect(report.publicScore).toBeNull();
      expect(borrower.rfc).toBe('PEGJ800101XX1');
      expect(borrower.birthDate).toBe('1980-01-01');
      // no quebranto/fraude
      expect(
        result.alerts.some((a) => a.code === 'BURO_WRITE_OFF'),
      ).toBe(false);
      expect(
        result.alerts.some((a) => a.code === 'BURO_FRAUD_FLAG'),
      ).toBe(false);
      // minor delinquency from MOP 2-3 in first 2 active credits
      expect(
        result.alerts.some((a) => a.code === 'BURO_MINOR_DELINQUENCY'),
      ).toBe(true);
    });
  });

  // =========================================================================
  // Phase 4: mergeLayoutWithGemini() — authority hierarchy + audit fields +
  // USE_LAYOUT_EXTRACTION feature flag.
  //
  // The merge runs inside extract() ONLY when:
  //   • USE_LAYOUT_EXTRACTION env var is set to 'true', AND
  //   • document.ocrLayout is non-null.
  // We exercise it by flipping the ConfigService mock per-test and stubbing
  // LayoutFinancialExtractorService.extract() with a controlled
  // LayoutFinancialResult; we then assert on the persisted extractedData.
  // =========================================================================

  describe('extract — feature flag USE_LAYOUT_EXTRACTION', () => {
    const ocrLayout: OcrLayout = { pages: [] };

    function buildLayoutResult(
      credits: LayoutCreditField[],
      confidence: FinancialFieldsConfidenceMap[],
    ): LayoutFinancialResult {
      return { credits, confidence, warnings: [] };
    }

    function makeConfidence(
      overrides: Partial<FinancialFieldsConfidenceMap> = {},
    ): FinancialFieldsConfidenceMap {
      return {
        currentBalance: FinancialFieldsConfidence.LOW,
        creditLimit: FinancialFieldsConfidence.LOW,
        maxCredit: FinancialFieldsConfidence.LOW,
        lastPaymentAmount: FinancialFieldsConfidence.LOW,
        paymentDueAmount: FinancialFieldsConfidence.LOW,
        pastDueAmount: FinancialFieldsConfidence.LOW,
        ...overrides,
      };
    }

    function buildLayoutCredit(
      overrides: Omit<Partial<LayoutCreditField>, 'fields'> & {
        fields?: Partial<LayoutCreditField['fields']>;
      } = {},
    ): LayoutCreditField {
      const baseFields: LayoutCreditField['fields'] = {
        currentBalance: null,
        creditLimit: null,
        maxCredit: null,
        lastPaymentAmount: null,
        paymentDueAmount: null,
        pastDueAmount: null,
      };
      return {
        accountNumber: overrides.accountNumber ?? '1234567890',
        institution: overrides.institution ?? 'BBVA',
        orderInBlock: overrides.orderInBlock ?? 0,
        subsection: overrides.subsection ?? null,
        fields: {
          currentBalance: null,
          creditLimit: null,
          maxCredit: null,
          lastPaymentAmount: null,
          paymentDueAmount: null,
          pastDueAmount: null,
          ...(overrides.fields ?? {}),
        },
      };
    }

    it('skips layout merge when flag=false (preserves Gemini-only flow)', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'false' : undefined,
      );
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult([], []),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const ed = result.extractedData as Record<string, unknown>;
      const credits = ed.credits as Record<string, unknown>[];

      // flag off → layout extractor never invoked and NO audit fields set
      expect(mockLayoutExtractor.extract).not.toHaveBeenCalled();
      expect(credits[0].financialFieldsSource).toBeUndefined();
    });

    it('skips layout merge when ocrLayout is null even if flag=true', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout: null }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      await service.extract('case-1', 'doc-buro-1');

      expect(mockLayoutExtractor.extract).not.toHaveBeenCalled();
    });

    it('LAYOUT HIGH confidence overrides Gemini value, source=LAYOUT', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: 8775 },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.HIGH })],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].paymentDueAmount).toBe(8775); // LAYOUT won
      expect(credits[0].financialFieldsSource).toBe(
        FinancialFieldsSource.LAYOUT,
      );
      // Gemini value archived as candidate for audit
      expect(credits[0].candidatePaymentDueAmount).toBe(2000);
      const conf = credits[0]
        .financialFieldsConfidence as FinancialFieldsConfidenceMap;
      expect(conf.paymentDueAmount).toBe(FinancialFieldsConfidence.HIGH);
      expect(
        (credits[0].financialFieldsWarnings as string[]).length,
      ).toBe(0);
      // monthlyDebtContribution follows the corrected paymentDueAmount
      expect(credits[0].monthlyDebtContribution).toBe(8775);
    });

    it('LAYOUT MEDIUM confidence overrides Gemini, monthlyDebtContribution uses overridden value', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: 1875 },
            }),
          ],
          [
            makeConfidence({
              paymentDueAmount: FinancialFieldsConfidence.MEDIUM,
            }),
          ],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].paymentDueAmount).toBe(1875); // LAYOUT MEDIUM won
      expect(credits[0].monthlyDebtContribution).toBe(1875);
      expect(credits[0].financialFieldsSource).toBe(
        FinancialFieldsSource.LAYOUT,
      );
      expect(credits[0].candidatePaymentDueAmount).toBe(2000);
      const conf = credits[0]
        .financialFieldsConfidence as FinancialFieldsConfidenceMap;
      expect(conf.paymentDueAmount).toBe(FinancialFieldsConfidence.MEDIUM);
    });

    it('LAYOUT LOW on paymentDueAmount → null + candidatePaymentDueAmount + MANUAL_REVIEW + monthlyDebtContribution null', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: null },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.LOW })],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // CRITICAL: paymentDueAmount MUST NOT fall back to Gemini or lastPayment
      expect(credits[0].paymentDueAmount).toBeNull();
      expect(credits[0].candidatePaymentDueAmount).toBe(2000);
      expect(credits[0].needsManualReview).toBe(true);
      expect(credits[0].financialFieldsSource).toBe(
        FinancialFieldsSource.MANUAL_REVIEW,
      );
      // monthlyDebtContribution MUST be null (do not feed null paymentDue)
      expect(credits[0].monthlyDebtContribution).toBeNull();
      const conf = credits[0]
        .financialFieldsConfidence as FinancialFieldsConfidenceMap;
      expect(conf.paymentDueAmount).toBe(FinancialFieldsConfidence.LOW);
      const warnings = credits[0].financialFieldsWarnings as string[];
      expect(
        warnings.some((w) =>
          w.includes('paymentDueAmount'),
        ),
      ).toBe(true);
    });

    it('does NOT fall back to lastPaymentAmount when paymentDueAmount is LOW', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Gemini returned both payment and lastPayment non-zero with lastPayment
      // equal to a plausible due amount — exactly the misclassification case
      // that motivated layout authority. Layout marks paymentDueAmount LOW.
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: null, lastPaymentAmount: 49800 },
            }),
          ],
          [
            makeConfidence({
              paymentDueAmount: FinancialFieldsConfidence.LOW,
              lastPaymentAmount: FinancialFieldsConfidence.HIGH,
            }),
          ],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 70000,
                paymentDueAmount: 49800, // ← Gemini mistaken value
                lastPaymentAmount: 49800,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '111000',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // paymentDueAmount never equals Gemini's 49800 and never equals
      // lastPaymentAmount either (lastPayment is HIGH authority, so it gets
      // the layout value 49800, but paymentDue stays null)
      expect(credits[0].paymentDueAmount).toBeNull();
      expect(credits[0].lastPaymentAmount).toBe(49800);
      expect(credits[0].candidatePaymentDueAmount).toBe(49800);
      expect(credits[0].monthlyDebtContribution).toBeNull();
    });

    it('no layout match → MANUAL_REVIEW, paymentDueAmount nulled, Gemini value archived as candidate', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Layout returns a credit at a different institution (no match).
      // Two Gemini credits: the first claims the layout slot by orderInBlock
      // (BBVA/1234567890), the second (OTHER/9999) has NO layout match.
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: 8775 },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.HIGH })],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 70000,
                paymentDueAmount: 8475,
                lastPaymentAmount: 1000,
                creditLimit: 150000,
                currency: 'MXN',
                paymentHistory: '111000',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: null,
              },
              {
                institution: 'OTHER_BANK',
                accountNumber: '9999',
                creditType: 'PERSONAL',
                classification: 'FIXED_PAYMENT',
                status: 'ACTIVE',
                currentBalance: 50000,
                paymentDueAmount: 2000,
                lastPaymentAmount: 500,
                creditLimit: null,
                currency: 'MXN',
                paymentHistory: '111000',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // Credit[0] (BBVA) matched layout → layout value 8775 wins
      expect(credits[0].paymentDueAmount).toBe(8775);
      expect(credits[0].financialFieldsSource).toBe(FinancialFieldsSource.LAYOUT);

      // Credit[1] (OTHER_BANK/9999) had NO layout match → MANUAL_REVIEW
      expect(credits[1].paymentDueAmount).toBeNull();
      expect(credits[1].candidatePaymentDueAmount).toBe(2000);
      expect(credits[1].needsManualReview).toBe(true);
      expect(credits[1].financialFieldsSource).toBe(
        FinancialFieldsSource.MANUAL_REVIEW,
      );
      expect(credits[1].monthlyDebtContribution).toBeNull();
    });

    it('fallback match by institution-only warns in financialFieldsWarnings', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Layout credit has NO accountNumber → merge must use institution order
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: null,
              fields: { paymentDueAmount: 8775 },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.HIGH })],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 70000,
                paymentDueAmount: 8475, // Gemini mistake (layout corrects)
                lastPaymentAmount: 1000,
                creditLimit: 150000,
                currency: 'MXN',
                paymentHistory: '111000',
                mopCodes: ['1'],
                hasLatePayments: false,
                hasSeriousDelinquency: false,
                hasWriteOff: null,
                hasFraudFlag: null,
                hasIdentityTheft: null,
                rawTextReference: null,
              },
            ],
          }),
        ),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].paymentDueAmount).toBe(8775);
      expect(credits[0].financialFieldsSource).toBe(
        FinancialFieldsSource.LAYOUT,
      );
      const warnings = credits[0].financialFieldsWarnings as string[];
      expect(
        warnings.some((w) =>
          w.toLowerCase().includes('fallback'),
        ),
      ).toBe(true);
    });

    it('preserves Gemini raw data fields (institution/creditType/status) — layout only overrides financial fields', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Layout "institution" should NOT overwrite Gemini's institution string
      // — only financial fields merge.
      mockLayoutExtractor.extract.mockReturnValue(
        buildLayoutResult(
          [
            buildLayoutCredit({
              institution: 'BBVA',
              accountNumber: '1234567890',
              fields: { paymentDueAmount: 8775 },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.HIGH })],
        ),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].institution).toBe('BBVA'); // Gemini's string kept
      expect(credits[0].paymentDueAmount).toBe(8775); // layout financial overrode
    });
  });
});
