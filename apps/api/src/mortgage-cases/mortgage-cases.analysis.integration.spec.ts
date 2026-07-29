import { INestApplication, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseAnalysisService } from '../case-analysis/case-analysis.service';
import { PrismaService } from '../prisma/prisma.service';
import { MortgageCasesController } from './mortgage-cases.controller';
import { MortgageCasesService } from './mortgage-cases.service';

describe('MortgageCasesController — analysis endpoints (integration)', () => {
  let app: INestApplication;

  const mockMortgageCasesService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
  };

  const mockCaseAnalysisService = {
    run: jest.fn(),
    getLatest: jest.fn(),
  };

  const mockPrismaService = {};

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MortgageCasesController],
      providers: [
        { provide: MortgageCasesService, useValue: mockMortgageCasesService },
        { provide: CaseAnalysisService, useValue: mockCaseAnalysisService },
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => Record<string, unknown> } }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'advisor-1' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  describe('POST /mortgage-cases/:caseId/analyze', () => {
    it('returns 200 with AnalysisResult shape on success', async () => {
      const analysisResult = {
        runId: 'run-1',
        executionStatus: 'COMPLETED',
        outcome: 'PASS',
        summary: 'Análisis completado con resultado: PASS.',
        detail: { sources: ['official-id', 'payroll', 'client'], fields: [] },
        executionMetadata: { timestamp: '2026-07-09T12:00:00.000Z', triggeredBy: 'advisor-1' },
      };
      mockCaseAnalysisService.run.mockResolvedValue(analysisResult);

      const response = await request(app.getHttpServer())
        .post('/mortgage-cases/case-1/analyze')
        .set('Authorization', 'Bearer fake');

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          runId: 'run-1',
          executionStatus: 'COMPLETED',
          outcome: 'PASS',
          detail: expect.objectContaining({
            sources: expect.arrayContaining(['official-id']),
          }),
          executionMetadata: expect.objectContaining({ triggeredBy: 'advisor-1' }),
        }),
      );
      expect(mockCaseAnalysisService.run).toHaveBeenCalledWith('case-1', expect.any(String));
    });

    it('returns 200 with FAIL outcome and IDENTITY_MISMATCH alert', async () => {
      const analysisResult = {
        runId: 'run-2',
        executionStatus: 'COMPLETED',
        outcome: 'FAIL',
        summary: 'fail',
        detail: { sources: ['official-id', 'payroll'], fields: [] },
        executionMetadata: { timestamp: '2026-07-09T12:00:00.000Z', triggeredBy: 'advisor-1' },
      };
      mockCaseAnalysisService.run.mockResolvedValue(analysisResult);

      const response = await request(app.getHttpServer())
        .post('/mortgage-cases/case-1/analyze')
        .set('Authorization', 'Bearer fake');

      expect(response.status).toBe(200);
      expect(response.body.outcome).toBe('FAIL');
      expect(response.body.executionStatus).toBe('COMPLETED');
    });

    it('returns 404 when the case does not exist', async () => {
      mockCaseAnalysisService.run.mockRejectedValue(
        new NotFoundException('Mortgage case not found'),
      );

      const response = await request(app.getHttpServer())
        .post('/mortgage-cases/nonexistent/analyze')
        .set('Authorization', 'Bearer fake');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Mortgage case not found');
    });
  });

  describe('GET /mortgage-cases/:caseId/analysis/latest', () => {
    it('returns 200 with the most recent AnalysisRun when one exists', async () => {
      const run = {
        id: 'run-2',
        executionStatus: 'COMPLETED',
        outcome: 'PASS',
        detail: { sources: ['official-id'], fields: [] },
        alerts: [],
      };
      mockCaseAnalysisService.getLatest.mockResolvedValue(run);

      const response = await request(app.getHttpServer())
        .get('/mortgage-cases/case-1/analysis/latest')
        .set('Authorization', 'Bearer fake');

      expect(response.status).toBe(200);
      expect(response.body.id).toBe('run-2');
      expect(mockCaseAnalysisService.getLatest).toHaveBeenCalledWith('case-1');
    });

    it('returns 404 with "No analysis runs found" when no runs exist', async () => {
      mockCaseAnalysisService.getLatest.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/mortgage-cases/case-1/analysis/latest')
        .set('Authorization', 'Bearer fake');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('No analysis runs found');
    });
  });
});