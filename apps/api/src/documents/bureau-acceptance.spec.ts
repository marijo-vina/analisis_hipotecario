// =============================================================================
// Phase 6.5 / 6.6 — E2E acceptance: full layout-aware extraction pipeline
//   on real bureau PDFs.
//
// These tests exercise the REAL `CreditBureauExtractionService.extract()`
// public method end-to-end against live Document AI + Gemini Vertex AI +
// the deterministic LayoutFinancialExtractor merge. They verify the
// specific regression values the layout-aware work was built to fix:
//
//   6.5 (Claudio Medici PDF):
//     - SANTANDER credit  -> paymentDueAmount = 8775   (NOT 8475 — old bug)
//     - TELCEL MER 82953660 -> paymentDueAmount = 0     (NOT 229  — old bug)
//
//   6.6 (Alejandro Diaz PDF):
//     - AMEX credit         -> paymentDueAmount = 1875
//     - AMEX COMPANY credit -> paymentDueAmount != 49800 and != 41600
//
// A test-only mock of `PrismaService` is injected so `extract()` reads a
// hand-seeded Document row carrying the REAL ocrText + ocrLayout we obtain
// from a live Document AI call — everything ELSE (Gemini call, regex
// disambiguator, LayoutFinancialExtractor crawl, mergeLayoutWithGemini
// authority hierarchy, normalizeCreditBureau, computeAlerts) runs the REAL
// production code. USE_LAYOUT_EXTRACTION=true is forced to exercise the full
// layout pipeline.
//
// When GCP credentials or the target PDF are not present in process.env the
// tests SKIP gracefully (console.warn + early `return`) so they stay visible
// in the jest report without failing CI. This is the conditional-skip pattern
// requested for this change (NOT `it.skip`).
//
// No new production code is written here — the acceptance tests are the
// deliverable. Production code they verify lives in Phases 0-5 (see
// apply-progress).
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

import { DocumentAiService } from './document-ai.service';
import { GcsService } from './gcs.service';
import { GeminiService } from './gemini.service';
import { LayoutFinancialExtractorService } from './layout-financial-extractor.service';
import { CreditBureauExtractionService } from './credit-bureau-extraction.service';
import { PrismaService } from '../prisma/prisma.service';
import type { OcrLayout } from './document-ai.types';

// ---------------------------------------------------------------------------
// Skip precondition: all GCP credentials Document AI + Gemini + GCS need.
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  'GCLOUD_PROJECT_ID',
  'GCLOUD_PROCESSOR_ID',
  'GEMINI_PROJECT_ID',
  'GCS_BUCKET_NAME',
] as const;

function missingCreds(): string | null {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  return missing.length ? missing.join(', ') : null;
}

interface PdfTarget {
  name: string;
  /** Filename_substr tokens (case-insensitive). Empty = accept any *.pdf. */
  filenameMatchers: RegExp[];
}

/** Search the repo root for a PDF whose name matches ANY of the regexes. */
async function findPdf(target: PdfTarget): Promise<string | null> {
  const root = path.resolve(__dirname, '../../../..');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null;
  }
  const scored = await Promise.all(
    entries
      .filter((n) => /\.pdf$/i.test(n))
      .map(async (n) => {
        const full = path.join(root, n);
        const stat = await fs.stat(full).catch(() => null);
        const matchScore = Math.max(
          ...target.filenameMatchers.map((re, idx) =>
            re.test(n) ? target.filenameMatchers.length - idx : -1,
          ),
        );
        return { n, full, size: stat?.size ?? 0, matchScore };
      }),
  );
  // Prefer a name that matches a targeted token, then a non-tiny file.
  scored.sort((a, b) => b.matchScore - a.matchScore || b.size - a.size);
  const pick = scored.find((p) => p.matchScore >= 0 && p.size > 1000);
  return pick ? pick.full : null;
}

/** Minimal seeded Document object that `extract()` reads from Prisma. */
interface SeededDocument {
  id: string;
  mortgageCaseId: string;
  ocrText: string;
  ocrLayout: OcrLayout;
  documentType: { code: string };
  documentStatus: { code: string };
}

function buildMockPrisma(seed: SeededDocument) {
  return {
    document: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { id: string } }) =>
        where.id === seed.id ? Promise.resolve(seed) : Promise.resolve(null),
      ),
      update: jest.fn().mockResolvedValue({}),
    },
    documentStatus: {
      findUnique: jest.fn().mockImplementation(({ where }: { where: { code: string } }) =>
        Promise.resolve({
          // IDs are opaque to extract() beyond being used in an update payload.
          id: where.code === 'PROCESSED' ? 'status-proc' : 'status-err',
          code: where.code,
        }),
      ),
    },
  };
}

interface CreditLike {
  institution?: string | null;
  accountNumber?: string | null;
  paymentDueAmount?: number | null;
  financialFieldsSource?: string | null;
  candidatePaymentDueAmount?: number | null;
}

function findCredit(
  credits: unknown[],
  predicate: (c: CreditLike) => boolean,
): CreditLike | undefined {
  return (credits as CreditLike[]).find(
    (c) => !!c && c.institution !== undefined && predicate(c),
  );
}

/**
 * Build a real NestJS TestingModule with live DocumentAiService, GcsService,
 * GeminiService, LayoutFinancialExtractorService and CreditBureauExtractionService,
 * injecting a mock PrismaService. USE_LAYOUT_EXTRACTION is forced true so the
 * layout pipeline runs (mergeLayoutWithGemini is exercised).
 */
async function buildRealModule(seed: SeededDocument): Promise<{
  module: TestingModule;
  service: CreditBureauExtractionService;
}> {
  // Force the layout feature flag ON for the acceptance tests.
  process.env.USE_LAYOUT_EXTRACTION = 'true';

  const mockPrisma = buildMockPrisma(seed);
  const module = await Test.createTestingModule({
    providers: [
      DocumentAiService,
      GcsService,
      GeminiService,
      LayoutFinancialExtractorService,
      CreditBureauExtractionService,
      ConfigService,
      { provide: PrismaService, useValue: mockPrisma },
    ],
  }).compile();

  return {
    module,
    service: module.get<CreditBureauExtractionService>(CreditBureauExtractionService),
  };
}

async function runExtraction(pdfPath: string): Promise<{
  credits: CreditLike[];
  success: boolean;
  extractedData: any;
}> {
  const module = await Test.createTestingModule({
    providers: [DocumentAiService, GcsService, ConfigService],
  }).compile();
  const documentAi = module.get<DocumentAiService>(DocumentAiService);
  const gcs = module.get<GcsService>(GcsService);

  const buffer = await fs.readFile(pdfPath);
  const storagePath = `acceptance-tests/${Date.now()}-${path.basename(pdfPath)}`;
  const gcsUri = await gcs.uploadFile(storagePath, buffer, 'application/pdf');

  // REAL Document AI call.
  const { ocrText, ocrLayout } = await documentAi.extractTextWithLayout(
    gcsUri,
    'application/pdf',
  );

  // Best-effort cleanup of the uploaded test PDF.
  gcs.deleteFile(storagePath).catch(() => undefined);

  // Seed the Document record the full extract() pipeline will read.
  const documentId = `acceptance-${Date.now()}`;
  const caseId = `acceptance-case-${Date.now()}`;
  const seed: SeededDocument = {
    id: documentId,
    mortgageCaseId: caseId,
    ocrText,
    ocrLayout,
    documentType: { code: 'CREDIT_BUREAU_REPORT' },
    documentStatus: { code: 'PROCESSED' },
  };

  const cbModule = await buildRealModule(seed);
  try {
    const result = await cbModule.service.extract(caseId, documentId);
    const credits =
      (result.extractedData as any)?.credits ?? (result.extractedData as any) ?? [];
    return {
      credits: Array.isArray(credits) ? credits : [],
      success: !!result.success,
      extractedData: result.extractedData,
    };
  } finally {
    await cbModule.module.close();
    await module.close();
  }
}

// ===========================================================================
// 6.5 — Claudio Medici PDF (SANTANDER=8775, TELCEL MER 82953660=0)
// ===========================================================================

describe('Bureau Acceptance — CreditBureauExtractionService (Phase 6.5 / 6.6)', () => {
  describe('6.5 Claudio Medici PDF', () => {
    it('SANTANDER credit has paymentDueAmount=8775 (NOT 8475)', async () => {
      const skipReason = missingCreds();
      if (skipReason) {
        // eslint-disable-next-line no-console
        console.warn(`[6.5] Skipping: missing env ${skipReason}.`);
        return;
      }
      const pdfPath = await findPdf({
        name: 'Claudio Medici',
        filenameMatchers: [/claudio|medici/i, /CM\w*\.pdf/i, /buro|bureau/i],
      });
      if (!pdfPath) {
        // eslint-disable-next-line no-console
        console.warn('[6.5] Skipping: Claudio Medici PDF not found on disk.');
        return;
      }

      const { credits, success } = await runExtraction(pdfPath);

      // Triangulation: the pipeline must have reached Gemini + layout merge.
      expect(success).toBe(true);
      expect(credits.length).toBeGreaterThan(0);

      const santander = findCredit(credits, (c) =>
        /santander/i.test(String(c.institution ?? '')),
      );
      expect(santander).toBeDefined();
      expect(santander!.paymentDueAmount).toBe(8775);
      // Layout must have won authority for this credit (regression-proofing
      // the very bug where Gemini returned 8475).
      expect(santander!.financialFieldsSource).not.toBe('GEMINI');
    }, 300_000);

    it('TELCEL MER account 82953660 has paymentDueAmount=0 (NOT 229)', async () => {
      const skipReason = missingCreds();
      if (skipReason) {
        // eslint-disable-next-line no-console
        console.warn(`[6.5] Skipping: missing env ${skipReason}.`);
        return;
      }
      const pdfPath = await findPdf({
        name: 'Claudio Medici',
        filenameMatchers: [/claudio|medici/i, /CM\w*\.pdf/i, /buro|bureau/i],
      });
      if (!pdfPath) {
        // eslint-disable-next-line no-console
        console.warn('[6.5] Skipping: Claudio Medici PDF not found on disk.');
        return;
      }

      const { credits, success } = await runExtraction(pdfPath);

      expect(success).toBe(true);
      expect(credits.length).toBeGreaterThan(0);

      const telcel = findCredit(
        credits,
        (c) =>
          /telcel/i.test(String(c.institution ?? '')) &&
          String(c.accountNumber ?? '').includes('82953660'),
      );
      expect(telcel).toBeDefined();
      expect(telcel!.paymentDueAmount).toBe(0);
      // The 229 regression came from Gemini — layout authority must NOT be
      // skipped for this credit.
      expect(telcel!.financialFieldsSource).not.toBe('GEMINI');
    }, 300_000);
  });

  // ===========================================================================
  // 6.6 — Alejandro Diaz PDF (AMEX=1875, AMEX COMPANY != 49800/41600)
  // ===========================================================================

  describe('6.6 Alejandro Diaz PDF', () => {
    it('AMEX credit has paymentDueAmount=1875', async () => {
      const skipReason = missingCreds();
      if (skipReason) {
        // eslint-disable-next-line no-console
        console.warn(`[6.6] Skipping: missing env ${skipReason}.`);
        return;
      }
      const pdfPath = await findPdf({
        name: 'Alejandro Diaz',
        filenameMatchers: [/alejandro|diaz/i, /buro|bureau/i],
      });
      if (!pdfPath) {
        // eslint-disable-next-line no-console
        console.warn('[6.6] Skipping: Alejandro Diaz PDF not found on disk.');
        return;
      }

      const { credits, success } = await runExtraction(pdfPath);

      expect(success).toBe(true);
      expect(credits.length).toBeGreaterThan(0);

      // AMEX personal credit (revolving) — must show paymentDueAmount = 1875.
      const amex = findCredit(credits, (c) => {
        const inst = String(c.institution ?? '');
        // Exclude the "COMPANY" corporate card from this assertion; that one
        // is asserted separately below.
        return /amex|american express/i.test(inst) && !/company/i.test(inst);
      });
      expect(amex).toBeDefined();
      expect(amex!.paymentDueAmount).toBe(1875);
    }, 300_000);

    it('AMEX COMPANY credit does NOT have paymentDueAmount 49800 or 41600', async () => {
      const skipReason = missingCreds();
      if (skipReason) {
        // eslint-disable-next-line no-console
        console.warn(`[6.6] Skipping: missing env ${skipReason}.`);
        return;
      }
      const pdfPath = await findPdf({
        name: 'Alejandro Diaz',
        filenameMatchers: [/alejandro|diaz/i, /buro|bureau/i],
      });
      if (!pdfPath) {
        // eslint-disable-next-line no-console
        console.warn('[6.6] Skipping: Alejandro Diaz PDF not found on disk.');
        return;
      }

      const { credits, success } = await runExtraction(pdfPath);

      expect(success).toBe(true);
      expect(credits.length).toBeGreaterThan(0);

      const amexCompany = findCredit(
        credits,
        (c) => /amex|american express/i.test(String(c.institution ?? '')) && /company/i.test(String(c.institution ?? '')),
      );
      if (amexCompany) {
        // When present, the wrong Gemini values 49800 / 41600 must NOT have
        // survived the layout merge.
        expect(amexCompany.paymentDueAmount).not.toBe(49800);
        expect(amexCompany.paymentDueAmount).not.toBe(41600);
      }
      // Self-triangulation: there is at least one AMEX credit (personal or
      // company), so the pipeline's Gemini + layout merge ran.
      const anyAmex = findCredit(credits, (c) =>
        /amex|american express/i.test(String(c.institution ?? '')),
      );
      expect(anyAmex).toBeDefined();
    }, 300_000);
  });
});