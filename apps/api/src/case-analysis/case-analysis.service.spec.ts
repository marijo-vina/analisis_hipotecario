import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { IncomeCalculationService } from '../income-calculation/income-calculation.service';
import { LiabilityCalculationService } from '../liability/liability.service';
import { CaseAnalysisService } from './case-analysis.service';
import type { RuleResult } from './analysis-rule.interface';

describe('CaseAnalysisService', () => {
  let service: CaseAnalysisService;

  const mockPassRuleResult: RuleResult = {
    ruleId: 'identity-match',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['official-id', 'payroll', 'client'], fields: [] },
    alerts: [],
  };

  const mockPrismaService = {
    mortgageCase: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    caseStatus: {
      findUnique: jest.fn(),
    },
    analysisRun: {
      create: jest.fn(),
      findFirst: jest.fn(),
    },
  };

  const mockIdentityMatchRule = {
    ruleId: 'identity-match',
    execute: jest.fn(),
  };

  const mockBankarizationRule = {
    ruleId: 'bankarization-validation',
    execute: jest.fn(),
  };

  const mockBankViabilityRule = {
    ruleId: 'bank-viability',
    execute: jest.fn(),
  };

  const mockIncomeCalcService = {
    calculate: jest.fn(),
  };

  const mockLiabilityCalcService = {
    calculate: jest.fn(),
  };

  const mockBankarizationPassResult: RuleResult = {
    ruleId: 'bankarization-validation',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['payroll', 'bank-statement', 'client'], fields: [] },
    alerts: [],
  };

  const mockBankViabilityPassResult: RuleResult = {
    ruleId: 'bank-viability',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog'], fields: [], bankViability: { sourceVersion: 'ANAQUEL_MAYO_2026', productMatches: [] } },
    alerts: [],
  };

  const buildCase = (overrides: Record<string, unknown> = {}) => ({
    id: 'case-1',
    clientId: 'client-1',
    advisorId: 'advisor-1',
    statusId: 4,
    client: {
      id: 'client-1',
      fullName: 'JOSE PEREZ GARCIA',
      rfc: 'PELJ900101ABC',
      curp: 'PEJ900315HYNRLN08',
    },
    documents: [
      {
        id: 'doc-1',
        extractedData: { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } },
        documentType: { code: 'INE' },
      },
      {
        id: 'doc-2',
        extractedData: {
          employee: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC', curp: 'PEJ900315HYNRLN08' },
        },
        documentType: { code: 'PAYROLL_RECEIPT' },
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // La bancarizacion (HU-10) tambien se ejecuta; default PASS para que el
    // agregado reciba un RuleResult valido sin que cada test lo configure.
    mockBankarizationRule.execute.mockResolvedValue(mockBankarizationPassResult);
    mockBankViabilityRule.execute.mockResolvedValue(mockBankViabilityPassResult);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseAnalysisService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: IdentityMatchRule, useValue: mockIdentityMatchRule },
        { provide: BankarizationValidationRule, useValue: mockBankarizationRule },
        { provide: BankViabilityRule, useValue: mockBankViabilityRule },
        { provide: IncomeCalculationService, useValue: mockIncomeCalcService },
        { provide: LiabilityCalculationService, useValue: mockLiabilityCalcService },
      ],
    }).compile();
    service = module.get<CaseAnalysisService>(CaseAnalysisService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('run', () => {
    it('throws NotFoundException when the case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(service.run('nope', 'advisor-1')).rejects.toThrow(NotFoundException);
    });

    it('loads the case with client, documents, and documentType', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.mortgageCase.findUnique).toHaveBeenCalledWith({
        where: { id: 'case-1' },
        include: { client: true, documents: { include: { documentType: true } } },
      });
    });

    it('runs the registered identity-match rule against client + documents', async () => {
      const mortgageCase = buildCase();
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(mortgageCase);
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalledWith(
        expect.objectContaining({ id: mortgageCase.client.id }),
        mortgageCase.documents,
      );
    });

    it('persists an AnalysisRun with COMPLETED status and aggregate detail', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.analysisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            mortgageCaseId: 'case-1',
            executionStatus: 'COMPLETED',
            outcome: 'PASS',
            triggeredBy: 'advisor-1',
          }),
        }),
      );
    });

    it('returns AnalysisResult with runId, executionStatus, outcome, summary, detail, executionMetadata', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      expect(result).toEqual(
        expect.objectContaining({
          runId: 'run-1',
          executionStatus: 'COMPLETED',
          outcome: 'PASS',
          summary: expect.any(String),
          detail: expect.objectContaining({ sources: expect.any(Array), fields: expect.any(Array) }),
          executionMetadata: expect.objectContaining({
            timestamp: expect.any(String),
            triggeredBy: 'advisor-1',
          }),
        }),
      );
    });

    it('executes Phase A rules, Phase B calculations, then Phase C bankViability in order', async () => {
      const callOrder: string[] = [];
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockImplementation(async () => {
        callOrder.push('identity-match');
        return mockPassRuleResult;
      });
      mockBankarizationRule.execute.mockImplementation(async () => {
        callOrder.push('bankarization-validation');
        return mockBankarizationPassResult;
      });
      mockIncomeCalcService.calculate.mockImplementation(async () => {
        callOrder.push('income-calculation');
        return {};
      });
      mockLiabilityCalcService.calculate.mockImplementation(async () => {
        callOrder.push('liability-calculation');
        return {};
      });
      mockBankViabilityRule.execute.mockImplementation(async () => {
        callOrder.push('bank-viability');
        return mockBankViabilityPassResult;
      });
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(callOrder).toEqual([
        'identity-match',
        'bankarization-validation',
        'income-calculation',
        'liability-calculation',
        'bank-viability',
      ]);
    });

    it('continues to Phase C even when Phase B income calculation fails', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockRejectedValue(new Error('No payroll docs'));
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      expect(result.executionStatus).toBe('COMPLETED');
      expect(mockBankViabilityRule.execute).toHaveBeenCalled();
    });

    it('does NOT update case status on FAIL (transitionToRequiresReview removed)', async () => {
      const failResult: RuleResult = {
        ruleId: 'identity-match',
        outcome: 'FAIL',
        severity: 'ERROR',
        detail: { sources: ['official-id', 'payroll'], fields: [] },
        alerts: [{ ruleCode: 'IDENTITY_MISMATCH', severity: 'ERROR', field: 'rfc', message: 'mismatch' }],
      };
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(failResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.caseStatus.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.mortgageCase.update).not.toHaveBeenCalled();
    });

    it('does NOT update case status when outcome is PASS', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.caseStatus.findUnique).not.toHaveBeenCalled();
      expect(mockPrismaService.mortgageCase.update).not.toHaveBeenCalled();
    });
  });

  describe('getLatest', () => {
    it('returns the most recent AnalysisRun for the case', async () => {
      const run = { id: 'run-2', outcome: 'PASS', executionStatus: 'COMPLETED', detail: {} };
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(run);

      const result = await service.getLatest('case-1');

      expect(mockPrismaService.analysisRun.findFirst).toHaveBeenCalledWith({
        where: { mortgageCaseId: 'case-1' },
        orderBy: { createdAt: 'desc' },
        include: { alerts: true },
      });
      expect(result).toEqual(run);
    });

    it('returns null when no runs exist for the case', async () => {
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);

      const result = await service.getLatest('case-1');

      expect(result).toBeNull();
    });
  });
});