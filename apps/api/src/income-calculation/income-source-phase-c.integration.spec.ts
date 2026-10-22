import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CaseAnalysisService } from '../case-analysis/case-analysis.service';
import type { RuleResult } from '../case-analysis/analysis-rule.interface';
import { BankarizationValidationRule } from '../case-analysis/rules/bankarization-validation.rule';
import { BankViabilityRule } from '../case-analysis/rules/bank-viability.rule';
import { IdentityMatchRule } from '../case-analysis/rules/identity-match.rule';
import { PfaeValidationRule } from '../case-analysis/rules/pfae-validation.rule';
import { PmCsfTaxRule } from '../case-analysis/rules/pm-csf-tax.rule';
import { PmGatesRule } from '../case-analysis/rules/pm-gates.rule';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';
import { LiabilityCalculationService } from '../liability/liability.service';
import { PrismaService } from '../prisma/prisma.service';
import { IncomeCalculationController } from './income-calculation.controller';
import { IncomeCalculationService } from './income-calculation.service';
import {
  IncomeCalculationStatus,
  type PfaeIncomeBases,
} from './income-calculation.types';

const CASE_ID = 'case-pfae-source';

const pfaeBases: PfaeIncomeBases = {
  bank: {
    valid: true,
    invalidReason: null,
    monthlyGross: 15,
    monthlyNet: 15,
    windowMonths: 6,
    monthsUsed: ['2024-02', '2024-03', '2024-04', '2024-05'],
    droppedMax: '2024-06',
    droppedMin: '2024-01',
  },
  taxReturn: {
    valid: true,
    invalidReason: null,
    monthlyGross: 20000,
    monthlyNet: 10000,
  },
  activity: {
    description: 'Consultoría profesional',
    percentage: 100,
    order: 1,
    matchedKeyword: null,
    windowMonths: 6,
  },
};

const identityResult: RuleResult = {
  ruleId: 'identity-match',
  outcome: 'PASS',
  severity: 'INFO',
  detail: { sources: ['official-id'], fields: [] },
  alerts: [],
};

const pfaeValidationResult: RuleResult = {
  ruleId: 'pfae-validation',
  outcome: 'PASS',
  severity: 'INFO',
  detail: { sources: ['csf'], fields: [], pfaeValidation: { copied: true } },
  alerts: [],
};

const staleViability: RuleResult = {
  ruleId: 'bank-viability',
  outcome: 'PASS',
  severity: 'INFO',
  detail: {
    sources: ['mortgage-case'],
    fields: [],
    bankViability: { sourceVersion: 'STALE', bankResults: [] },
  },
  alerts: [],
};

const freshViability: RuleResult = {
  ruleId: 'bank-viability',
  outcome: 'PASS',
  severity: 'INFO',
  detail: {
    sources: ['income-calculation', 'bank-catalog'],
    fields: [],
    bankViability: {
      sourceVersion: 'ANAQUEL_MAYO_2026',
      bankResults: [{ bankCode: 'BANORTE' }],
    },
  },
  alerts: [],
};

describe('PATCH income source → Phase C (integration)', () => {
  let app: INestApplication;

  const mockPrisma = {
    mortgageCase: { findUnique: jest.fn() },
    incomeCalculation: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    analysisRun: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };

  const mockIdentityMatchRule = { ruleId: 'identity-match', execute: jest.fn() };
  const mockBankarizationRule = {
    ruleId: 'bankarization-validation',
    execute: jest.fn(),
  };
  const mockPfaeValidationRule = {
    ruleId: 'pfae-validation',
    execute: jest.fn(),
  };
  const mockBankViabilityRule = {
    ruleId: 'bank-viability',
    execute: jest.fn(),
  };
  const mockLiabilityCalcService = { calculate: jest.fn() };
  const mockCaseStatusCalculator = { recalculate: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma.mortgageCase.findUnique.mockImplementation(
      (args: { select?: { personType?: boolean } }) => {
        if (args?.select?.personType) {
          return Promise.resolve({ personType: 'PFAE' });
        }
        return Promise.resolve({
          id: CASE_ID,
          personType: 'PFAE',
          client: { id: 'client-1', fullName: 'JOSE PEREZ' },
          documents: [],
        });
      },
    );
    mockPrisma.incomeCalculation.findFirst.mockResolvedValue({
      id: 'inc-prior',
      mortgageCaseId: CASE_ID,
      calculatedAt: new Date('2026-09-01T10:00:00.000Z'),
      receiptResults: [],
      averageGrossIncome: 15,
      averageNetIncome: 15,
      confirmedGrossIncome: null,
      confirmedNetIncome: null,
      confirmedBy: null,
      confirmedAt: null,
      observations: null,
      status: IncomeCalculationStatus.CALCULATED,
      source: 'BANK_STATEMENTS',
      bases: pfaeBases,
    });
    mockPrisma.incomeCalculation.create.mockImplementation(
      (args: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'inc-switched',
          calculatedAt: new Date('2026-09-04T12:00:00.000Z'),
          confirmedGrossIncome: null,
          confirmedNetIncome: null,
          confirmedBy: null,
          confirmedAt: null,
          observations: null,
          receiptResults: [],
          ...args.data,
        }),
    );
    mockPrisma.analysisRun.findFirst.mockResolvedValue({
      id: 'run-prior',
      mortgageCaseId: CASE_ID,
      detail: {
        ruleResults: [identityResult, pfaeValidationResult, staleViability],
      },
    });
    mockPrisma.analysisRun.create.mockResolvedValue({ id: 'run-phase-c' });
    mockBankViabilityRule.execute.mockResolvedValue(freshViability);
    mockCaseStatusCalculator.recalculate.mockResolvedValue(undefined);

    const module: TestingModule = await Test.createTestingModule({
      controllers: [IncomeCalculationController],
      providers: [
        IncomeCalculationService,
        CaseAnalysisService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: IdentityMatchRule, useValue: mockIdentityMatchRule },
        {
          provide: BankarizationValidationRule,
          useValue: mockBankarizationRule,
        },
        { provide: PfaeValidationRule, useValue: mockPfaeValidationRule },
        { provide: PmCsfTaxRule, useValue: { ruleId: 'pm-csf-tax', execute: jest.fn() } },
        { provide: PmGatesRule, useValue: { ruleId: 'pm-gates', execute: jest.fn() } },
        { provide: BankViabilityRule, useValue: mockBankViabilityRule },
        {
          provide: LiabilityCalculationService,
          useValue: mockLiabilityCalcService,
        },
        {
          provide: CaseStatusCalculatorService,
          useValue: mockCaseStatusCalculator,
        },
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

  it('PATCH source creates a new IncomeCalculation and AnalysisRun with copied Phase A', async () => {
    const response = await request(app.getHttpServer())
      .patch(`/cases/${CASE_ID}/income/source`)
      .send({ source: 'TAX_RETURN' })
      .expect(200);

    expect(response.body).toMatchObject({
      id: 'inc-switched',
      caseId: CASE_ID,
      source: 'TAX_RETURN',
      averageGrossIncome: 20000,
      averageNetIncome: 10000,
      bases: pfaeBases,
    });

    expect(mockPrisma.incomeCalculation.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: 'TAX_RETURN',
          bases: pfaeBases,
        }),
      }),
    );

    expect(mockBankViabilityRule.execute).toHaveBeenCalledTimes(1);
    expect(mockIdentityMatchRule.execute).not.toHaveBeenCalled();
    expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
    expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
    expect(mockLiabilityCalcService.calculate).not.toHaveBeenCalled();

    const persistedRun = mockPrisma.analysisRun.create.mock.calls[0][0] as {
      data: { triggeredBy: string; detail: { ruleResults: RuleResult[] } };
    };
    expect(persistedRun.data.triggeredBy).toBe('advisor-1');
    expect(persistedRun.data.detail.ruleResults.map((r) => r.ruleId)).toEqual([
      'identity-match',
      'pfae-validation',
      'bank-viability',
    ]);
    expect(persistedRun.data.detail.ruleResults[1]).toEqual(pfaeValidationResult);
    expect(
      persistedRun.data.detail.ruleResults[2].detail.bankViability,
    ).toEqual(freshViability.detail.bankViability);
  });

  it('does not expose a second Analyze endpoint on the income controller', async () => {
    await request(app.getHttpServer())
      .post(`/cases/${CASE_ID}/income/analyze`)
      .expect(404);

    expect(mockIdentityMatchRule.execute).not.toHaveBeenCalled();
    expect(mockPrisma.analysisRun.create).not.toHaveBeenCalled();
  });
});
