// ---------------------------------------------------------------------------
// CoordinateExtractionService — NestJS wrapper around the pure grid extractor.
//
// Reads a PDF buffer, uses pdfjs-dist to extract coordinate words,
// delegates to extractFromCoordinateWords(), and returns structured credits.
//
// Feature-flagged: only active when COORDINATE_EXTRACTION_ENABLED=true.
// ---------------------------------------------------------------------------

import { Injectable, Logger } from '@nestjs/common';
import * as pdfjsLib from 'pdfjs-dist/legacy/build/pdf.mjs';

import {
  CoordinateWord,
  CoordinateExtractionResult,
  CoordinateExtractionOptions,
} from './coordinate-extraction.types';
import { extractFromCoordinateWords } from './coordinate-grid.extractor';

@Injectable()
export class CoordinateExtractionService {
  private readonly logger = new Logger(CoordinateExtractionService.name);

  /**
   * Extract all words with pixel coordinates from a PDF buffer.
   * Uses pdfjs-dist's getTextContent() — no rendering worker needed.
   */
  async extractWords(pdfBuffer: Buffer): Promise<CoordinateWord[]> {
    const data = new Uint8Array(pdfBuffer).buffer;
    const doc = await pdfjsLib.getDocument({ data, disableFontFace: true }).promise;
    const allWords: CoordinateWord[] = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });

      for (const item of textContent.items as { str?: string; transform: number[]; width: number; height: number }[]) {
        const text = item.str?.trim();
        if (!text) continue;

        const x = item.transform[4];
        const y = viewport.height - item.transform[5]; // flip Y to top-down

        allWords.push({
          text,
          x,
          y,
          width: item.width,
          height: item.height || 10,
          pageNum,
        });
      }
    }

    this.logger.log(`Extracted ${allWords.length} words from ${doc.numPages} pages`);
    return allWords;
  }

  /**
   * Full pipeline: PDF buffer → coordinate words → grid extraction → credits.
   *
   * @param pdfBuffer  — raw PDF bytes (from GCS or disk)
   * @param sourceName — filename for metadata / logging
   * @param opts       — optional tuning knobs
   */
  async extract(
    pdfBuffer: Buffer,
    sourceName: string,
    opts?: Partial<CoordinateExtractionOptions>,
  ): Promise<CoordinateExtractionResult> {
    const words = await this.extractWords(pdfBuffer);
    const result = extractFromCoordinateWords(words, sourceName, opts);

    this.logger.log(
      `Extraction complete: ${result.credits.length} credits, ` +
      `${result.columnsDetected.length} columns, ` +
      `${result.warnings.length} warnings`,
    );

    const withPayment = result.credits.filter(c => c.paymentDueAmount);
    this.logger.log(`${withPayment.length}/${result.credits.length} credits have paymentDueAmount`);

    return result;
  }
}
