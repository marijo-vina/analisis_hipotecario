import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from './../src/app.module';
import { PrismaService } from './../src/prisma/prisma.service';
import { GcsService } from './../src/documents/gcs.service';
import { DocumentAiService } from './../src/documents/document-ai.service';

describe('Document Process (e2e)', () => {
  let app: INestApplication;
  let authToken: string;
  let prisma: PrismaService;
  let caseId: string;
  let adminId: string;

  // Mock GCS and Document AI — E2E tests should not call real GCP
  const mockGcsService = {
    uploadFile: jest.fn(),
    generateSignedUrl: jest.fn(),
    deleteFile: jest.fn(),
  };

  const mockDocumentAiService = {
    extractText: jest.fn().mockResolvedValue('E2E extracted text'),
  };

  const loginAsAdmin = async () => {
    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@gestion.com', password: 'admin123' });
    return loginResponse.body.access_token as string;
  };

  /**
   * Creates a document with the given status code via direct Prisma access.
   * For PROCESSED status, sets ocrText and processedAt to simulate prior processing.
   */
  const seedDocument = async (statusCode: string) => {
    const status = await prisma.documentStatus.findUnique({
      where: { code: statusCode },
    });
    if (!status) throw new Error(`Status ${statusCode} not found`);

    const docType = await prisma.documentType.findUnique({
      where: { code: 'PAYROLL_RECEIPT' },
    });
    if (!docType) throw new Error('Document type PAYROLL_RECEIPT not found');

    const doc = await prisma.document.create({
      data: {
        mortgageCaseId: caseId,
        documentTypeId: docType.id,
        documentStatusId: status.id,
        originalName: 'e2e-test-doc.pdf',
        uploadedById: adminId,
        fileUrl: 'gs://fake-bucket/e2e-test-doc.pdf',
        mimeType: 'application/pdf',
        storagePath: 'e2e/test-doc.pdf',
        ...(statusCode === 'PROCESSED'
          ? {
              ocrText: 'Old OCR text from prior processing',
              processedAt: new Date('2026-01-01T00:00:00Z'),
            }
          : {}),
      },
    });

    return doc;
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GcsService)
      .useValue(mockGcsService)
      .overrideProvider(DocumentAiService)
      .useValue(mockDocumentAiService)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();

    prisma = app.get(PrismaService);
    authToken = await loginAsAdmin();

    // Ensure all document statuses exist (test DB may have a partial seed)
    const requiredStatuses = [
      { code: 'UPLOADED', name: 'Cargado', order: 1 },
      { code: 'PENDING_REVIEW', name: 'Pendiente de revisión', order: 2 },
      { code: 'PROCESSING', name: 'En procesamiento', order: 3 },
      { code: 'PROCESSED', name: 'Procesado', order: 4 },
      { code: 'ERROR', name: 'Error', order: 5 },
      { code: 'EXTRACTION_READY', name: 'Extracción pendiente', order: 6 },
      { code: 'EXTRACTION_ERROR', name: 'Error de extracción', order: 7 },
      { code: 'OCR_ERROR', name: 'Error de OCR', order: 8 },
    ];
    for (const s of requiredStatuses) {
      await prisma.documentStatus.upsert({
        where: { code: s.code },
        update: { name: s.name, order: s.order },
        create: s,
      });
    }

    // Fetch admin user ID for document seeding
    const admin = await prisma.user.findUnique({
      where: { email: 'admin@gestion.com' },
    });
    adminId = admin!.id;

    // Create a client for the test mortgage case
    const client = await prisma.client.create({
      data: {
        firstName: 'E2E',
        paternalLastName: 'Process',
        fullName: 'E2E Process',
        email: `e2e.process.${Date.now()}@example.com`,
        phone: '5511112222',
      },
    });

    // Get credit type
    const creditType = await prisma.creditType.findUnique({
      where: { code: 'COMPRA' },
    });

    // Get case status PENDING_DOCUMENTS
    const caseStatus = await prisma.caseStatus.findUnique({
      where: { code: 'PENDING_DOCUMENTS' },
    });

    // Create the mortgage case fixture
    const mortgageCase = await prisma.mortgageCase.create({
      data: {
        clientId: client.id,
        advisorId: adminId,
        creditTypeId: creditType!.id,
        statusId: caseStatus!.id,
      },
    });
    caseId = mortgageCase.id;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /mortgage-cases/:caseId/documents/:documentId/process', () => {
    it('should return 401 without auth token', async () => {
      await request(app.getHttpServer())
        .post(`/mortgage-cases/${caseId}/documents/fake-id/process`)
        .expect(401);
    });

    describe('Happy path — UPLOADED → PROCESSED (Task 5.2)', () => {
      it('should process an UPLOADED document and return 200 with ocrText populated', async () => {
        // Seed document in UPLOADED status
        const doc = await seedDocument('UPLOADED');

        const response = await request(app.getHttpServer())
          .post(`/mortgage-cases/${caseId}/documents/${doc.id}/process`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Verify response envelope
        expect(response.body).toHaveProperty('data');
        expect(response.body.data.documentStatus.code).toBe('PROCESSED');
        expect(response.body.data.ocrText).toBe('E2E extracted text');
        expect(response.body.data.processedAt).not.toBeNull();
      });
    });

    describe('Force reprocess — PROCESSED → ?force=true (Task 5.3)', () => {
      it('should reprocess a PROCESSED document when force=true and return 200 with updated ocrText', async () => {
        // Seed document in PROCESSED status with old OCR text
        const doc = await seedDocument('PROCESSED');

        // Change the mock to return a different value so we can assert the update
        mockDocumentAiService.extractText.mockResolvedValue('Updated E2E extracted text');

        const response = await request(app.getHttpServer())
          .post(
            `/mortgage-cases/${caseId}/documents/${doc.id}/process?force=true`,
          )
          .set('Authorization', `Bearer ${authToken}`)
          .expect(200);

        // Verify gate was bypassed and document was reprocessed
        expect(response.body.data.documentStatus.code).toBe('PROCESSED');
        expect(response.body.data.ocrText).toBe('Updated E2E extracted text');
        expect(response.body.data.processedAt).not.toBeNull();

        // Reset mock to default for subsequent tests
        mockDocumentAiService.extractText.mockResolvedValue('E2E extracted text');
      });
    });

    describe('Force blocked — PROCESSING → ?force=true (Task 5.4)', () => {
      it('should reject with 400 when document is PROCESSING even with force=true', async () => {
        // Seed document in PROCESSING status
        const doc = await seedDocument('PROCESSING');

        const response = await request(app.getHttpServer())
          .post(
            `/mortgage-cases/${caseId}/documents/${doc.id}/process?force=true`,
          )
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        // Verify the correct error message — PROCESSING gate is unconditional
        expect(response.body.message).toBe(
          'Document is already being processed',
        );
      });
    });

    describe('No-force blocked — PROCESSED → no force (Task 5.5)', () => {
      it('should reject with 400 when document is PROCESSED and force is not provided', async () => {
        // Seed document in PROCESSED status
        const doc = await seedDocument('PROCESSED');

        const response = await request(app.getHttpServer())
          .post(`/mortgage-cases/${caseId}/documents/${doc.id}/process`)
          .set('Authorization', `Bearer ${authToken}`)
          .expect(400);

        // Verify the correct error message — PROCESSED gate is enforced without force
        expect(response.body.message).toBe(
          'Document has already been processed',
        );
      });
    });
  });
});
