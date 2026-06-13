import { BadGatewayException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

// ---------------------------------------------------------------------------
// Mock @google-cloud/storage — must be module-level for jest.mock hoisting
// ---------------------------------------------------------------------------

const mockFileSave = jest.fn();

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn().mockReturnValue({
      file: jest.fn().mockReturnValue({
        save: mockFileSave,
      }),
    }),
  })),
}));

import { GcsService } from './gcs.service';

describe('GcsService', () => {
  let service: GcsService;

  const mockConfigService = {
    get: jest.fn(),
  };

  const BUCKET = 'test-bucket';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockConfigService.get.mockReturnValue(BUCKET);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GcsService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<GcsService>(GcsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('uploadFile', () => {
    const buffer = Buffer.from('fake-pdf-content');
    const destination = 'case-123/PAYROLL_RECEIPT/doc.pdf';
    const mimeType = 'application/pdf';

    it('should upload file to GCS and return gs:// URI', async () => {
      mockFileSave.mockResolvedValue(undefined);

      const result = await service.uploadFile(destination, buffer, mimeType);

      expect(mockFileSave).toHaveBeenCalledWith(buffer, {
        contentType: mimeType,
      });
      expect(result).toBe(`gs://${BUCKET}/${destination}`);
    });

    it('should throw BadGatewayException when GCS upload fails', async () => {
      mockFileSave.mockRejectedValue(new Error('Connection refused'));

      await expect(
        service.uploadFile(destination, buffer, mimeType),
      ).rejects.toThrow(BadGatewayException);
    });

    it('should include the message in BadGatewayException', async () => {
      mockFileSave.mockRejectedValue(new Error('Bucket not found'));

      await expect(
        service.uploadFile(destination, buffer, mimeType),
      ).rejects.toThrow('File storage service unavailable');
    });

    it('should not return a value after GCS failure', async () => {
      mockFileSave.mockRejectedValue(new Error('Connection refused'));

      const result = service
        .uploadFile(destination, buffer, mimeType)
        .then(() => 'unexpected-success')
        .catch((err) => err.message);

      await expect(result).resolves.toBe('File storage service unavailable');
    });
  });
});
