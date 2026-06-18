import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentProcessorServiceClient } from '@google-cloud/documentai';

@Injectable()
export class DocumentAiService {
  private client: DocumentProcessorServiceClient;
  private processorName: string;

  constructor(private configService: ConfigService) {
    const projectId = this.configService.get<string>('GCLOUD_PROJECT_ID') || '';
    const location = this.configService.get<string>('GCLOUD_LOCATION') || '';
    const processorId = this.configService.get<string>('GCLOUD_PROCESSOR_ID') || '';

    this.processorName = `projects/${projectId}/locations/${location}/processors/${processorId}`;
    this.client = new DocumentProcessorServiceClient();
  }

  async extractText(gcsUri: string, mimeType: string): Promise<string> {
    const [result] = await this.client.processDocument({
      name: this.processorName,
      gcsDocument: { gcsUri, mimeType },
    });

    return result.document?.text ?? '';
  }
}
