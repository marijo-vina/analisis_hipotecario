import { BadGatewayException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

// ---------------------------------------------------------------------------
// Mock @google-cloud/storage — must be module-level for jest.mock hoisting
// ---------------------------------------------------------------------------

const mockFileSave = jest.fn();
const mockFileGetSignedUrl = jest.fn();
const mockFileDelete = jest.fn();

jest.mock('@google-cloud/storage', () => ({
  Storage: jest.fn().mockImplementation(() => ({
    bucket: jest.fn().mockReturnValue({
      file: jest.fn().mockReturnValue({
        save: mockFileSave,
        getSignedUrl: mockFileGetSignedUrl,
        delete: mockFileDelete,
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

  describe('generateSignedUrl', () => {
    const storagePath = 'case-123/PAYROLL_RECEIPT/doc.pdf';

    it('should generate and return a signed URL string', async () => {
      const signedUrl =
        'https://storage.googleapis.com/test-bucket/case-123/PAYROLL_RECEIPT/doc.pdf?signature=abc&expires=123';
      mockFileGetSignedUrl.mockResolvedValue([signedUrl]);

      const result = await service.generateSignedUrl(storagePath);

      expect(mockFileGetSignedUrl).toHaveBeenCalledWith({
        action: 'read',
        expires: expect.any(Number),
      });
      expect(result).toBe(signedUrl);
    });

    it('should throw NotFoundException when GCS file does not exist', async () => {
      mockFileGetSignedUrl.mockRejectedValue(new Error('File not found'));

      await expect(service.generateSignedUrl(storagePath)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw user-friendly message when GCS file does not exist', async () => {
      mockFileGetSignedUrl.mockRejectedValue(new Error('No such object'));

      await expect(service.generateSignedUrl(storagePath)).rejects.toThrow(
        'El documento no está disponible',
      );
    });
  });

  describe('deleteFile', () => {
    const storagePath = 'case-123/PAYROLL_RECEIPT/doc.pdf';

    it('should delete file from GCS with ignoreNotFound option', async () => {
      mockFileDelete.mockResolvedValue(undefined);

      await service.deleteFile(storagePath);

      expect(mockFileDelete).toHaveBeenCalledWith({ ignoreNotFound: true });
    });

    it('should silently succeed when GCS returns 404 (file not found)', async () => {
      const notFoundError = new Error('Not Found') as Error & { code: number };
      notFoundError.code = 404;
      mockFileDelete.mockRejectedValue(notFoundError);

      await expect(service.deleteFile(storagePath)).resolves.toBeUndefined();
    });

    it('should throw BadGatewayException on non-404 GCS errors', async () => {
      mockFileDelete.mockRejectedValue(new Error('Connection refused'));

      await expect(service.deleteFile(storagePath)).rejects.toThrow(
        BadGatewayException,
      );
    });

    it('should throw user-friendly message on non-404 GCS errors', async () => {
      mockFileDelete.mockRejectedValue(new Error('Internal server error'));

      await expect(service.deleteFile(storagePath)).rejects.toThrow(
        'Error al eliminar el archivo del almacenamiento',
      );
    });
  });
});
