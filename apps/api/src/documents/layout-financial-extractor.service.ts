// ===========================================================================
// Lines-first credit bureau financial extractor — NestJS service wrapper.
//
// PR 2: The heavy lifting moved to `layout-lines-extractor.ts` (pure
// functions). This service is now a thin wrapper that delegates to
// `extractFromLayout()`.
//
// The old tokens-first implementation (clusterColumnsByGap, groupRowsByY,
// detectTableBlocks, mapHeaderToFields, extractRowFields) is DELETED.
// Those functions are superseded by the line-classification pipeline.
// ===========================================================================

import { Injectable, Logger } from '@nestjs/common';
import {
  LayoutFinancialResult,
  OcrLayout,
  OcrPage,
} from './document-ai.types';
import { extractFromLayout } from './layout-lines-extractor';

@Injectable()
export class LayoutFinancialExtractorService {
  private readonly logger = new Logger(LayoutFinancialExtractorService.name);

  /**
   * Lines-first extraction pipeline.
   *
   * Delegates to `extractFromLayout` in `layout-lines-extractor.ts`.
   * Same output contract (LayoutFinancialResult) — zero changes needed
   * in the merge layer (`credit-bureau-extraction.service.ts`).
   */
  extract(ocrLayout: OcrLayout | null | undefined): LayoutFinancialResult {
    return extractFromLayout(
      (ocrLayout as { pages: OcrPage[] }) ?? { pages: [] },
    );
  }
}
