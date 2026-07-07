import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import {
  BoundingBox,
  OcrLayout,
  OcrLine,
  OcrPage,
  OcrToken,
} from './document-ai.types';

/**
 * Loose typing for the raw Document AI `document` object. Only the layout
 * fields we consume are referenced; the full protobuf shape is intentionally
 * not modelled here.
 */
type RawDocument = any;

@Injectable()
export class DocumentAiService {
  private readonly logger = new Logger(DocumentAiService.name);
  private client: DocumentProcessorServiceClient;
  private processorName: string;

  constructor(private configService: ConfigService) {
    const projectId = this.configService.get<string>('GCLOUD_PROJECT_ID') || '';
    const location = this.configService.get<string>('GCLOUD_LOCATION') || '';
    const processorId = this.configService.get<string>('GCLOUD_PROCESSOR_ID') || '';

    this.processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    this.client = new DocumentProcessorServiceClient();
  }

  /**
   * Process a document already in GCS and return its plain OCR text.
   * Backward-compatible single-string extractor — unchanged by the
   * layout-aware extraction work (Phase 2).
   */
  async extractText(gcsUri: string, mimeType: string): Promise<string> {
    const [result] = await this.client.processDocument({
      name: this.processorName,
      gcsDocument: { gcsUri, mimeType },
    });

    return result.document?.text ?? '';
  }

  /**
   * Process a document already in GCS and return BOTH the plain OCR text
   * AND a compact `OcrLayout` structure (pages → lines + tokens with pixel
   * bounding boxes + confidence) that the layout-aware financial extractor
   * (Phase 3) consumes for column detection.
   *
   * Uses the SAME Document AI processor as `extractText()` — no new processor
   * is configured. Only the compact layout structures are built from the raw
   * response; the full raw Document AI object is NOT retained.
   *
   * `extractText()` remains unchanged and is the backward-compatible path for
   * callers that only need text.
   */
  async extractTextWithLayout(
    gcsUri: string,
    mimeType: string,
  ): Promise<{ ocrText: string; ocrLayout: OcrLayout }> {
    const [result] = await this.client.processDocument({
      name: this.processorName,
      gcsDocument: { gcsUri, mimeType },
    });

    const document: RawDocument | undefined = result.document;
    const ocrText: string = document?.text ?? '';
    const ocrLayout: OcrLayout = this.buildOcrLayout(document);

    return { ocrText, ocrLayout };
  }

  // -------------------------------------------------------------------------
  // OcrLayout construction (compact layout from raw Document AI response)
  // -------------------------------------------------------------------------

  /** Build the compact `OcrLayout` from a raw Document AI `document`. */
  private buildOcrLayout(document: RawDocument | undefined): OcrLayout {
    if (!document) return { pages: [] };

    const rawPages: RawDocument[] = Array.isArray(document.pages) ? document.pages : [];
    const text: string = document.text ?? '';

    const pages: OcrPage[] = rawPages.map((page, idx) =>
      this.buildOcrPage(page, idx + 1, text),
    );

    return { pages };
  }

  /** Convert one raw Document AI page into a compact `OcrPage`. */
  private buildOcrPage(page: RawDocument, pageNumber: number, text: string): OcrPage {
    const width = Number(page?.dimension?.width ?? 0);
    const height = Number(page?.dimension?.height ?? 0);

    const rawLines: RawDocument[] = Array.isArray(page?.lines) ? page.lines : [];
    const rawTokens: RawDocument[] = Array.isArray(page?.tokens) ? page.tokens : [];

    const lines: OcrLine[] = rawLines
      .map((l) => this.toOcrLine(l, text, width, height))
      .filter((l): l is OcrLine => l !== null);

    const tokens: OcrToken[] = rawTokens
      .map((t) => this.toOcrToken(t, text, width, height))
      .filter((t): t is OcrToken => t !== null);

    return { pageNumber, width, height, lines, tokens };
  }

  /** Convert a raw Document AI line into an `OcrLine` (pixel bounding box). */
  private toOcrLine(
    el: RawDocument,
    text: string,
    width: number,
    height: number,
  ): OcrLine | null {
    const boundingBox = this.pixelBoxOf(el, width, height);
    if (!boundingBox) return null;
    return {
      text: this.sliceText(el, text),
      boundingBox,
      confidence: this.confidenceOf(el),
    };
  }

  /** Convert a raw Document AI token into an `OcrToken` (pixel bounding box). */
  private toOcrToken(
    el: RawDocument,
    text: string,
    width: number,
    height: number,
  ): OcrToken | null {
    const boundingBox = this.pixelBoxOf(el, width, height);
    if (!boundingBox) return null;
    return {
      text: this.sliceText(el, text),
      boundingBox,
      confidence: this.confidenceOf(el),
    };
  }

  /**
   * Pixel `BoundingBox` for a Document AI layout element.
   * Multiplies the element's `normalizedVertices` (0..1) by the page
   * dimension to get pixel coordinates, which the column-detection algorithm
   * (≤15px X-gap criterion) operates on.
   */
  private pixelBoxOf(
    el: RawDocument,
    width: number,
    height: number,
  ): BoundingBox | null {
    const norm = this.normBoxOf(el);
    if (!norm) return null;
    return {
      left: norm.left * width,
      top: norm.top * height,
      right: norm.right * width,
      bottom: norm.bottom * height,
    };
  }

  /** Extract normalized bounding box {left,top,right,bottom} (0..1) from a layout element. */
  private normBoxOf(el: RawDocument): { left: number; top: number; right: number; bottom: number } | null {
    const verts: RawDocument[] = el?.layout?.boundingPoly?.normalizedVertices;
    if (!Array.isArray(verts) || !verts.length) return null;
    const xs = verts.map((v) => Number(v.x ?? 0));
    const ys = verts.map((v) => Number(v.y ?? 0));
    return {
      left: Math.min(...xs),
      top: Math.min(...ys),
      right: Math.max(...xs),
      bottom: Math.max(...ys),
    };
  }

  /** Resolve the text slice for a token/line using textAnchor.textSegments. */
  private sliceText(el: RawDocument, text: string): string {
    const segs: RawDocument[] = el?.layout?.textAnchor?.textSegments ?? [];
    return segs
      .map((s) => {
        const start = Number(s.startIndex ?? 0);
        const end = Number(s.endIndex ?? text.length);
        return text.slice(start, end);
      })
      .join('');
  }

  /** Confidence from a layout element (0..1). Defaults to 0 when absent. */
  private confidenceOf(el: RawDocument): number {
    return Number(el?.layout?.confidence ?? 0);
  }
}