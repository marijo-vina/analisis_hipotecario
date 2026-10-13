import { Test, TestingModule } from '@nestjs/testing';
import { ArticlesExtractionService } from './articles-extraction.service';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from './gemini.service';

describe('ArticlesExtractionService', () => {
  let service: ArticlesExtractionService;
  const prisma = {
    document: { findUnique: jest.fn(), update: jest.fn() },
    documentStatus: { findUnique: jest.fn() },
  };
  const gemini = { extractStructuredData: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ArticlesExtractionService,
        { provide: PrismaService, useValue: prisma },
        { provide: GeminiService, useValue: gemini },
      ],
    }).compile();
    service = module.get(ArticlesExtractionService);
  });

  it('recognizes the constitutive act and the powers amendment', () => {
    expect(ArticlesExtractionService.isArticlesDocument('ARTICLES_OF_INCORPORATION')).toBe(true);
    expect(ArticlesExtractionService.isArticlesDocument('CORPORATE_AMENDMENT')).toBe(true);
    expect(ArticlesExtractionService.isArticlesDocument('CSF')).toBe(false);
  });

  it('saves the applicant participation without writing the case fields', async () => {
    prisma.document.findUnique.mockResolvedValue({
      id: 'doc-1',
      mortgageCaseId: 'case-1',
      ocrText: 'capital social',
      documentStatusId: 4,
      documentType: { code: 'CORPORATE_AMENDMENT' },
      mortgageCase: { client: { fullName: 'Edgardo González Higuera' } },
    });
    prisma.documentStatus.findUnique.mockResolvedValue({ id: 8 });
    gemini.extractStructuredData.mockResolvedValue({
      success: true,
      extractedData: {
        legalName: 'MODIEBO',
        shareholders: [
          { name: 'EDGARDO GONZALEZ HIGUERA', percentage: 51 },
          { name: 'JOSE RICARDO BORBOA QUINTERO', percentage: 49 },
        ],
        registry: { date: '2011-07-15' },
      },
    });

    const payload = await service.extract('case-1', 'doc-1');

    expect(payload.applicantSharePercentage).toBe(51);
    expect(prisma.document.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'doc-1' },
        data: expect.objectContaining({ documentStatusId: 8 }),
      }),
    );
    expect(prisma.document.update.mock.calls[0][0].data).not.toHaveProperty('sharePercentage');
  });
});
