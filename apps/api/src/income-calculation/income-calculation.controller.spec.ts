import {
  BadRequestException,
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IncomeCalculationController } from './income-calculation.controller';
import { IncomeCalculationService } from './income-calculation.service';
import { CaseAnalysisService } from '../case-analysis/case-analysis.service';
import {
  IncomeCalculationStatus,
  type IncomeCalculationResult,
} from './income-calculation.types';

// ── Mock factory helpers ──────────────────────────────────────────────────

/** A full `IncomeCalculationResult` returned by the service. */
function makeResult(
  overrides: Partial<IncomeCalculationResult> = {},
): IncomeCalculationResult {
  return {
    id: 'inc-1',
    caseId: 'case-uuid-1',
    calculatedAt: '2026-07-16T12:00:00.000Z',
    receiptResults: [
      {
        documentId: 'doc-1',
        period: 'Mayo 2025',
        paymentDate: '2025-05-15',
        employer: 'ACME',
        employerRfc: 'RFC1',
        grossIncome: 10000,
        netIncome: 8000,
        conciliationStatus: null,
        reviewStatus: null,
        included: true,
      },
    ],
    averageGrossIncome: 10000,
    averageNetIncome: 8000,
    confirmedGrossIncome: null,
    confirmedNetIncome: null,
    receiptCount: 1,
    includedCount: 1,
    status: IncomeCalculationStatus.CALCULATED,
    confirmedBy: null,
    confirmedAt: null,
    observations: null,
    ...overrides,
  };
}

describe('IncomeCalculationController', () => {
  let app: INestApplication;
  let mockService: {
    calculate: jest.Mock;
    getLatest: jest.Mock;
    toggleReceipt: jest.Mock;
    switchSource: jest.Mock;
    evaluateCompanyStatements: jest.Mock;
  };
  let mockCaseAnalysis: {
    runPhaseC: jest.Mock;
  };

  const caseId = 'case-uuid-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockService = {
      calculate: jest.fn(),
      getLatest: jest.fn(),
      toggleReceipt: jest.fn(),
      switchSource: jest.fn(),
      evaluateCompanyStatements: jest.fn(),
    };
    mockCaseAnalysis = {
      runPhaseC: jest.fn().mockResolvedValue({ runId: 'run-phase-c' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncomeCalculationController],
      providers: [
        {
          provide: IncomeCalculationService,
          useValue: mockService,
        },
        {
          provide: CaseAnalysisService,
          useValue: mockCaseAnalysis,
        },
      ],
    })
      // Bypass JwtAuthGuard AND populate req.user so the confirm endpoint
      // can read req.user.id (mirrors mortgage-cases analysis spec pattern).
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: {
          switchToHttp: () => { getRequest: () => Record<string, unknown> };
        }) => {
          const req = ctx.switchToHttp().getRequest();
          req.user = { id: 'advisor-1' };
          return true;
        },
      })
      .compile();

    app = module.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
    );
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── Structure / guard metadata ───────────────────────────────────────

  it('should be defined', () => {
    expect(IncomeCalculationController).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      IncomeCalculationController,
    );
    expect(guards).toEqual([JwtAuthGuard]);
  });

  describe('GET /cases/:caseId/income/company-statements', () => {
    it('returns the company statement rollup without calculating income', async () => {
      const rollup = {
        activity: { windowMonths: 6 },
        months: [{ monthKey: '2026-05', validDepositCount: 5 }],
        santanderDepositGate: { viable: true, status: 'VIABLE' },
      };
      mockService.evaluateCompanyStatements.mockResolvedValue(rollup);

      const response = await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/company-statements`)
        .expect(200);

      expect(response.body.santanderDepositGate.viable).toBe(true);
      expect(mockService.evaluateCompanyStatements).toHaveBeenCalledWith(caseId);
      expect(mockService.calculate).not.toHaveBeenCalled();
    });

    it('returns 404 when the case does not exist', async () => {
      mockService.evaluateCompanyStatements.mockRejectedValue(
        new NotFoundException('Mortgage case not found'),
      );

      await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/company-statements`)
        .expect(404);
    });
  });

  // ── POST /cases/:caseId/income/calculate ────────────────────────────

  describe('POST /cases/:caseId/income/calculate', () => {
    it('should return 201 with the calculation result', async () => {
      const result = makeResult();
      mockService.calculate.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'inc-1',
        caseId,
        status: 'CALCULATED',
        averageGrossIncome: 10000,
      });

      expect(mockService.calculate).toHaveBeenCalledTimes(1);
      expect(mockService.calculate).toHaveBeenCalledWith(caseId, []);
    });

    it('should pass excludedDocumentIds from body to service', async () => {
      mockService.calculate.mockResolvedValue(makeResult());

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .send({ excludedDocumentIds: ['doc-1'] })
        .expect(201);

      expect(mockService.calculate).toHaveBeenCalledWith(caseId, ['doc-1']);
    });

    it('should return 404 when no PAYROLL_RECEIPT docs exist', async () => {
      mockService.calculate.mockRejectedValue(
        new NotFoundException(
          'No PAYROLL_RECEIPT documents found for this case',
        ),
      );

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .expect(404);
    });

    it('should return 400 when zero receipts are included', async () => {
      mockService.calculate.mockRejectedValue(
        new BadRequestException('At least one receipt must be selected'),
      );

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .send({ excludedDocumentIds: ['doc-1', 'doc-2', 'doc-3'] })
        .expect(400);
    });
  });

  // ── GET /cases/:caseId/income/latest ─────────────────────────────────

  describe('GET /cases/:caseId/income/latest', () => {
    it('should return 200 with the latest snapshot', async () => {
      const result = makeResult({ id: 'inc-9' });
      mockService.getLatest.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/latest`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'inc-9',
        caseId,
        status: 'CALCULATED',
      });
      expect(mockService.getLatest).toHaveBeenCalledWith(caseId);
    });

    it('should return 404 when no snapshot exists', async () => {
      mockService.getLatest.mockRejectedValue(
        new NotFoundException('No income calculation found for this case'),
      );

      await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/latest`)
        .expect(404);
    });
  });

  // ── PATCH /cases/:caseId/income/receipts/:receiptIndex ──────────────

  describe('PATCH /cases/:caseId/income/receipts/:receiptIndex', () => {
    it('should return 200 with the updated snapshot', async () => {
      const result = makeResult({
        id: 'inc-2',
        averageGrossIncome: 15000,
        includedCount: 2,
      });
      mockService.toggleReceipt.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/2`)
        .send({ included: false })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'inc-2',
        averageGrossIncome: 15000,
      });
      expect(mockService.toggleReceipt).toHaveBeenCalledWith(caseId, 2, false);
    });

    it('should return 404 when snapshot does not exist', async () => {
      mockService.toggleReceipt.mockRejectedValue(
        new NotFoundException('No income calculation found for this case'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/0`)
        .send({ included: false })
        .expect(404);
    });

    it('should return 404 for out-of-range receipt index', async () => {
      mockService.toggleReceipt.mockRejectedValue(
        new NotFoundException('Receipt index 99 out of range'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/99`)
        .send({ included: true })
        .expect(404);
    });

    it('should return 400 when all receipts excluded via toggle', async () => {
      mockService.toggleReceipt.mockRejectedValue(
        new BadRequestException('At least one receipt must be selected'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/0`)
        .send({ included: false })
        .expect(400);
    });
  });

  // ── PATCH /cases/:caseId/income/source ───────────────────────────────

  describe('PATCH /cases/:caseId/income/source', () => {
    it('persists the switched snapshot then re-runs Phase C only', async () => {
      const switched = makeResult({
        id: 'inc-tax',
        source: 'TAX_RETURN',
        averageGrossIncome: 20000,
        averageNetIncome: 10000,
      });
      mockService.switchSource.mockResolvedValue(switched);

      const response = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/source`)
        .send({ source: 'TAX_RETURN' })
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'inc-tax',
        source: 'TAX_RETURN',
        averageGrossIncome: 20000,
        averageNetIncome: 10000,
      });
      expect(mockService.switchSource).toHaveBeenCalledWith(
        caseId,
        'TAX_RETURN',
      );
      expect(mockCaseAnalysis.runPhaseC).toHaveBeenCalledWith(
        caseId,
        'advisor-1',
      );
      expect(mockService.switchSource.mock.invocationCallOrder[0]).toBeLessThan(
        mockCaseAnalysis.runPhaseC.mock.invocationCallOrder[0],
      );
    });

    it('accepts BANK_STATEMENTS and still invokes runPhaseC', async () => {
      mockService.switchSource.mockResolvedValue(
        makeResult({ id: 'inc-bank', source: 'BANK_STATEMENTS' }),
      );

      const response = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/source`)
        .send({ source: 'BANK_STATEMENTS' })
        .expect(200);

      expect(response.body.source).toBe('BANK_STATEMENTS');
      expect(mockService.switchSource).toHaveBeenCalledWith(
        caseId,
        'BANK_STATEMENTS',
      );
      expect(mockCaseAnalysis.runPhaseC).toHaveBeenCalledTimes(1);
    });

    it('returns 400 when switchSource rejects an invalid chosen base', async () => {
      mockService.switchSource.mockRejectedValue(
        new BadRequestException('Cannot switch to TAX_RETURN: TAX_LOSS'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/source`)
        .send({ source: 'TAX_RETURN' })
        .expect(400);

      expect(mockCaseAnalysis.runPhaseC).not.toHaveBeenCalled();
    });

    it('returns 400 for PAYROLL or missing source (not a second Analyze path)', async () => {
      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/source`)
        .send({ source: 'PAYROLL' })
        .expect(400);

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/source`)
        .send({})
        .expect(400);

      expect(mockService.switchSource).not.toHaveBeenCalled();
      expect(mockCaseAnalysis.runPhaseC).not.toHaveBeenCalled();
    });
  });
});
