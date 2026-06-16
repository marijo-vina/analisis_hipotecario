import { BadGatewayException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';

@Injectable()
export class GcsService {
  private storage: Storage;
  private bucketName: string;

  constructor(private configService: ConfigService) {
    this.bucketName =
      this.configService.get<string>('GCS_BUCKET_NAME') || '';
    this.storage = new Storage();
  }

  async generateSignedUrl(storagePath: string): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(storagePath);
      const [url] = await file.getSignedUrl({
        action: 'read',
        expires: Date.now() + 5 * 60 * 1000,
      });
      return url;
    } catch (error) {
      throw new NotFoundException('El documento no está disponible');
    }
  }

  async deleteFile(storagePath: string): Promise<void> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(storagePath);
      await file.delete({ ignoreNotFound: true });
    } catch (error) {
      // If ignoreNotFound is not supported by the GCS client version,
      // catch the 404 error code manually and treat as success
      if ((error as any)?.code === 404) return;
      throw new BadGatewayException(
        'Error al eliminar el archivo del almacenamiento',
      );
    }
  }

  async uploadFile(
    destination: string,
    buffer: Buffer,
    mimeType: string,
  ): Promise<string> {
    try {
      const bucket = this.storage.bucket(this.bucketName);
      const file = bucket.file(destination);
      await file.save(buffer, { contentType: mimeType });
      return `gs://${this.bucketName}/${destination}`;
    } catch (error) {
      throw new BadGatewayException('File storage service unavailable');
    }
  }
}
