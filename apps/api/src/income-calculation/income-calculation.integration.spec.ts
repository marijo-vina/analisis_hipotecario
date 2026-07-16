import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { IncomeCalculationController } from './income-calculation.controller';
import { IncomeCalculationService } from './income-calculation.service';
import {
  IncomeCalculationStatus,
  type IncomeCalculationResult,
  type IncomeReceiptResult,
} from './income-calculation.types';

// ── Test fixtures ─────────────────────────────────────────────────────────

/**
 * Three payroll receipts seeded for the integration lifecycle.
 * Gross: 10000, 20000, 30000 → avg 20000
 * Net:   8000,  16000, 24000 → avg 16000
 */
function makeSeededReceipts(): IncomeReceiptResult[] {
  return [
    {
      documentId: 'doc-1',
      period: 'Mayo 2025',
      paymentDate: '2025-05-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 10000,
      netIncome: 8000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
    {
      documentId: 'doc-2',
      period: 'Junio 2025',
      paymentDate: '2025-06-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 20000,
      netIncome: 16000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
    {
      documentId: 'doc-3',
      period: 'Julio 2025',
      paymentDate: '2025-07-15',
      employer: 'ACME CORP',
      employerRfc: 'ACME123456789',
      grossIncome: 30000,
      netIncome: 24000,
      conciliationStatus: null,
      reviewStatus: null,
      included: true,
    },
  ];
}

function makeCalculatedResult(
  overrides: Partial<IncomeCalculationResult> = {},
): IncomeCalculationResult {
  return {
    id: 'inc-1',
    caseId: 'case-integration-1',
    calculatedAt: '2026-07-16T10:00:00.000Z',
    receiptResults: makeSeededReceipts(),
    averageGrossIncome: 20000,
    averageNetIncome: 16000,
    confirmedGrossIncome: null,
    confirmedNetIncome: null,
    receiptCount: 3,
    includedCount: 3,
    status: IncomeCalculationStatus.CALCULATED,
    confirmedBy: null,
    confirmedAt: null,
    observations: null,
    ...overrides,
  };
}

// ── Integration test ──────────────────────────────────────────────────────

describe('IncomeCalculationController — full lifecycle (integration)', () => {
  let app: INestApplication;
  let mockService: {
    calculate: jest.Mock;
    getLatest: jest.Mock;
    toggleReceipt: jest.Mock;
    confirm: jest.Mock;
  };

  const caseId = 'case-integration-1';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockService = {
      calculate: jest.fn(),
      getLatest: jest.fn(),
      toggleReceipt: jest.fn(),
      confirm: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncomeCalculationController],
      providers: [
        { provide: IncomeCalculationService, useValue: mockService },
      ],
    })
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

  // ── Full lifecycle: POST → GET → PATCH → POST/confirm ────────────────

  describe('Full lifecycle', () => {
    it('step 1: POST /calculate → 201, CALCULATED, all receipts included', async () => {
      const calculated = makeCalculatedResult();
      mockService.calculate.mockResolvedValue(calculated);

      const response = await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .expect(201);

      expect(response.body.status).toBe('CALCULATED');
      expect(response.body.receiptCount).toBe(3);
      expect(response.body.includedCount).toBe(3);
      expect(response.body.averageGrossIncome).toBe(20000);
      expect(response.body.averageNetIncome).toBe(16000);
      expect(response.body.receiptResults).toHaveLength(3);
      expect(response.body.confirmedGrossIncome).toBeNull();
      expect(response.body.confirmedNetIncome).toBeNull();
      expect(mockService.calculate).toHaveBeenCalledWith(caseId, []);
    });

    it('step 2: GET /latest → returns the same snapshot', async () => {
      const calculated = makeCalculatedResult();
      mockService.getLatest.mockResolvedValue(calculated);

      const response = await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/latest`)
        .expect(200);

      expect(response.body.id).toBe('inc-1');
      expect(response.body.status).toBe('CALCULATED');
      expect(response.body.receiptCount).toBe(3);
      expect(response.body.averageGrossIncome).toBe(20000);
      expect(response.body.averageNetIncome).toBe(16000);
      expect(mockService.getLatest).toHaveBeenCalledWith(caseId);
    });

    it('step 3: PATCH /receipts/0 → receipt 0 excluded, averages recalculated', async () => {
      // After excluding doc-1 (10k): avg = (20k+30k)/2 = 25k gross, (16k+24k)/2 = 20k net
      const receipts = makeSeededReceipts();
      receipts[0] = { ...receipts[0], included: false };

      const toggled: IncomeCalculationResult = {
        ...makeCalculatedResult(),
        id: 'inc-2',
        receiptResults: receipts,
        averageGrossIncome: 25000,
        averageNetIncome: 20000,
        includedCount: 2,
      };
      mockService.toggleReceipt.mockResolvedValue(toggled);

      const response = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/0`)
        .send({ included: false })
        .expect(200);

      expect(response.body.id).toBe('inc-2');
      expect(response.body.averageGrossIncome).toBe(25000);
      expect(response.body.averageNetIncome).toBe(20000);
      expect(response.body.includedCount).toBe(2);
      expect(response.body.receiptCount).toBe(3);
      expect(response.body.receiptResults[0].included).toBe(false);
      expect(response.body.receiptResults[1].included).toBe(true);
      expect(response.body.receiptResults[2].included).toBe(true);
      expect(mockService.toggleReceipt).toHaveBeenCalledWith(caseId, 0, false);
    });

    it('step 4: POST /confirm → 200, CONFIRMED, confirmed values stored, averages unchanged', async () => {
      // After toggle, averages are 25k/20k; confirm with 25k/20k
      const receipts = makeSeededReceipts();
      receipts[0] = { ...receipts[0], included: false };

      const confirmed: IncomeCalculationResult = {
        ...makeCalculatedResult(),
        id: 'inc-3',
        receiptResults: receipts,
        averageGrossIncome: 25000,
        averageNetIncome: 20000,
        includedCount: 2,
        status: IncomeCalculationStatus.CONFIRMED,
        confirmedGrossIncome: 25000,
        confirmedNetIncome: 20000,
        confirmedBy: 'advisor-1',
        confirmedAt: '2026-07-16T12:00:00.000Z',
        observations: 'OK',
      };
      mockService.confirm.mockResolvedValue(confirmed);

      const response = await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/confirm`)
        .send({
          confirmedGrossIncome: 25000,
          confirmedNetIncome: 20000,
          observations: 'OK',
        })
        .expect(200);

      expect(response.body.status).toBe('CONFIRMED');
      expect(response.body.confirmedGrossIncome).toBe(25000);
      expect(response.body.confirmedNetIncome).toBe(20000);
      expect(response.body.confirmedBy).toBe('advisor-1');
      expect(response.body.observations).toBe('OK');
      // Averages must remain the calculated values (25k/20k), not overwritten
      expect(response.body.averageGrossIncome).toBe(25000);
      expect(response.body.averageNetIncome).toBe(20000);
      expect(mockService.confirm).toHaveBeenCalledWith(
        caseId,
        expect.objectContaining({
          confirmedGrossIncome: 25000,
          confirmedNetIncome: 20000,
          observations: 'OK',
        }),
        'advisor-1',
      );
    });

    it('full chain: POST → GET → PATCH → POST/confirm in sequence', async () => {
      // Step 1: calculate
      const calculated = makeCalculatedResult();
      mockService.calculate.mockResolvedValue(calculated);

      const calcRes = await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/calculate`)
        .expect(201);
      expect(calcRes.body.status).toBe('CALCULATED');

      // Step 2: get latest (returns same snapshot)
      mockService.getLatest.mockResolvedValue(calculated);

      const latestRes = await request(app.getHttpServer())
        .get(`/cases/${caseId}/income/latest`)
        .expect(200);
      expect(latestRes.body.id).toBe(calcRes.body.id);

      // Step 3: toggle receipt 0 → exclude
      const receipts = makeSeededReceipts();
      receipts[0] = { ...receipts[0], included: false };
      const toggled = makeCalculatedResult({
        id: 'inc-2',
        receiptResults: receipts,
        averageGrossIncome: 25000,
        averageNetIncome: 20000,
        includedCount: 2,
      });
      mockService.toggleReceipt.mockResolvedValue(toggled);

      const toggleRes = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/income/receipts/0`)
        .send({ included: false })
        .expect(200);
      expect(toggleRes.body.includedCount).toBe(2);

      // Step 4: confirm
      const confirmed = makeCalculatedResult({
        id: 'inc-3',
        receiptResults: receipts,
        averageGrossIncome: 25000,
        averageNetIncome: 20000,
        includedCount: 2,
        status: IncomeCalculationStatus.CONFIRMED,
        confirmedGrossIncome: 25000,
        confirmedNetIncome: 20000,
        confirmedBy: 'advisor-1',
        confirmedAt: '2026-07-16T12:00:00.000Z',
        observations: 'OK',
      });
      mockService.confirm.mockResolvedValue(confirmed);

      const confirmRes = await request(app.getHttpServer())
        .post(`/cases/${caseId}/income/confirm`)
        .send({
          confirmedGrossIncome: 25000,
          confirmedNetIncome: 20000,
          observations: 'OK',
        })
        .expect(200);
      expect(confirmRes.body.status).toBe('CONFIRMED');
      expect(confirmRes.body.confirmedGrossIncome).toBe(25000);
    });
  });
});
