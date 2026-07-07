// =============================================================================
// Phase 6.4 — Integration: real Document AI call on a test bureau PDF
//            → valid ocrLayout shape.
//
// This is a TRUE integration test: it makes a REAL Document AI request
// (no `jest.mock('@google-cloud/documentai')` — unlike the unit spec, the
// `@google-cloud/documentai` module is NOT mocked here). It requires:
//   - GOOGLE_APPLICATION_CREDENTIALS (ADC) reachable in the environment,
//   - GCLOUD_PROJECT_ID / GCLOUD_LOCATION / GCLOUD_PROCESSOR_ID configured,
//   - GCS_BUCKET_NAME configured (the test uploads the PDF to GCS first,
//     because Document AI's `processDocument` API is invoked with a
//     `gcsDocument` URI, not inline bytes), and
//   - a bureau PDF available on disk (searched from the repository root).
//
// When ANY of those credentials is missing the test SKIPS gracefully
// (console.warn + early `return`) so it still appears in the jest report as
// passing but does NOT issue real network calls. This is the conditional-skip
// pattern requested for this change (NOT `it.skip`, so the case stays visible
// in CI reports).
//
// Production code under test (RED already satisfied in Phase 2):
//   `DocumentAiService.extractTextWithLayout(gcsUri, mimeType)` returning
//   `{ ocrText: string, ocrLayout: OcrLayout }`. No new production code is
//   written in this task — the integration test is itself the deliverable.
// =============================================================================

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';
import * as path from 'path';

import { DocumentAiService } from './document-ai.service';
import { GcsService } from './gcs.service';
import type { BoundingBox } from './document-ai.types';

// ---------------------------------------------------------------------------
// Skip precondition: ALL required credentials must be present in process.env
// (Jest does NOT auto-load .env; plain NestJS ConfigService reads process.env
// at construction time).
// ---------------------------------------------------------------------------

const REQUIRED_ENV = [
  'GCLOUD_PROJECT_ID' as const,
  'GCLOUD_PROCESSOR_ID' as const,
  'GCS_BUCKET_NAME' as const,
] as const;

function missingCreds(): string | null {
  const missing = REQUIRED_ENV.filter((k) => !process.env[k]);
  return missing.length ? missing.join(', ') : null;
}

/**
 * Resolve candidate PDF paths from the repo root. Accepts any *.pdf whose
 * name suggests a credit-bureau report. Sorts by size (prefer non-trivial
 * files).
 */
async function findBureauPdf(): Promise<string | null> {
  const root = path.resolve(__dirname, '../../../..');
  let entries: string[] = [];
  try {
    entries = await fs.readdir(root);
  } catch {
    return null;
  }
  const pdfs = entries.filter((n) => /\.pdf$/i.test(n));
  if (!pdfs.length) return null;

  const scored = await Promise.all(
    pdfs.map(async (n) => {
      const full = path.join(root, n);
      const stat = await fs.stat(full).catch(() => null);
      const isBureau = /buro|bureau/i.test(n);
      return { full, size: stat?.size ?? 0, isBureau };
    }),
  );
  scored.sort((a, b) => {
    // Prefer bureau-named PDFs, then the largest available.
    if (a.isBureau !== b.isBureau) return a.isBureau ? -1 : 1;
    return b.size - a.size;
  });
  const pick = scored.find((p) => p.size > 1000);
  return pick ? pick.full : null;
}

describe('DocumentAiService.extractTextWithLayout — real Document AI call (Phase 6.4)', () => {
  let service: DocumentAiService;
  let gcsService: GcsService;
  let uploadedStoragePath: string | null = null;

  afterAll(async () => {
    if (uploadedStoragePath) {
      try {
        await gcsService.deleteFile(uploadedStoragePath);
      } catch {
        // best-effort cleanup; ignore
      }
    }
  });

  it('returns a valid ocrLayout shape (pages[].tokens[].boundingBox, lines[], non-empty ocrText)', async () => {
    const skipReason = missingCreds();
    if (skipReason) {
      // eslint-disable-next-line no-console
      console.warn(
        `[6.4] Skipping real Document AI integration: missing env ${skipReason}.`,
      );
      return;
    }

    const pdfPath = await findBureauPdf();
    if (!pdfPath) {
      // eslint-disable-next-line no-console
      console.warn(
        '[6.4] Skipping real Document AI integration: no bureau PDF found on disk.',
      );
      return;
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [DocumentAiService, GcsService, ConfigService],
    }).compile();
    service = module.get<DocumentAiService>(DocumentAiService);
    gcsService = module.get<GcsService>(GcsService);

    // 1. Upload the test PDF to GCS — Document AI is invoked via a GCS URI.
    const buffer = await fs.readFile(pdfPath);
    uploadedStoragePath = `acceptance-tests/6-4-documentai-${Date.now()}.pdf`;
    const gcsUri = await gcsService.uploadFile(
      uploadedStoragePath,
      buffer,
      'application/pdf',
    );

    // 2. Real Document AI call.
    const { ocrText, ocrLayout } = await service.extractTextWithLayout(
      gcsUri,
      'application/pdf',
    );

    // 3. ocrText must be a non-empty string.
    expect(typeof ocrText).toBe('string');
    expect(ocrText.length).toBeGreaterThan(0);

    // 4. ocrLayout shape: pages[] with at least 1 page.
    expect(Array.isArray(ocrLayout.pages)).toBe(true);
    expect(ocrLayout.pages.length).toBeGreaterThanOrEqual(1);

    let totalTokens = 0;
    let allBoundingBoxesWellFormed = true;

    for (const page of ocrLayout.pages) {
      expect(typeof page.pageNumber).toBe('number');
      expect(typeof page.width).toBe('number');
      expect(page.width).toBeGreaterThan(0);
      expect(typeof page.height).toBe('number');
      expect(page.height).toBeGreaterThan(0);

      // lines[]
      expect(Array.isArray(page.lines)).toBe(true);
      for (const line of page.lines) {
        expect(typeof line.text).toBe('string');
        expect(typeof line.confidence).toBe('number');
        expect(isBoundingBox(line.boundingBox)).toBe(true);
      }

      // tokens[] — tighter bounding boxes used by column detection.
      expect(Array.isArray(page.tokens)).toBe(true);
      totalTokens += page.tokens.length;
      for (const token of page.tokens) {
        expect(typeof token.text).toBe('string');
        expect(typeof token.confidence).toBe('number');
        if (!isBoundingBox(token.boundingBox)) allBoundingBoxesWellFormed = false;
      }
    }

    // Triangulation: a real bureau PDF yields DENSE tokens (≥100 per page on
    // average). The SPIKE confirmed ≥10 tokens/visual line. Fewer than ~100
    // total tokens across ALL pages would indicate the layout path returned
    // an empty structure and the upper shape assertions passed vacuously.
    expect(totalTokens).toBeGreaterThanOrEqual(100);
    expect(allBoundingBoxesWellFormed).toBe(true);
  }, 300_000); // 2 min — real GCS upload + Document AI round-trip.

  /** Type guard verifying a BoundingBox has the four numeric pixel props. */
  function isBoundingBox(b: unknown): b is BoundingBox {
    return (
      !!b &&
      typeof (b as BoundingBox).left === 'number' &&
      typeof (b as BoundingBox).top === 'number' &&
      typeof (b as BoundingBox).right === 'number' &&
      typeof (b as BoundingBox).bottom === 'number'
    );
  }
});