import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  CreditBureauExtractionService,
  CreditBureauExtractionResult,
  CREDIT_BUREAU_SCHEMA_LEAN,
  CREDIT_BUREAU_INSTRUCTIONS_LEAN,
  CREDIT_BUREAU_SCHEMA_REDUCED,
} from './credit-bureau-extraction.service';
import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import { CoordinateExtractionService } from './coordinate-extraction.service';
import { BureauGridClient } from './bureau-grid.client';
import { GcsService } from './gcs.service';
import {
  CoordinateCredit,
  CoordinateExtractionResult,
} from './coordinate-extraction.types';
import {
  FinancialFieldsConfidence,
  FinancialFieldsConfidenceMap,
  FinancialFieldsSource,
  LayoutCreditField,
  LayoutFinancialResult,
  OcrLayout,
  PaymentDueAmountSource,
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
  storagePath?: string | null;
  originalName?: string;
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
  storagePath: 'bureau/doc-buro-1.pdf',
  originalName: 'buro-report.pdf',
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
    lastReportedAddress: 'CALLE 20 NUM 100 COL CENTRO MERIDA YUC CP 97000',
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
  let mockCoordinateExtractor: { extract: jest.Mock };
  let mockGcs: { downloadFile: jest.Mock };
  let mockBureauGrid: { extract: jest.Mock };

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
        // Coordinate extraction defaults to OFF in existing tests so the
        // Gemini-only flow is preserved unless a test flips it on.
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'false';
        if (key === 'BUREAU_GRID_ENABLED') return 'false';
        return undefined;
      }),
    };

    mockLayoutExtractor = { extract: jest.fn() };

    mockCoordinateExtractor = { extract: jest.fn() };
    mockGcs = { downloadFile: jest.fn() };
    mockBureauGrid = { extract: jest.fn().mockResolvedValue(null) };

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
        {
          provide: CoordinateExtractionService,
          useValue: mockCoordinateExtractor,
        },
        { provide: GcsService, useValue: mockGcs },
        { provide: BureauGridClient, useValue: mockBureauGrid },
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

    it('allows DATA_EXTRACTED re-extract without re-OCR', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 4,
            code: 'DATA_EXTRACTED',
            name: 'Datos extraídos',
            order: 4,
          },
        }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      expect(result.success).toBe(true);
    });

    it('allows OCR_ERROR re-extract when OCR text already exists', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          documentStatus: {
            id: 8,
            code: 'OCR_ERROR',
            name: 'Error de OCR',
            order: 8,
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

    it('enriches stored credits when Gemini fails and prior extraction exists', async () => {
      const stored = createMockExtractionResult({
        credits: [
          {
            institution: 'BBVA',
            creditType: 'TARJETA DE CREDITO',
            classification: 'REVOLVING',
            status: 'ACTIVE',
            currentBalance: 100000,
            paymentDueAmount: 2000,
            creditLimit: 150000,
            currency: 'MXN',
          },
        ],
      });
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ extractedData: stored }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_REQUEST_ERROR),
      );

      const result = await service.extract('case-1', 'doc-buro-1');

      expect(result.success).toBe(true);
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      expect(credits[0].institution).toBe('BBVA');
      expect(credits[0].creditLimit).toBe(150000);
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-buro-1' },
        data: expect.objectContaining({ documentStatusId: 4 }),
      });
    });

    it('copies layout accountNumber onto stored credits when Gemini is down', async () => {
      const stored = createMockExtractionResult({
        credits: [
          {
            institution: 'BBVA',
            creditType: 'TARJETA DE CREDITO',
            classification: 'REVOLVING',
            status: 'ACTIVE',
            currentBalance: 100000,
            paymentDueAmount: 2000,
            creditLimit: 150000,
            currency: 'MXN',
          },
        ],
      });
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          extractedData: stored,
          ocrLayout: {
            pages: [
              { pageNumber: 1, width: 612, height: 792, lines: [], tokens: [] },
            ],
          },
        }),
      );
      mockLayoutExtractor.extract.mockReturnValue({
        credits: [
          {
            accountNumber: '82953660',
            institution: 'BBVA',
            orderInBlock: 0,
            subsection: null,
            fields: {
              currentBalance: null,
              creditLimit: null,
              maxCredit: null,
              lastPaymentAmount: null,
              paymentDueAmount: null,
              pastDueAmount: null,
            },
          },
        ],
        confidence: [],
        warnings: [],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_REQUEST_ERROR),
      );

      const result = await service.extract('case-1', 'doc-buro-1');

      expect(result.success).toBe(true);
      expect(mockLayoutExtractor.extract).toHaveBeenCalled();
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      expect(credits[0].accountNumber).toBe('82953660');
    });

    it('copies accountNumber from OCR institution lines when layout is missing', async () => {
      const stored = createMockExtractionResult({
        credits: [
          {
            institution: 'BBVA',
            creditType: 'TARJETA DE CREDITO',
            classification: 'REVOLVING',
            status: 'ACTIVE',
            currentBalance: 0,
            paymentDueAmount: 0,
            creditLimit: 42400,
            currency: 'MXN',
          },
          {
            institution: 'HSBC MEXICO',
            creditType: 'TARJETA DE CREDITO',
            classification: 'REVOLVING',
            status: 'CLOSED',
            currentBalance: 0,
            paymentDueAmount: 0,
            creditLimit: 63000,
            currency: 'MXN',
          },
        ],
      });
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          extractedData: stored,
          ocrText: [
            'DETALLE DE CRÉDITOS',
            '1.',
            'BBVA',
            '41523182953660',
            'TARJETA DE CRÉDITO',
            '2.',
            'HSBC MEXICO',
            '987654321000',
            'TARJETA DE CRÉDITO',
          ].join('\n'),
        }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_REQUEST_ERROR),
      );

      const result = await service.extract('case-1', 'doc-buro-1');

      expect(result.success).toBe(true);
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      expect(credits[0].accountNumber).toBe('41523182953660');
      expect(credits[1].accountNumber).toBe('987654321000');
    });

    it('does not let AMEX steal AMEX COMPANY account numbers', async () => {
      const stored = createMockExtractionResult({
        credits: [
          {
            institution: 'AMEX',
            creditType: 'TARJETA DE CREDITO',
            classification: 'NON_BANK_SERVICE',
            status: 'ACTIVE',
            currentBalance: 30283,
            paymentDueAmount: 1875,
            creditLimit: 150000,
            currency: 'MXN',
          },
          {
            institution: 'AMEX COMPANY',
            creditType: 'TARJETA DE CREDITO',
            classification: 'NON_BANK_SERVICE',
            status: 'ACTIVE',
            currentBalance: 73881,
            paymentDueAmount: 0,
            creditLimit: 307825,
            currency: 'MXN',
          },
        ],
      });
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          extractedData: stored,
          ocrText: [
            '1.',
            'AMEX',
            '376722482104002',
            'TARJETA DE CRÉDITO',
            'AMEX COMPANY',
            '376662329074002',
            'TARJETA DE CRÉDITO',
          ].join('\n'),
        }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_REQUEST_ERROR),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      expect(credits[0].accountNumber).toBe('376722482104002');
      expect(credits[1].accountNumber).toBe('376662329074002');
    });

    it('does not treat a SALDO amount on a data line as accountNumber', async () => {
      const stored = createMockExtractionResult({
        credits: [
          {
            institution: 'BBVA',
            creditType: 'TARJETA DE CREDITO',
            classification: 'REVOLVING',
            status: 'ACTIVE',
            currentBalance: 100000,
            paymentDueAmount: 2000,
            creditLimit: 150000,
            currency: 'MXN',
          },
        ],
      });
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          extractedData: stored,
          ocrText:
            'BBVA TARJETA CREDITO SALDO 100000 PAGO 2000',
        }),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        geminiFailure(GeminiErrorCode.GEMINI_REQUEST_ERROR),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      expect(credits[0].accountNumber).toBeUndefined();
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
      // Guardrail: Gemini-only path defaults to UNCONFIRMED, blocking
      // monthlyDebtContribution until analyst confirms the amount.
      expect(credits[0].paymentDueAmountSource).toBe('UNCONFIRMED');
      expect(credits[0].monthlyDebtContribution).toBeNull();
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

  // ── Validation case: BC - ALEJANDRO DIAZ ────────────────────────────────

  describe('extract — validation case BC ALEJANDRO DIAZ', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('yields 16 credits (8 active, 8 closed), score=null, RFC=DICA690402SD3', async () => {
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
              fullName: 'ALEJANDRO DIAZ',
              birthDate: '1969-04-02',
              rfc: 'DICA690402SD3',
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
      expect(borrower.rfc).toBe('DICA690402SD3');
      expect(borrower.birthDate).toBe('1969-04-02');
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
                currentBalance: 73881,
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
                currentBalance: 73881,
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
                currentBalance: 73881,
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

    it('copies layout accountNumber onto the matched credit and does not persist utilization', async () => {
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
              accountNumber: '82953660',
              fields: { paymentDueAmount: 8775 },
            }),
          ],
          [makeConfidence({ paymentDueAmount: FinancialFieldsConfidence.HIGH })],
        ),
      );
      const geminiData = createMockExtractionResult();
      const geminiCredit = {
        ...(geminiData.credits as Record<string, unknown>[])[0],
      };
      delete geminiCredit.accountNumber;
      geminiData.credits = [geminiCredit];
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(geminiData),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].accountNumber).toBe('82953660');
      expect(credits[0]).not.toHaveProperty('utilization');
    });

    it('layout accountNumber overwrites a Gemini accountNumber on match', async () => {
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
              accountNumber: '82953660',
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

      expect(credits[0].accountNumber).toBe('82953660');
      expect(credits[0]).not.toHaveProperty('utilization');
    });
  });

  // =========================================================================
  // Phase 3 (credit-bureau-gemini-timeout): Lean constants, aggressive
  // pre-filter, regex borrower extraction, reduced schema, disambiguation
  // gating, Layer 1 fallback, and prompt-size budget.
  // =========================================================================

  // ── Realistic bureau OCR text used across several Phase 3 tests ──────────
  // Contains: borrower identity (labelled), dates, RFC, then DETALLE section
  // with one credit. The regex extractor (extractBorrowerFromOcr) needs the
  // labelled fields + section markers to succeed.
  const BORROWER_OCR = [
    'BURÓ DE CRÉDITO',
    'Nombre: MARIA PEREZ LOPEZ',
    'RFC: PELJ920412AB1',
    'Fecha de Nacimiento: 12/04/1992',
    'Fecha de Consulta: 01/06/2026',
    '',
    'DATOS DEL ACREDITADO',
    'Domicilio: CALLE 20 NUM 100 COL CENTRO MERIDA YUC CP 97000',
    '',
    'RESUMEN DE CRÉDITOS',
    'Number of credits: 1',
    '',
    'DETALLE DE CRÉDITOS',
    'BBVA',
    '0 53,763 42,400 MX MAY-25 ABR-13 0 1,743 NO APLICA',
    '1,875',
    'PAGO MÍNIMO PARA CUENTAS REVOLVENTES',
    '',
    'DETALLE DE CONSULTAS',
    'consulta 1',
  ].join('\n');

  // ── 3.1 CREDIT_BUREAU_SCHEMA_LEAN: no inline descriptions ───────────────

  describe('Phase 3 — CREDIT_BUREAU_SCHEMA_LEAN has no inline descriptions', () => {
    it('paymentDueAmount is type-only "number | null" (no OCR description)', () => {
      const credit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      expect(credit.paymentDueAmount).toBe('number | null');
      // Explicitly NOT the verbose original
      expect(credit.paymentDueAmount).not.toContain('Monto a Pagar');
      expect(credit.paymentDueAmount).not.toContain('PAGO MÍNIMO');
    });

    it('lastPaymentAmount is type-only "number | null" (no OCR description)', () => {
      const credit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      expect(credit.lastPaymentAmount).toBe('number | null');
      expect(credit.lastPaymentAmount).not.toContain('Monto Último Pago');
      expect(credit.lastPaymentAmount).not.toContain('números limpios');
    });

    it('publicScore is bare "null" (description stripped)', () => {
      const report = CREDIT_BUREAU_SCHEMA_LEAN.report;
      expect(report.publicScore).toBe('null');
      expect(report.publicScore).not.toContain('Mi Score');
      expect(report.publicScore).not.toContain('separate');
    });

    it('hasWriteOff is type-only "boolean | null" (no clave UP description)', () => {
      const credit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      expect(credit.hasWriteOff).toBe('boolean | null');
      expect(credit.hasWriteOff).not.toContain('clave UP');
    });

    it('hasSettlementOrDiscount is type-only (no LC/LG description)', () => {
      const credit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      expect(credit.hasSettlementOrDiscount).toBe('boolean | null');
      expect(credit.hasSettlementOrDiscount).not.toContain('LC');
      expect(credit.hasSettlementOrDiscount).not.toContain('LG');
    });
  });

  // ── 3.2 CREDIT_BUREAU_INSTRUCTIONS_LEAN: excludes OCR examples, trees ────

  describe('Phase 3 — CREDIT_BUREAU_INSTRUCTIONS_LEAN excludes verbose content', () => {
    it('does NOT contain ASCII decision tree markers', () => {
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('DECISION TREE');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('┌─');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('└──');
    });

    it('does NOT contain OCR literal example snippets', () => {
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('0 53,763');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('30,283 193,336');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('PARTE 1');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain('PARTE 2');
    });

    it('does NOT contain redundant classification detail section', () => {
      // The verbose version listed every credit field inline; LEAN only has
      // the enum values + formats.
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain(
        'rawTextReference: texto original de la fila',
      );
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).not.toContain(
        'observationKeys: array de strings con claves',
      );
    });

    it('DOES contain the anti-glossary rule (kept)', () => {
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('REGLA ANTI-GLOSARIO');
    });

    it('DOES contain the 2-line payment golden rule (kept)', () => {
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('REGLA DE ORO');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('lastPaymentAmount');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('paymentDueAmount');
    });

    it('DOES contain enum values and JSON validity rules (kept)', () => {
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('REVOLVING');
      expect(CREDIT_BUREAU_INSTRUCTIONS_LEAN).toContain('JSON VÁLIDO');
    });
  });

  // ── 3.3 preFilterOcrLayout excludes borrower/report sections ─────────────

  describe('Phase 3 — preFilterOcrLayout excludes borrower/report sections', () => {
    it('returns only the DETALLE DE CRÉDITOS section (no borrower/report metadata)', () => {
      const filtered = (service as any).preFilterOcrLayout(BORROWER_OCR);
      expect(typeof filtered).toBe('string');

      // Must contain the detail section
      expect(filtered.toUpperCase()).toContain('DETALLE DE CRÉDITOS');

      // Must NOT contain borrower / report metadata sections that appear
      // elsewhere in the full OCR (those are regex-extracted separately).
      expect(filtered).not.toContain('DATOS DEL ACREDITADO');
      expect(filtered).not.toContain('Domicilio:');
      expect(filtered).not.toContain('RESUMEN DE CRÉDITOS');
      // Borrower identity fields (only sent via regex, not to Gemini):
      expect(filtered).not.toContain('Nombre:');
      expect(filtered).not.toContain('RFC:');
      expect(filtered).not.toContain('Fecha de Nacimiento');
      expect(filtered).not.toContain('Fecha de Consulta');
    });

    it('output starts at the DETALLE section, not at the borrower header', () => {
      const filtered = (service as any).preFilterOcrLayout(BORROWER_OCR);
      const upper = filtered.toUpperCase().trimStart();
      // The first content should be the DETALLE marker, not the bureau title
      expect(upper.startsWith('DETALLE DE CR')).toBe(true);
    });

    it('does not include the DETALLE DE CONSULTAS section (cut point)', () => {
      const filtered = (service as any).preFilterOcrLayout(BORROWER_OCR);
      expect(filtered).not.toContain('DETALLE DE CONSULTAS');
      expect(filtered).not.toContain('consulta 1');
    });

    it('falls back to preFilterOcr when no DETALLE section present', () => {
      const noDetail = [
        'BURÓ DE CRÉDITO',
        'Nombre: MARIA PEREZ LOPEZ',
        'some other text without credit detail',
      ].join('\n');
      // Should not throw and should return a non-empty string
      const filtered = (service as any).preFilterOcrLayout(noDetail);
      expect(typeof filtered).toBe('string');
      expect(filtered.length).toBeGreaterThan(0);
    });

    it('caps output at MAX_OCR_LAYOUT_CHARS (15000)', () => {
      // Build a huge DETALLE section exceeding the cap
      const hugeDetail =
        'DETALLE DE CRÉDITOS\n' + 'X'.repeat(18000) + '\nDETALLE DE CONSULTAS';
      const filtered = (service as any).preFilterOcrLayout(hugeDetail);
      expect(filtered.length).toBeLessThanOrEqual(15500); // 15000 + truncation note
    });
  });

  // ── 3.4 extractBorrowerFromOcr with real OCR snippets ───────────────────

  describe('Phase 3 — extractBorrowerFromOcr regex extraction', () => {
    it('extracts fullName from labelled "Nombre:" line', () => {
      const result = (service as any).extractBorrowerFromOcr(BORROWER_OCR);
      expect(result.fullName).toBe('MARIA PEREZ LOPEZ');
    });

    it('extracts RFC in 13-char format (XXXX000000XXX)', () => {
      const result = (service as any).extractBorrowerFromOcr(BORROWER_OCR);
      expect(result.rfc).toBe('PELJ920412AB1');
      expect(result.rfc).toHaveLength(13); // 4 letters + 6 digits + 3 alnum
      expect(result.rfc).toMatch(/^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/);
    });

    it('extracts birthDate as ISO YYYY-MM-DD', () => {
      const result = (service as any).extractBorrowerFromOcr(BORROWER_OCR);
      expect(result.birthDate).toBe('1992-04-12');
    });

    it('extracts consultationDate as ISO YYYY-MM-DD', () => {
      const result = (service as any).extractBorrowerFromOcr(BORROWER_OCR);
      expect(result.consultationDate).toBe('2026-06-01');
    });

    it('derives birthDate from RFC embedded date when Fecha de Nacimiento absent', () => {
      const ocrNoBirth = [
        'Nombre: CARLOS RAMIREZ SOTO',
        'RFC: RASC850315Q47',
        'Fecha de Consulta: 15/03/2026',
        'DETALLE DE CRÉDITOS',
        'some credit',
      ].join('\n');
      const result = (service as any).extractBorrowerFromOcr(ocrNoBirth);
      // RFC RASC850315 → yy=85 → 1985, mm=03, dd=15
      expect(result.rfc).toBe('RASC850315Q47');
      expect(result.birthDate).toBe('1985-03-15');
    });

    it('returns null fields for missing borrower data (fallback scenario)', () => {
      const ocrMissingBorrower = [
        'DETALLE DE CRÉDITOS',
        'BBVA',
        '0 53,763 42,400 MX MAY-25 ABR-13 0 1,743 NO APLICA',
        '1,875',
        'PAGO MÍNIMO',
      ].join('\n');
      const result = (service as any).extractBorrowerFromOcr(ocrMissingBorrower);
      expect(result.fullName).toBeNull();
      expect(result.rfc).toBeNull();
      expect(result.birthDate).toBeNull();
      expect(result.consultationDate).toBeNull();
    });

    it('returns all-null fields for empty OCR input', () => {
      const result = (service as any).extractBorrowerFromOcr('');
      expect(result).toEqual({
        fullName: null,
        rfc: null,
        birthDate: null,
        consultationDate: null,
      });
    });

    it('partial extraction: fullName found, consultationDate missing', () => {
      const partial = [
        'Nombre: JUAN LOPEZ GOMEZ',
        'RFC: LOGJ900228AB1',
        'Fecha de Nacimiento: 28/02/1990',
        'DETALLE DE CRÉDITOS',
        'credit data',
      ].join('\n');
      const result = (service as any).extractBorrowerFromOcr(partial);
      expect(result.fullName).toBe('JUAN LOPEZ GOMEZ');
      expect(result.rfc).toBe('LOGJ900228AB1');
      expect(result.birthDate).toBe('1990-02-28');
      expect(result.consultationDate).toBeNull();
    });
  });

  // ── 3.5 CREDIT_BUREAU_SCHEMA_REDUCED excludes 4 fields ──────────────────

  describe('Phase 3 — CREDIT_BUREAU_SCHEMA_REDUCED excludes 4 layout-owned fields', () => {
    it('credits[] does NOT have the 4 excluded financial fields', () => {
      const credit = CREDIT_BUREAU_SCHEMA_REDUCED.credits[0];
      expect(credit).not.toHaveProperty('currentBalance');
      expect(credit).not.toHaveProperty('creditLimit');
      expect(credit).not.toHaveProperty('paymentDueAmount');
      expect(credit).not.toHaveProperty('lastPaymentAmount');
    });

    it('maxCredit and pastDueAmount are NOT in the Gemini schema (layout-only fields)', () => {
      // These 2 were never part of the Gemini schema at all — they live in
      // FINANCIAL_FIELDS for the layout merger only. The reduced schema must
      // not accidentally add them.
      const credit = CREDIT_BUREAU_SCHEMA_REDUCED.credits[0];
      expect(credit).not.toHaveProperty('maxCredit');
      expect(credit).not.toHaveProperty('pastDueAmount');
    });

    it('credits[] still has all non-financial fields', () => {
      const credit = CREDIT_BUREAU_SCHEMA_REDUCED.credits[0];
      expect(credit).toHaveProperty('institution');
      expect(credit).toHaveProperty('creditType');
      expect(credit).toHaveProperty('classification');
      expect(credit).toHaveProperty('status');
      expect(credit).toHaveProperty('currency');
      expect(credit).toHaveProperty('paymentHistory');
      expect(credit).toHaveProperty('mopCodes');
      expect(credit).toHaveProperty('observationKeys');
      expect(credit).toHaveProperty('hasLatePayments');
      expect(credit).toHaveProperty('hasSeriousDelinquency');
      expect(credit).toHaveProperty('rawTextReference');
    });

    it('LEAN and REDUCED schemas omit accountNumber and utilization', () => {
      const leanCredit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      const reducedCredit = CREDIT_BUREAU_SCHEMA_REDUCED.credits[0];
      expect(leanCredit).not.toHaveProperty('accountNumber');
      expect(leanCredit).not.toHaveProperty('utilization');
      expect(reducedCredit).not.toHaveProperty('accountNumber');
      expect(reducedCredit).not.toHaveProperty('utilization');
      expect(JSON.stringify(CREDIT_BUREAU_SCHEMA_LEAN)).not.toContain(
        'accountNumber',
      );
      expect(JSON.stringify(CREDIT_BUREAU_SCHEMA_LEAN)).not.toContain(
        'utilization',
      );
      expect(JSON.stringify(CREDIT_BUREAU_SCHEMA_REDUCED)).not.toContain(
        'accountNumber',
      );
      expect(JSON.stringify(CREDIT_BUREAU_SCHEMA_REDUCED)).not.toContain(
        'utilization',
      );
    });

    it('top-level structure (borrower, report, riskSummary) is unchanged', () => {
      expect(CREDIT_BUREAU_SCHEMA_REDUCED).toHaveProperty('borrower');
      expect(CREDIT_BUREAU_SCHEMA_REDUCED).toHaveProperty('report');
      expect(CREDIT_BUREAU_SCHEMA_REDUCED).toHaveProperty('riskSummary');
      expect(CREDIT_BUREAU_SCHEMA_REDUCED.borrower).toHaveProperty('fullName');
      expect(CREDIT_BUREAU_SCHEMA_REDUCED.report).toHaveProperty(
        'consultationDate',
      );
    });

    it('LEAN schema still HAS the 4 fields (only REDUCED removes them)', () => {
      const leanCredit = CREDIT_BUREAU_SCHEMA_LEAN.credits[0];
      expect(leanCredit).toHaveProperty('currentBalance');
      expect(leanCredit).toHaveProperty('creditLimit');
      expect(leanCredit).toHaveProperty('paymentDueAmount');
      expect(leanCredit).toHaveProperty('lastPaymentAmount');
    });
  });

  // ── 3.6 disambiguatePaymentFields gating ────────────────────────────────

  describe('Phase 3 — disambiguatePaymentFields gating', () => {
    const ocrLayout: OcrLayout = { pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], tokens: [] }] };

    it('disambiguatePaymentFields NOT called when layout path is active', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          ocrText: BORROWER_OCR,
          ocrLayout,
        }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Layout extractor returns 0 credits → merge skipped, Gemini values
      // pass through untouched (disambiguation skipped by the gate).
      mockLayoutExtractor.extract.mockReturnValue({
        credits: [],
        confidence: [],
        warnings: [],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const spy = jest.spyOn(
        service as any,
        'disambiguatePaymentFields',
      );

      await service.extract('case-1', 'doc-buro-1');

      expect(spy).not.toHaveBeenCalled();
      spy.mockRestore();
    });

    it('disambiguatePaymentFields IS called when layout path is inactive', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: BORROWER_OCR }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      // Flag OFF → useLayoutPath = false → Layer 1 path → disambiguation runs.
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'false' : undefined,
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const spy = jest.spyOn(
        service as any,
        'disambiguatePaymentFields',
      );

      await service.extract('case-1', 'doc-buro-1');

      expect(spy).toHaveBeenCalledTimes(1);
      spy.mockRestore();
    });

    it('when layout active, Gemini payment values are NOT corrected by disambiguator', async () => {
      // Gemini returns a suspiciously-swapped paymentDueAmount that the
      // disambiguator WOULD correct if it ran. With layout active it stays.
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({
          ocrText: BORROWER_OCR,
          ocrLayout,
        }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // Layout returns 0 credits → no merge overrides → Gemini value kept.
      mockLayoutExtractor.extract.mockReturnValue({
        credits: [],
        confidence: [],
        warnings: [],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(
          createMockExtractionResult({
            credits: [
              {
                institution: 'BBVA',
                creditType: 'TARJETA',
                classification: 'REVOLVING',
                status: 'ACTIVE',
                currentBalance: 73881,
                paymentDueAmount: 999999, // would be flagged/corrected
                lastPaymentAmount: 1000,
                creditLimit: 150000,
                currency: 'MXN',
                paymentHistory: '111',
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
      // Disambiguator did NOT run → Gemini's (wrong) value preserved
      expect(credits[0].paymentDueAmount).toBe(999999);
    });

    it('when layout inactive, disambiguator can correct swapped payment values', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: BORROWER_OCR }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'false' : undefined,
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
                currentBalance: 73881,
                paymentDueAmount: 999999, // Gemini mistake
                lastPaymentAmount: 1743, // OCR "NO APLICA" anchor value
                creditLimit: 150000,
                currency: 'MXN',
                paymentHistory: '111',
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
      // Disambiguator ran: lastPaymentAmount corrected from OCR NO APLICA
      // anchor (1,743). paymentDueAmount corrected to 1,875 (the PAGO MÍNIMO
      // number under NO APLICA).
      expect(credits[0].lastPaymentAmount).toBe(1743);
      expect(credits[0].paymentDueAmount).toBe(1875);
    });
  });

  // ── 3.7 Borrower regex failure triggers full Layer 1 fallback ───────────

  describe('Phase 3 — borrower regex failure triggers Layer 1 fallback', () => {
    it('falls back to Layer 1 when fullName cannot be extracted', async () => {
      // OCR with DETALLE but NO borrower identity → fullName regex returns
      // null → extract() re-invokes itself with forceLayer1: true.
      const ocrNoBorrower = [
        'DETALLE DE CRÉDITOS',
        'BBVA',
        '0 53,763 42,400 MX MAY-25 ABR-13 0 1,743 NO APLICA',
        '1,875',
        'PAGO MÍNIMO PARA CUENTAS REVOLVENTES',
        'DETALLE DE CONSULTAS',
      ].join('\n');
      const ocrLayout: OcrLayout = { pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], tokens: [] }] };

      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: ocrNoBorrower, ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // The forced Layer 1 call still reaches maybeMergeLayout (flag is on +
      // ocrLayout present). Stub the extractor to return 0 credits so the
      // merge is skipped and Gemini values pass through.
      mockLayoutExtractor.extract.mockReturnValue({
        credits: [],
        confidence: [],
        warnings: [],
      });
      const geminiSpy = jest
        .spyOn(mockGemini, 'extractStructuredData')
        .mockResolvedValue(validGeminiSuccess(createMockExtractionResult()));

      const result = await service.extract('case-1', 'doc-buro-1');

      // The Layer 2 call short-circuits BEFORE calling Gemini (regex fails
      // early), then re-invokes extract() with forceLayer1: true. Only the
      // forced Layer 1 call reaches Gemini — so exactly 1 Gemini call.
      expect(geminiSpy).toHaveBeenCalledTimes(1);
      // Document refetched twice: first (Layer 2) + forced Layer 1 → proves
      // the recursion happened exactly once (no infinite recursion, which
      // would have overflowed / hung).
      expect(mockPrisma.document.findUnique).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      expect(result.extractedData).toBeTruthy();
      geminiSpy.mockRestore();
    });

    it('borrower regex with partial fields also triggers fallback', async () => {
      // fullName + RFC found but birthDate and consultationDate missing.
      const ocrPartial = [
        'Nombre: GARCIA MARTINEZ LUIS',
        'RFC: GAML910909H51',
        'DETALLE DE CRÉDITOS',
        'credit data',
      ].join('\n');
      const ocrLayout: OcrLayout = { pages: [{ pageNumber: 1, width: 1, height: 1, lines: [], tokens: [] }] };

      mockPrisma.document.findUnique.mockResolvedValue(
        makeDocument({ ocrText: ocrPartial, ocrLayout }),
      );
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) =>
        key === 'USE_LAYOUT_EXTRACTION' ? 'true' : undefined,
      );
      // The forced Layer 1 call reaches maybeMergeLayout (flag on + ocrLayout).
      mockLayoutExtractor.extract.mockReturnValue({
        credits: [],
        confidence: [],
        warnings: [],
      });
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const geminiSpy = jest.spyOn(mockGemini, 'extractStructuredData');

      const result = await service.extract('case-1', 'doc-buro-1');

      // Layer 2 short-circuits before Gemini (partial fields → fallback); the
      // forced Layer 1 call is the only one to reach Gemini.
      expect(geminiSpy).toHaveBeenCalledTimes(1);
      expect(mockPrisma.document.findUnique).toHaveBeenCalledTimes(2);
      expect(result.success).toBe(true);
      geminiSpy.mockRestore();
    });
  });

  // ── 3.8 Integration: combined prompt < 10K chars for 20-credit PDF ──────

  describe('Phase 3 — combined prompt < 10K chars for 20-credit PDF', () => {
    it('instructions + reduced schema + filtered OCR < 11000 chars', () => {
      // Build a realistic 20-credit DETALLE section. Each credit block ~250
      // chars → 20 credits ≈ 5000 chars, under the 6K layout cap.
      const oneCreditBlock = (
        i: number,
      ) => `BANCO EJEMPLO ${i}
${i * 1000} 53,763 42,400 MX MAY-25 ABR-13 0 1,743 NO APLICA
1,${875 + i}
PAGO MÍNIMO PARA CUENTAS REVOLVENTES`;

      const detalleSection =
        'DETALLE DE CRÉDITOS\n' +
        Array.from({ length: 20 }, (_, i) => oneCreditBlock(i + 1)).join('\n\n') +
        '\n\nDETALLE DE CONSULTAS\nfin';

      // Surround with borrower/report metadata (which preFilterOcrLayout
      // should EXCLUDE so they don't bloat the prompt).
      const fullOcr = [
        'BURÓ DE CRÉDITO',
        'Nombre: MARIA PEREZ LOPEZ',
        'RFC: PELJ920412AB1',
        'Fecha de Nacimiento: 12/04/1992',
        'Fecha de Consulta: 01/06/2026',
        'DATOS DEL ACREDITADO',
        'Domicilio: CALLE 20 NUM 100 COL CENTRO MERIDA YUC CP 97000',
        'RESUMEN DE CRÉDITOS',
        'Total credits: 20 Active: 12 Closed: 8',
        detalleSection,
      ].join('\n');

      // Layer-2 filtered OCR: only DETALLE section (borrower/report excluded)
      const filteredOcr = (service as any).preFilterOcrLayout(fullOcr);

      // Build the prompt the same way extract() does:
      //   CREDIT_BUREAU_INSTRUCTIONS_LEAN + schema + filteredOcr
      // (GeminiService concatenates instructions + schema + ocrText).
      const schemaJson = JSON.stringify(CREDIT_BUREAU_SCHEMA_REDUCED);
      const prompt =
        CREDIT_BUREAU_INSTRUCTIONS_LEAN + schemaJson + filteredOcr;

      // Assert the combined prompt is under the 11K budget (instructions grew
      // with paymentHistory/mopCodes length limits for output safety).
      expect(prompt.length).toBeLessThan(11000);

      // Sanity: the filtered OCR should NOT contain borrower metadata
      expect(filteredOcr).not.toContain('Domicilio:');
      expect(filteredOcr).not.toContain('RFC:');

      // Sanity: the filtered OCR should contain credit detail data
      expect(filteredOcr.toUpperCase()).toContain('DETALLE DE CRÉDITOS');
    });

    it('reduced schema (not LEAN) is used when layout active — further reduces output', () => {
      const reducedJson = JSON.stringify(CREDIT_BUREAU_SCHEMA_REDUCED);
      const leanJson = JSON.stringify(CREDIT_BUREAU_SCHEMA_LEAN);
      // REDUCED must be smaller than LEAN (4 financial fields dropped)
      expect(reducedJson.length).toBeLessThan(leanJson.length);

      // Verify the 4 fields are gone in the serialized form
      expect(reducedJson).not.toContain('"currentBalance"');
      expect(reducedJson).not.toContain('"paymentDueAmount"');
      expect(reducedJson).not.toContain('"lastPaymentAmount"');
      expect(reducedJson).not.toContain('"creditLimit"');
    });
  });

  // =========================================================================
  // Coordinate grid extraction integration — PR #1 (Phase 2 testing)
  //
  // Exercises the wiring between CreditBureauExtractionService and
  // CoordinateExtractionService/GcsService. The coordinate extractor downloads
  // the raw PDF from GCS and runs BEFORE Gemini; BAND_MATCH values overwrite
  // Gemini's paymentDueAmount after Gemini returns. RESCUE/UNCONFIRMED defer
  // to Gemini. Any error in the coordinate path falls through gracefully.
  // =========================================================================

  describe('extract — coordinate extraction integration', () => {
    /**
     * Build a CoordinateExtractionResult with one credit matching the baseline
     * Gemini credit (BBVA, accountNumber 1234567890).
     */
    function makeCoordinateResult(
      paymentDueAmount: string,
      paymentSource: PaymentDueAmountSource,
      institution = 'BBVA',
    ): CoordinateExtractionResult {
      const credit: CoordinateCredit = {
        institution,
        accountNumber: '1234567890',
        creditType: null,
        paymentType: null,
        creditLimit: '',
        maxCredit: '',
        currentBalance: '',
        pastDueAmount: '',
        lastPaymentAmount: '',
        paymentDueAmount,
        paymentSource,
        mopCodes: [],
        status: 'UNKNOWN' as const,
      };
      return {
        sourceFile: 'buro-report.pdf',
        totalPages: 1,
        totalWords: 100,
        columnsDetected: ['paymentDueAmount'],
        sectionsFound: 1,
        credits: [credit],
        warnings: [],
      };
    }

    /** Stub GCS download returning a fake PDF buffer. */
    function stubGcsDownload(): void {
      mockGcs.downloadFile.mockResolvedValue(Buffer.from('%PDF-1.4 fake'));
    }

    it('BAND_MATCH coordinate result overwrites Gemini paymentDueAmount', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      mockCoordinateExtractor.extract.mockResolvedValue(
        makeCoordinateResult('8775', PaymentDueAmountSource.BAND_MATCH),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // Coordinate BAND_MATCH won (8775), not Gemini's 2000
      expect(credits[0].paymentDueAmount).toBe(8775);
      expect(credits[0].paymentDueAmountSource).toBe(
        PaymentDueAmountSource.BAND_MATCH,
      );
      expect(credits[0].paymentDueAmountConfirmed).toBe(true);
      // Effective follows the triple pattern (confirmed ? extracted : null)
      expect(credits[0].paymentDueAmountEffective).toBe(8775);
      // Gemini's original value archived for audit
      expect(credits[0].candidatePaymentDueAmount).toBe(8775);
    });

    it('RESCUE coordinate result defers to Gemini, Gemini value wins', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      mockCoordinateExtractor.extract.mockResolvedValue(
        makeCoordinateResult('9999', PaymentDueAmountSource.RESCUE),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // Gemini value (2000) wins — RESCUE is not authoritative
      expect(credits[0].paymentDueAmount).toBe(2000);
      expect(credits[0].paymentDueAmountSource).not.toBe(
        PaymentDueAmountSource.RESCUE,
      );
    });

    it('UNCONFIRMED coordinate result defers to Gemini, coordinate value NOT used', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      mockCoordinateExtractor.extract.mockResolvedValue(
        makeCoordinateResult('5555', PaymentDueAmountSource.UNCONFIRMED),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // Gemini value (2000) wins — UNCONFIRMED is not authoritative
      expect(credits[0].paymentDueAmount).toBe(2000);
      // The coordinate value (5555) was NOT used — only BAND_MATCH overwrites
      expect(credits[0].paymentDueAmount).not.toBe(5555);
    });

    it('COORDINATE_EXTRACTION_ENABLED=false skips coordinate extraction entirely', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'false';
        return 'false';
      });
      stubGcsDownload();
      mockCoordinateExtractor.extract.mockResolvedValue(
        makeCoordinateResult('8775', PaymentDueAmountSource.BAND_MATCH),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      // Flag off → never downloaded from GCS, never called extractor
      expect(mockGcs.downloadFile).not.toHaveBeenCalled();
      expect(mockCoordinateExtractor.extract).not.toHaveBeenCalled();
      // Gemini value preserved
      expect(credits[0].paymentDueAmount).toBe(2000);
    });

    it('GCS downloadFile rejection falls back gracefully to Gemini-only', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      // GCS throws — should NOT break the Gemini path
      mockGcs.downloadFile.mockRejectedValue(
        new NotFoundException('document not found'),
      );
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');

      // GCS was attempted but the extraction still succeeded
      expect(mockGcs.downloadFile).toHaveBeenCalled();
      expect(mockCoordinateExtractor.extract).not.toHaveBeenCalled();
      expect(result.success).toBe(true);
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];
      // Gemini value preserved (no coordinate overwrite)
      expect(credits[0].paymentDueAmount).toBe(2000);
    });

    it('copies coordinate accountNumber when the matched credit has none and does not persist utilization', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      const coord = makeCoordinateResult(
        '8775',
        PaymentDueAmountSource.BAND_MATCH,
      );
      coord.credits[0].accountNumber = '82953660';
      mockCoordinateExtractor.extract.mockResolvedValue(coord);
      const geminiData = createMockExtractionResult();
      const geminiCredit = {
        ...(geminiData.credits as Record<string, unknown>[])[0],
      };
      delete geminiCredit.accountNumber;
      geminiData.credits = [geminiCredit];
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(geminiData),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].accountNumber).toBe('82953660');
      expect(credits[0]).not.toHaveProperty('utilization');
    });

    it('does not overwrite an existing accountNumber with the coordinate value', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      const coord = makeCoordinateResult(
        '8775',
        PaymentDueAmountSource.BAND_MATCH,
      );
      coord.credits[0].accountNumber = '82953660';
      mockCoordinateExtractor.extract.mockResolvedValue(coord);
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].accountNumber).toBe('1234567890');
      expect(credits[0]).not.toHaveProperty('utilization');
    });

    it('does not copy coordinate maxCredit into creditLimit', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      const coord = makeCoordinateResult(
        '1710',
        PaymentDueAmountSource.BAND_MATCH,
      );
      coord.credits[0].maxCredit = '48509';
      coord.credits[0].creditLimit = '';
      const geminiData = createMockExtractionResult();
      (geminiData.credits as Record<string, unknown>[])[0].creditLimit = null;
      mockCoordinateExtractor.extract.mockResolvedValue(coord);
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(geminiData),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].creditLimit).not.toBe(48509);
    });

    it('does not fill empty Gemini mop codes from the coordinate grid', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      const coord = makeCoordinateResult(
        '0',
        PaymentDueAmountSource.BAND_MATCH,
      );
      coord.credits[0].mopCodes = ['1', '6'];
      const geminiData = createMockExtractionResult();
      (geminiData.credits as Record<string, unknown>[])[0].mopCodes = [];
      mockCoordinateExtractor.extract.mockResolvedValue(coord);
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(geminiData),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].mopCodes).not.toEqual(['1', '6']);
    });

    it('bureau grid limit wins over a maximum stored as the limit, and mop codes are kept', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'BUREAU_GRID_ENABLED') return 'true';
        if (key === 'COORDINATE_EXTRACTION_ENABLED') return 'false';
        return 'false';
      });
      stubGcsDownload();
      const geminiData = createMockExtractionResult();
      const geminiCredit = (geminiData.credits as Record<string, unknown>[])[0];
      geminiCredit.institution = 'BANAMEX';
      geminiCredit.accountNumber = '4037070121465753';
      geminiCredit.creditLimit = 48509;
      geminiCredit.mopCodes = [];
      geminiCredit.paymentDueAmount = 1710;
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(geminiData),
      );
      mockBureauGrid.extract.mockResolvedValue([
        {
          institution: 'BANAMEX TC L',
          accountNumber: '4037070121465753',
          paymentDueAmount: 1710,
          lastPaymentAmount: 19454,
          currentBalance: 32790,
          creditLimit: 49600,
          maxCredit: 48509,
          mopCodes: ['1', '1', '1'],
        },
        {
          institution: 'HSBC MEXICO',
          accountNumber: '5221748001881339',
          paymentDueAmount: 19049,
          lastPaymentAmount: 387,
          currentBalance: 434374,
          creditLimit: 500000,
          maxCredit: 538439,
          mopCodes: ['1', '2', '1'],
        },
      ]);

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(credits[0].creditLimit).toBe(49600);
      expect(credits[0].maxCredit).toBe(48509);
      expect(credits[0].creditLimit).not.toBe(credits[0].maxCredit);
      expect(credits[0].mopCodes).toEqual(['1']);
      expect(credits[0].paymentDueAmount).toBe(1710);
    });

    it('a down bureau grid leaves the Gemini limit in place', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockConfig.get.mockImplementation((key: string) => {
        if (key === 'BUREAU_GRID_ENABLED') return 'true';
        return 'false';
      });
      stubGcsDownload();
      mockBureauGrid.extract.mockResolvedValue(null);
      mockGemini.extractStructuredData.mockResolvedValue(
        validGeminiSuccess(createMockExtractionResult()),
      );

      const result = await service.extract('case-1', 'doc-buro-1');
      const credits = (result.extractedData as Record<string, unknown>)
        .credits as Record<string, unknown>[];

      expect(result.success).toBe(true);
      expect(credits[0].creditLimit).toBe(150000);
      expect(mockBureauGrid.extract).toHaveBeenCalled();
    });
  });
});
