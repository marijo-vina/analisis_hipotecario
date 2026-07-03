import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  CreditScoreExtractionService,
  CreditScoreExtractionResult,
} from './credit-score-extraction.service';

// ---------------------------------------------------------------------------
// Helpers — mock document builder for CREDIT_SCORE documents
// ---------------------------------------------------------------------------

interface MockScoreDocument {
  id: string;
  mortgageCaseId: string;
  documentType: { id: number; code: string; name: string; isActive: boolean };
  documentStatus: { id: number; code: string; name: string; order: number };
  ocrText: string | null;
  extractedData: unknown | null;
}

const makeScoreDocument = (
  overrides: Partial<MockScoreDocument> = {},
): MockScoreDocument => ({
  id: 'doc-score-1',
  mortgageCaseId: 'case-1',
  documentType: {
    id: 10,
    code: 'CREDIT_SCORE',
    name: 'Mi Score',
    isActive: true,
  },
  documentStatus: {
    id: 4,
    code: 'PROCESSED',
    name: 'Procesado',
    order: 4,
  },
  ocrText: 'MI SCORE\nScore: 720',
  extractedData: null,
  ...overrides,
});

const scoreGeminiSuccess = (extractedData: Record<string, unknown>) => ({
  success: true,
  documentType: 'CREDIT_SCORE',
  extractedData,
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('CreditScoreExtractionService', () => {
  let service: CreditScoreExtractionService;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CreditScoreExtractionService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: GeminiService, useValue: mockGemini },
      ],
    }).compile();

    service = module.get<CreditScoreExtractionService>(
      CreditScoreExtractionService,
    );
  });

  describe('static isCreditScoreDocument', () => {
    it('returns true for CREDIT_SCORE', () => {
      expect(
        CreditScoreExtractionService.isCreditScoreDocument('CREDIT_SCORE'),
      ).toBe(true);
    });

    it('returns false for CREDIT_BUREAU_REPORT', () => {
      expect(
        CreditScoreExtractionService.isCreditScoreDocument(
          'CREDIT_BUREAU_REPORT',
        ),
      ).toBe(false);
    });
  });

  describe('extract — status gates', () => {
    it('rejects UPLOADED status', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeScoreDocument({
          documentStatus: {
            id: 1,
            code: 'UPLOADED',
            name: 'Cargado',
            order: 1,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_NOT_PROCESSED');
    });

    it('rejects wrong document type', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeScoreDocument({
          documentType: {
            id: 3,
            code: 'CREDIT_BUREAU_REPORT',
            name: 'Buró de crédito',
            isActive: true,
          },
        }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('DOCUMENT_TYPE_MISMATCH');
    });

    it('rejects empty OCR text', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(
        makeScoreDocument({ ocrText: '' }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe(GeminiErrorCode.OCR_TEXT_EMPTY);
    });
  });

  describe('extract — score extraction (EXT-001/002/003)', () => {
    beforeEach(() => {
      mockPrisma.document.findUnique.mockResolvedValue(makeScoreDocument());
      mockPrisma.document.update.mockResolvedValue({});
    });

    it('valid score 720 → score=720, not excluded (EXT-001)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: 720, scoreIsExcluded: false }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      const ed = result.extractedData as Record<string, unknown>;
      expect(result.success).toBe(true);
      expect(ed.score).toBe(720);
      expect(ed.scoreIsExcluded).toBe(false);
    });

    it('negative score → excluded with reason (EXT-002)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: -5, scoreIsExcluded: false }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      const ed = result.extractedData as Record<string, unknown>;
      expect(ed.score).toBe(-5);
      expect(ed.scoreIsExcluded).toBe(true);
      expect(ed.scoreExclusionReason).toBeTruthy();
      expect(
        (result.alerts as { code: string }[]).some(
          (a) => a.code === 'BURO_SCORE_EXCLUDED',
        ),
      ).toBe(true);
    });

    it('no score detectable → score=null, no exclusion (EXT-003)', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: null, scoreIsExcluded: false }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      const ed = result.extractedData as Record<string, unknown>;
      expect(ed.score).toBeNull();
      expect(ed.scoreIsExcluded).toBe(false);
      expect(result.alerts.length).toBe(0);
    });

    it('out-of-range score (>800) → null', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: 999, scoreIsExcluded: false }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      const ed = result.extractedData as Record<string, unknown>;
      expect(ed.score).toBeNull();
    });

    it('score < 500 → BURO_SCORE_CRITICAL alert', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: 450, scoreIsExcluded: false }),
      );

      const result = await service.extract('case-1', 'doc-score-1');
      expect(
        (result.alerts as { code: string }[]).some(
          (a) => a.code === 'BURO_SCORE_CRITICAL',
        ),
      ).toBe(true);
    });

    it('persists extractedData and sets PROCESSED status', async () => {
      mockGemini.extractStructuredData.mockResolvedValue(
        scoreGeminiSuccess({ score: 720, scoreIsExcluded: false }),
      );

      await service.extract('case-1', 'doc-score-1');
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-score-1' },
        data: {
          extractedData: expect.any(Object),
          documentStatusId: 4, // PROCESSED
        },
      });
    });
  });

  describe('extract — Gemini failure', () => {
    it('returns error and sets EXTRACTION_ERROR status', async () => {
      mockPrisma.document.findUnique.mockResolvedValue(makeScoreDocument());
      mockPrisma.document.update.mockResolvedValue({});
      mockGemini.extractStructuredData.mockResolvedValue({
        success: false,
        documentType: 'CREDIT_SCORE',
        extractedData: null,
        error: {
          code: GeminiErrorCode.GEMINI_TIMEOUT,
          message: 'Gemini temporarily unavailable.',
        },
      });

      const result = await service.extract('case-1', 'doc-score-1');
      expect(result.success).toBe(false);
      expect(result.extractedData).toBeNull();
      expect(mockPrisma.document.update).toHaveBeenCalledWith({
        where: { id: 'doc-score-1' },
        data: { documentStatusId: 7 }, // EXTRACTION_ERROR
      });
    });
  });
});
