import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService, GeminiErrorCode } from './gemini.service';
import {
  actKindForDocumentType,
  isArticlesDocument,
  postProcessArticles,
  type ArticlesDocumentType,
  type ArticlesExtractionPayload,
} from './articles-shareholding';

const ARTICLES_INSTRUCTIONS = [
  'Acta constitutiva o acta de modificación de poderes / asamblea de una sociedad mexicana.',
  '',
  'NO inventes datos. Ante cualquier duda, usá null.',
  'Las fechas van en YYYY-MM-DD. Los porcentajes y montos van como número, sin símbolo de pesos ni signo de porcentaje.',
  '',
  '─── Sociedad ───',
  '  - legalName: denominación o razón social, sin el régimen de capital.',
  '  - legalForm: régimen (S.A. de C.V., S. de R.L., Asociación Civil, etc.).',
  '  - rfc: RFC de la sociedad si el documento lo trae. Si no aparece, null.',
  '  - isNonProfit: true solo si es asociación civil, institución de asistencia privada o sociedad sin fines de lucro.',
  '  - deedNumber: número de escritura.',
  '  - deedDate: fecha de la escritura.',
  '  - notary: nombre y número del notario, y ciudad si aparecen.',
  '  - incorporationDate: fecha de constitución de la sociedad.',
  '  - assemblyDate: fecha de la asamblea, si este documento es una modificación o protocolización.',
  '',
  '─── Cuadro accionario ───',
  '  Una fila por accionista o socio, aunque la tabla esté partida entre páginas.',
  '  - name: nombre completo.',
  '  - series: cada serie tal como está rotulada. capitalKind es FIXED si el encabezado dice capital fijo, VARIABLE si dice capital variable, UNSPECIFIED si no lo dice. No cambies la serie B a variable si el documento dice capital fijo.',
  '  - shareCount: número de acciones o partes de esa serie.',
  '  - nominalValue: valor nominal por acción.',
  '  - totalValue: valor total de las acciones de ese socio.',
  '  - percentage: porcentaje de participación de ese socio, ya sumadas sus series.',
  '  - relationshipToApplicant: parentesco con el solicitante solo si el texto lo dice (cónyuge, hijo, padre, madre, hermano). Si no lo dice, null.',
  '  - entryDate: fecha en que esa persona adquirió o suscribió las acciones, solo si el texto la dice (admisión, cesión o suscripción). Si el cuadro solo la lista y no dice cuándo entró, null. No copies la fecha de constitución ni la de la asamblea.',
  '',
  '─── Administración y poderes ───',
  '  - administrationType: SOLE si es administrador único, BOARD si es consejo de administración, UNKNOWN si no se identifica.',
  '  - administration: nombre y cargo de cada miembro.',
  '  - powers: por cada apoderado, si tiene facultades de administración, dominio y pleitos y cobranzas, y si esas facultades fueron revocadas. Si el documento no habla de poderes, dejá el arreglo vacío.',
  '',
  '─── Registro Público ───',
  '  - registry.folio: folio mercantil, boleta o número de inscripción.',
  '  - registry.date: fecha de inscripción.',
  '  - registry.place: lugar del registro.',
].join('\n');

const ARTICLES_RESPONSE_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    legalName: { type: 'string', nullable: true },
    legalForm: { type: 'string', nullable: true },
    rfc: { type: 'string', nullable: true },
    isNonProfit: { type: 'boolean', nullable: true },
    deedNumber: { type: 'string', nullable: true },
    deedDate: { type: 'string', nullable: true },
    notary: { type: 'string', nullable: true },
    incorporationDate: { type: 'string', nullable: true },
    assemblyDate: { type: 'string', nullable: true },
    administrationType: { type: 'string', nullable: true },
    shareholders: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          nominalValue: { type: 'number', nullable: true },
          totalValue: { type: 'number', nullable: true },
          percentage: { type: 'number', nullable: true },
          relationshipToApplicant: { type: 'string', nullable: true },
          entryDate: { type: 'string', nullable: true },
          series: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                label: { type: 'string' },
                capitalKind: { type: 'string', nullable: true },
                shareCount: { type: 'number', nullable: true },
              },
            },
          },
        },
        required: ['name'],
      },
    },
    administration: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          role: { type: 'string', nullable: true },
        },
        required: ['name'],
      },
    },
    powers: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          holderName: { type: 'string' },
          administration: { type: 'boolean', nullable: true },
          ownership: { type: 'boolean', nullable: true },
          litigation: { type: 'boolean', nullable: true },
          revoked: { type: 'boolean', nullable: true },
        },
        required: ['holderName'],
      },
    },
    registry: {
      type: 'object',
      properties: {
        folio: { type: 'string', nullable: true },
        date: { type: 'string', nullable: true },
        place: { type: 'string', nullable: true },
      },
    },
  },
  required: ['legalName', 'shareholders'],
};

@Injectable()
export class ArticlesExtractionService {
  private readonly logger = new Logger(ArticlesExtractionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly geminiService: GeminiService,
  ) {}

  static isArticlesDocument(code?: string | null): boolean {
    return isArticlesDocument(code);
  }

  async extract(caseId: string, documentId: string): Promise<ArticlesExtractionPayload> {
    const document = await this.prisma.document.findUnique({
      where: { id: documentId },
      include: {
        documentType: true,
        documentStatus: true,
        mortgageCase: { include: { client: true } },
      },
    });

    if (!document) {
      throw new Error(`Document ${documentId} not found`);
    }
    if (document.mortgageCaseId !== caseId) {
      throw new Error(`Document ${documentId} does not belong to case ${caseId}`);
    }

    const documentType = document.documentType?.code;
    if (!ArticlesExtractionService.isArticlesDocument(documentType)) {
      throw new Error(`Document type ${documentType} is not a corporate act`);
    }
    if (!document.ocrText || document.ocrText.trim() === '') {
      throw new Error(
        `Document ${documentId} has no OCR text. Ensure Document AI has processed it.`,
      );
    }

    const kind = actKindForDocumentType(documentType);
    const instructions = [
      ARTICLES_INSTRUCTIONS,
      kind === 'AMENDMENT'
        ? 'Este PDF es un acta de modificación de poderes, protocolización o asamblea. Si no cambia el capital, shareholders puede ir vacío.'
        : 'Este PDF es el acta constitutiva. incorporationDate es la fecha de constitución de la sociedad.',
    ].join('\n\n');

    const result = await this.geminiService.extractStructuredData(
      document.ocrText,
      documentType,
      ARTICLES_RESPONSE_SCHEMA,
      instructions,
    );

    if (!result.success || !result.extractedData) {
      const errCode = result.error?.code ?? GeminiErrorCode.GEMINI_REQUEST_ERROR;
      const errMsg = result.error?.message ?? 'Gemini articles extraction failed';
      this.logger.error(
        `[Articles] Extraction failed for doc ${documentId}: ${errCode} - ${errMsg}`,
      );
      throw new Error(`${errCode}: ${errMsg}`);
    }

    const payload = postProcessArticles(result.extractedData, {
      documentType: documentType as ArticlesDocumentType,
      applicantName: document.mortgageCase?.client?.fullName ?? null,
    });

    const processedStatus = await this.prisma.documentStatus.findUnique({
      where: { code: 'PROCESSED' },
    });

    await this.prisma.document.update({
      where: { id: documentId },
      data: {
        extractedData: payload as unknown as object,
        documentStatusId: processedStatus?.id ?? document.documentStatusId,
      },
    });

    this.logger.log(`[Articles] Saved corporate act extraction for doc ${documentId}`);
    return payload;
  }
}
