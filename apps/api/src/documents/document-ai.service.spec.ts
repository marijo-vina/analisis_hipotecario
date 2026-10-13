// ---------------------------------------------------------------------------
// Mock @google-cloud/documentai — must be module-level for jest.mock hoisting
// ---------------------------------------------------------------------------

const mockProcessDocument = jest.fn();

jest.mock('@google-cloud/documentai', () => ({
  DocumentProcessorServiceClient: jest.fn().mockImplementation(() => ({
    processDocument: mockProcessDocument,
  })),
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DocumentAiService } from './document-ai.service';

describe('DocumentAiService', () => {
  let service: DocumentAiService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const PROJECT_ID = 'test-project';
  const LOCATION = 'us';
  const PROCESSOR_ID = 'test-processor-123';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService.get.mockImplementation((key: string) => {
      switch (key) {
        case 'GCLOUD_PROJECT_ID':
          return PROJECT_ID;
        case 'GCLOUD_LOCATION':
          return LOCATION;
        case 'GCLOUD_PROCESSOR_ID':
          return PROCESSOR_ID;
        default:
          return undefined;
      }
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DocumentAiService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<DocumentAiService>(DocumentAiService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractText', () => {
    const gcsUri = 'gs://test-bucket/case-123/doc.pdf';
    const mimeType = 'application/pdf';
    const extractedText = 'Contenido extraído del documento';

    it('should return text from result.document.text when Document AI succeeds', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: { text: extractedText } },
        undefined,
        undefined,
      ]);

      const result = await service.extractText(gcsUri, mimeType);

      expect(result).toBe(extractedText);
    });

    it('should return empty string when result.document.text is empty', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: { text: '' } },
        undefined,
        undefined,
      ]);

      const result = await service.extractText(gcsUri, mimeType);

      expect(result).toBe('');
    });

    it('should return empty string when result.document.text is undefined', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: {} },
        undefined,
        undefined,
      ]);

      const result = await service.extractText(gcsUri, mimeType);

      expect(result).toBe('');
    });

    it('should propagate error when Document AI throws', async () => {
      const grpcError = new Error('gRPC error: deadline exceeded');
      mockProcessDocument.mockRejectedValue(grpcError);

      await expect(service.extractText(gcsUri, mimeType)).rejects.toThrow(
        'gRPC error: deadline exceeded',
      );
    });

    it('should construct correct gcsDocument input with { gcsUri, mimeType } (singular)', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: { text: extractedText } },
        undefined,
        undefined,
      ]);

      await service.extractText(gcsUri, mimeType);

      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`,
          gcsDocument: { gcsUri, mimeType },
        }),
      );
    });
  });

  describe('extractTextWithLayout', () => {
    const gcsUri = 'gs://test-bucket/case-123/doc.pdf';
    const mimeType = 'application/pdf';

    /** A single token with normalized verts spanning a portion of the page. */
    const page1 = {
      dimension: { width: 1000, height: 2000, unit: 'pixels' },
      lines: [
        {
          layout: {
            confidence: 0.97,
            boundingPoly: {
              normalizedVertices: [
                { x: 0.1, y: 0.1 },
                { x: 0.4, y: 0.1 },
                { x: 0.4, y: 0.12 },
                { x: 0.1, y: 0.12 },
              ],
            },
            textAnchor: { textSegments: [{ startIndex: 0, endIndex: 5 }] },
          },
        },
      ],
      tokens: [
        {
          layout: {
            confidence: 0.9,
            boundingPoly: {
              normalizedVertices: [
                { x: 0.1, y: 0.1 },
                { x: 0.2, y: 0.1 },
                { x: 0.2, y: 0.12 },
                { x: 0.1, y: 0.12 },
              ],
            },
            textAnchor: { textSegments: [{ startIndex: 0, endIndex: 5 }] },
          },
        },
      ],
    };

    const fullText = 'Hola mundo extraído';

    it('should return ocrText + ocrLayout with pages/lines/tokens and pixel bboxes', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: { text: fullText, pages: [page1] } },
        undefined,
        undefined,
      ]);

      const { ocrText, ocrLayout } = await service.extractTextWithLayout(gcsUri, mimeType);

      expect(ocrText).toBe(fullText);
      expect(ocrLayout.pages).toHaveLength(1);

      const page = ocrLayout.pages[0];
      expect(page.pageNumber).toBe(1);
      expect(page.width).toBe(1000);
      expect(page.height).toBe(2000);
      expect(page.lines).toHaveLength(1);
      expect(page.tokens).toHaveLength(1);

      const token = page.tokens[0];
      expect(token.text).toBe('Hola ');
      expect(token.confidence).toBe(0.9);
      // normalized verts (0.1..0.2 / 0.1..0.12) × page dims (1000×2000) = pixels
      expect(token.boundingBox).toEqual({ left: 100, top: 200, right: 200, bottom: 240 });

      expect(page.lines[0].boundingBox).toEqual({ left: 100, top: 200, right: 400, bottom: 240 });
      expect(page.lines[0].confidence).toBe(0.97);
    });

    it('should return empty ocrText and empty pages when document.text/pages are undefined', async () => {
      mockProcessDocument.mockResolvedValue([{ document: {} }, undefined, undefined]);

      const { ocrText, ocrLayout } = await service.extractTextWithLayout(gcsUri, mimeType);

      expect(ocrText).toBe('');
      expect(ocrLayout.pages).toEqual([]);
    });

    it('should drop layout elements whose boundingPoly is missing', async () => {
      const page = {
        dimension: { width: 1000, height: 2000, unit: 'pixels' },
        lines: [
          // one line WITHOUT a boundingPoly → must be dropped
          { layout: { textAnchor: { textSegments: [{ startIndex: 0, endIndex: 4 }] } } },
        ],
        tokens: [
          // one token WITHOUT a boundingPoly → must be dropped
          { layout: { textAnchor: { textSegments: [{ startIndex: 0, endIndex: 4 }] } } },
        ],
      };

      mockProcessDocument.mockResolvedValue([
        { document: { text: 'drop', pages: [page] } },
        undefined,
        undefined,
      ]);

      const { ocrLayout } = await service.extractTextWithLayout(gcsUri, mimeType);

      expect(ocrLayout.pages[0].lines).toEqual([]);
      expect(ocrLayout.pages[0].tokens).toEqual([]);
    });

    it('should propagate error when Document AI throws', async () => {
      mockProcessDocument.mockRejectedValue(new Error('gRPC error: deadline exceeded'));

      await expect(service.extractTextWithLayout(gcsUri, mimeType)).rejects.toThrow(
        'gRPC error: deadline exceeded',
      );
    });

    it('should construct correct gcsDocument input with { gcsUri, mimeType } (singular)', async () => {
      mockProcessDocument.mockResolvedValue([
        { document: { text: '', pages: [] } },
        undefined,
        undefined,
      ]);

      await service.extractTextWithLayout(gcsUri, mimeType);

      expect(mockProcessDocument).toHaveBeenCalledWith(
        expect.objectContaining({
          name: `projects/${PROJECT_ID}/locations/${LOCATION}/processors/${PROCESSOR_ID}`,
          gcsDocument: { gcsUri, mimeType },
        }),
      );
    });

    it('should split a PDF that exceeds the synchronous page limit and join the text', async () => {
      mockProcessDocument
        .mockRejectedValueOnce(
          new Error('3 INVALID_ARGUMENT: Document pages exceed the limit: 30 got 35'),
        )
        .mockResolvedValueOnce([{ document: { text: 'paginas 1-30', pages: [] } }])
        .mockResolvedValueOnce([{ document: { text: 'paginas 31-35', pages: [] } }]);

      const { ocrText } = await service.extractTextWithLayout(gcsUri, mimeType);

      expect(ocrText).toBe('paginas 1-30\npaginas 31-35');
      expect(mockProcessDocument).toHaveBeenCalledTimes(3);
      const secondPages =
        mockProcessDocument.mock.calls[1][0].processOptions.individualPageSelector.pages;
      const thirdPages =
        mockProcessDocument.mock.calls[2][0].processOptions.individualPageSelector.pages;
      expect(secondPages).toHaveLength(30);
      expect(secondPages[0]).toBe(1);
      expect(thirdPages).toEqual([31, 32, 33, 34, 35]);
    });
  });
});
