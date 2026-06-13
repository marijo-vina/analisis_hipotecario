import { BadGatewayException, Injectable } from '@nestjs/common';
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
