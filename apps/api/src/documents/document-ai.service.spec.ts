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
});
