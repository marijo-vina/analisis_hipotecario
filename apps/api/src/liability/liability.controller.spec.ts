import {
  NotFoundException,
  ValidationPipe,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import {
  INestApplication,
} from '@nestjs/common';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { LiabilityController } from './liability.controller';
import { LiabilityCalculationService } from './liability.service';
import {
  GlobalLiabilityStatus,
  LiabilityStatus,
  CreditNature,
  ClassificationSource,
  RuleApplied,
  InstitutionCategory,
  type LiabilityCalculationResult,
} from './liability.types';

// ── Mock factory helpers ──────────────────────────────────────────────────

/** A bureau-extracted credit record as it appears in `extractedData.credits`. */
function makeBureauCredit(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    institution: 'BBVA',
    accountNumber: '1234567890',
    creditType: 'TARJETA DE CREDITO',
    classification: 'REVOLVING',
    status: 'ACTIVE',
    currentBalance: 100000.0,
    paymentDueAmount: 5000.0,
    isClosed: false,
    ...overrides,
  };
}

/** A full LiabilityCalculationResult returned by the service. */
function makeCalculationResult(
  overrides: Partial<LiabilityCalculationResult> = {},
): LiabilityCalculationResult {
  return {
    id: 'snap-1',
    caseId: 'case-uuid-1',
    calculatedAt: '2026-07-15T12:00:00.000Z',
    factorUsed: 0.06,
    rulesVersion: '2024.1',
    credits: [
      {
        creditReference: '1234567890',
        institution: 'BBVA',
        creditType: 'TARJETA DE CREDITO',
        classification: 'REVOLVING',
        status: 'ACTIVE',
        currentBalance: 100000,
        paymentDueAmountEffective: 5000,
        isClosed: false,
        monthlyDebtContribution: 6000,
        creditNature: CreditNature.REVOLVING,
        institutionCategory: InstitutionCategory.BANK,
        ruleApplied: RuleApplied.REVOLVING_STANDARD,
        liabilityStatus: LiabilityStatus.CALCULATED,
        classificationSource: ClassificationSource.EXTRACTED,
        classificationReason: null,
      },
    ],
    globalStatus: GlobalLiabilityStatus.CALCULATED,
    grossCurrentMonthlyDebt: 6000,
    totalCurrentBalance: 100000,
    ...overrides,
  };
}

describe('LiabilityController', () => {
  let app: INestApplication;
  let mockLiabilityService: {
    calculate: jest.Mock;
    getLatest: jest.Mock;
    overrideCredit: jest.Mock;
  };
  let mockPrisma: {
    mortgageCase: { findUnique: jest.Mock };
  };

  const caseId = 'case-uuid-1';

  /** Build a MortgageCase with a CREDIT_BUREAU_REPORT document. */
  const mortgageCaseWithBureau = {
    id: caseId,
    documents: [
      {
        id: 'doc-buro-1',
        documentType: { code: 'CREDIT_BUREAU_REPORT' },
        extractedData: {
          credits: [makeBureauCredit()],
        },
        createdAt: new Date('2026-07-10'),
      },
    ],
  };

  const mortgageCaseWithoutBureau = {
    id: caseId,
    documents: [],
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockLiabilityService = {
      calculate: jest.fn(),
      getLatest: jest.fn(),
      overrideCredit: jest.fn(),
    };

    mockPrisma = {
      mortgageCase: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [LiabilityController],
      providers: [
        {
          provide: LiabilityCalculationService,
          useValue: mockLiabilityService,
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    })
      // Bypass JwtAuthGuard so tests don't need auth tokens
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    app = module.createNestApplication({
      // Global ValidationPipe so DTOs with class-validator produce 400 errors
      // builder pattern is available in NestJS 11
    } as Parameters<TestingModule['createNestApplication']>[0]);

    // Register the ValidationPipe globally via useGlobalPipes
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
    // The controller class exists and is registered
    expect(LiabilityController).toBeDefined();
  });

  it('should protect all endpoints with JwtAuthGuard', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, LiabilityController);
    expect(guards).toEqual([JwtAuthGuard]);
  });

  // ── POST /cases/:caseId/liability/calculate ──────────────────────────

  describe('POST /cases/:caseId/liability/calculate', () => {
    it('should return 201 with the calculation result', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue(
        mortgageCaseWithBureau,
      );
      const result = makeCalculationResult();
      mockLiabilityService.calculate.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .post(`/cases/${caseId}/liability/calculate`)
        .expect(201);

      expect(response.body).toMatchObject({
        id: 'snap-1',
        caseId,
        factorUsed: 0.06,
        rulesVersion: '2024.1',
        globalStatus: 'CALCULATED',
      });

      // Service must have been called with the extracted id and mapped credits
      expect(mockLiabilityService.calculate).toHaveBeenCalledTimes(1);
      const [passedCaseId, passedCredits] =
        mockLiabilityService.calculate.mock.calls[0];
      expect(passedCaseId).toBe(caseId);
      expect(passedCredits).toHaveLength(1);
      expect(passedCredits[0]).toMatchObject({
        creditReference: '1234567890',
        institution: 'BBVA',
        creditType: 'TARJETA DE CREDITO',
        currentBalance: 100000,
        paymentDueAmountEffective: 5000,
        isClosed: false,
      });
    });

    it('should map extractedData credits to LiabilityCreditInput (paymentDueAmount → paymentDueAmountEffective)', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue({
        id: caseId,
        documents: [
          {
            id: 'doc-1',
            documentType: { code: 'CREDIT_BUREAU_REPORT' },
            createdAt: new Date(),
            extractedData: {
              credits: [
                makeBureauCredit({
                  accountNumber: 'ACC-999',
                  paymentDueAmount: 3500,
                  currentBalance: 50000,
                }),
              ],
            },
          },
        ],
      });

      mockLiabilityService.calculate.mockResolvedValue(
        makeCalculationResult(),
      );

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/liability/calculate`)
        .expect(201);

      const credits = mockLiabilityService.calculate.mock.calls[0][1];
      expect(credits[0].creditReference).toBe('ACC-999');
      expect(credits[0].paymentDueAmountEffective).toBe(3500);
    });

    it('should return 404 when case not found', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/liability/calculate`)
        .expect(404);
    });

    it('should return 404 when no bureau credits extracted', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue(
        mortgageCaseWithoutBureau,
      );

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/liability/calculate`)
        .expect(404);
    });

    it('should tolerate null extractedData gracefully', async () => {
      mockPrisma.mortgageCase.findUnique.mockResolvedValue({
        id: caseId,
        documents: [
          {
            id: 'doc-1',
            documentType: { code: 'CREDIT_BUREAU_REPORT' },
            createdAt: new Date(),
            extractedData: null,
          },
        ],
      });

      await request(app.getHttpServer())
        .post(`/cases/${caseId}/liability/calculate`)
        .expect(404);
    });
  });

  // ── GET /cases/:caseId/liability/latest ──────────────────────────────

  describe('GET /cases/:caseId/liability/latest', () => {
    it('should return 200 with latest snapshot when it exists', async () => {
      const result = makeCalculationResult();
      mockLiabilityService.getLatest.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .get(`/cases/${caseId}/liability/latest`)
        .expect(200);

      expect(response.body).toMatchObject({
        id: 'snap-1',
        caseId,
        globalStatus: 'CALCULATED',
      });
      expect(mockLiabilityService.getLatest).toHaveBeenCalledWith(caseId);
    });

    it('should return 404 when no snapshot exists', async () => {
      mockLiabilityService.getLatest.mockResolvedValue(null);

      await request(app.getHttpServer())
        .get(`/cases/${caseId}/liability/latest`)
        .expect(404);
    });
  });

  // ── PATCH /cases/:caseId/liability/credits/:creditIndex ──────────────

  describe('PATCH /cases/:caseId/liability/credits/:creditIndex', () => {
    const validBody = {
      creditNature: 'FIXED',
      currentBalance: 80000,
      paymentDueAmountEffective: 3000,
      reason: 'Cambio de naturaleza',
    };

    it('should return 200 with updated snapshot when body is valid', async () => {
      const result = makeCalculationResult({
        id: 'snap-2',
        globalStatus: GlobalLiabilityStatus.CALCULATED,
      });
      mockLiabilityService.overrideCredit.mockResolvedValue(result);

      const response = await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/0`)
        .send(validBody)
        .expect(200);

      expect(response.body).toMatchObject({ id: 'snap-2' });
      expect(mockLiabilityService.overrideCredit).toHaveBeenCalledWith(
        caseId,
        0,
        expect.objectContaining({
          creditNature: 'FIXED',
          currentBalance: 80000,
          paymentDueAmountEffective: 3000,
          reason: 'Cambio de naturaleza',
        }),
      );
    });

    it('should return 400 when reason is missing', async () => {
      const { reason: _reason, ...bodyWithoutReason } = validBody;

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/0`)
        .send(bodyWithoutReason)
        .expect(400);
    });

    it('should return 400 when reason is too short (under 10 chars)', async () => {
      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/0`)
        .send({ ...validBody, reason: 'short' })
        .expect(400);
    });

    it('should return 400 when creditNature is not in allowed values', async () => {
      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/0`)
        .send({ ...validBody, creditNature: 'INVALID' })
        .expect(400);
    });

    it('should propagate NotFoundException when no snapshot exists', async () => {
      mockLiabilityService.overrideCredit.mockRejectedValue(
        new NotFoundException('No liability snapshot found for this case'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/0`)
        .send(validBody)
        .expect(404);
    });

    it('should propagate NotFoundException for out-of-range creditIndex', async () => {
      mockLiabilityService.overrideCredit.mockRejectedValue(
        new NotFoundException('Credit index 99 out of range'),
      );

      await request(app.getHttpServer())
        .patch(`/cases/${caseId}/liability/credits/99`)
        .send(validBody)
        .expect(404);
    });
  });
});