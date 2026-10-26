import { NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { IdentityMatchRule } from './rules/identity-match.rule';
import { BankarizationValidationRule } from './rules/bankarization-validation.rule';
import { PfaeValidationRule } from './rules/pfae-validation.rule';
import { PmCsfTaxRule } from './rules/pm-csf-tax.rule';
import { PmGatesRule } from './rules/pm-gates.rule';
import { BankViabilityRule } from './rules/bank-viability.rule';
import { IncomeCalculationService } from '../income-calculation/income-calculation.service';
import { LiabilityCalculationService } from '../liability/liability.service';
import { CaseAnalysisService } from './case-analysis.service';
import type { RuleResult } from './analysis-rule.interface';
import { CaseStatusCalculatorService } from '../case-status-calculator/case-status-calculator.service';

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
    document: {
      update: jest.fn().mockResolvedValue({}),
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

  const mockPfaeValidationRule = {
    ruleId: 'pfae-validation',
    execute: jest.fn(),
  };

  const mockPmCsfTaxRule = {
    ruleId: 'pm-csf-tax',
    execute: jest.fn(),
  };

  const mockPmGatesRule = {
    ruleId: 'pm-gates',
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
    calculatePersonaMoral: jest.fn(),
  };

  const mockCaseStatusCalculatorService = {
    recalculate: jest.fn().mockResolvedValue(undefined),
  };

  const mockBankarizationPassResult: RuleResult = {
    ruleId: 'bankarization-validation',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['payroll', 'bank-statement', 'client'], fields: [] },
    alerts: [],
  };

  const mockPfaeValidationPassResult: RuleResult = {
    ruleId: 'pfae-validation',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['csf'], fields: [], pfaeValidation: {} },
    alerts: [],
  };

  const mockPmCsfTaxPassResult: RuleResult = {
    ruleId: 'pm-csf-tax',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: [], fields: [], declarationPathKnockedOut: false },
    alerts: [],
  };

  const mockPmGatesPassResult: RuleResult = {
    ruleId: 'pm-gates',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: [], fields: [], pmGates: { banks: [] } },
    alerts: [],
  };

  const mockBankViabilityPassResult: RuleResult = {
    ruleId: 'bank-viability',
    outcome: 'PASS',
    severity: 'INFO',
    detail: { sources: ['mortgage-case', 'income-calculation', 'liability-snapshot', 'bank-catalog'], fields: [], bankViability: { sourceVersion: 'ANAQUEL_MAYO_2026', bankResults: [] } },
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
    mockPfaeValidationRule.execute.mockResolvedValue(mockPfaeValidationPassResult);
    mockPmCsfTaxRule.execute.mockResolvedValue(mockPmCsfTaxPassResult);
    mockPmGatesRule.execute.mockResolvedValue(mockPmGatesPassResult);
    mockBankViabilityRule.execute.mockResolvedValue(mockBankViabilityPassResult);
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CaseAnalysisService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: IdentityMatchRule, useValue: mockIdentityMatchRule },
        { provide: BankarizationValidationRule, useValue: mockBankarizationRule },
        { provide: PfaeValidationRule, useValue: mockPfaeValidationRule },
        { provide: PmCsfTaxRule, useValue: mockPmCsfTaxRule },
        { provide: PmGatesRule, useValue: mockPmGatesRule },
        { provide: BankViabilityRule, useValue: mockBankViabilityRule },
        { provide: IncomeCalculationService, useValue: mockIncomeCalcService },
        { provide: LiabilityCalculationService, useValue: mockLiabilityCalcService },
        { provide: CaseStatusCalculatorService, useValue: mockCaseStatusCalculatorService },
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

    it('POST response includes detail.bankViability with the same shape as the rule produced', async () => {
      // HU-14B fix: POST /analyze must expose `detail.bankViability` so the
      // frontend renders the Comparativa bancaria tab on the first response
      // without needing a follow-up GET /analysis/latest.
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      // The response must include `bankViability` on detail (HU-14B requirement).
      const detail = result.detail as Record<string, unknown>;
      expect(detail).toHaveProperty('bankViability');
      // The propagated snapshot must match what the bank-viability rule produced.
      expect(detail.bankViability).toEqual(
        (mockBankViabilityPassResult.detail as Record<string, unknown>).bankViability,
      );
      // And the persisted AnalysisRun must persist the same snapshot so
      // GET /analysis/latest exposes an identical shape.
      const persistedDetail = mockPrismaService.analysisRun.create.mock
        .calls[0][0].data.detail as Record<string, unknown>;
      expect(persistedDetail).toHaveProperty('bankViability');
      expect(persistedDetail.bankViability).toEqual(
        (mockBankViabilityPassResult.detail as Record<string, unknown>).bankViability,
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

  describe('personType-aware phaseARules (HU-19a / HU-19b)', () => {
    it('PFAE case: invokes PfaeValidationRule and skips BankarizationValidationRule', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).toHaveBeenCalled();
      expect(mockPmCsfTaxRule.execute).not.toHaveBeenCalled();
      expect(mockPmGatesRule.execute).not.toHaveBeenCalled();
      expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
    });

    it('SALARIED case: invokes IdentityMatchRule and BankarizationValidationRule, not PfaeValidationRule (regression)', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'SALARIED' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalled();
      expect(mockBankarizationRule.execute).toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
    });

    it('PFAE Phase A runs identity-match then pfae-validation in order', async () => {
      const callOrder: string[] = [];
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockImplementation(async () => {
        callOrder.push('identity-match');
        return mockPassRuleResult;
      });
      mockPfaeValidationRule.execute.mockImplementation(async () => {
        callOrder.push('pfae-validation');
        return mockPfaeValidationPassResult;
      });
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(callOrder).toEqual(['identity-match', 'pfae-validation']);
    });

    it('rule context includes personType sourced from mortgageCase.personType', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalledWith(
        expect.objectContaining({ personType: 'PFAE' }),
        expect.any(Array),
      );
    });

    it('PFAE Phase B persists an income snapshot without payroll and does not fail', async () => {
      const pfaeCase = buildCase({
        personType: 'PFAE',
        documents: [
          {
            id: 'doc-1',
            extractedData: { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } },
            documentType: { code: 'INE' },
          },
          {
            id: 'doc-csf',
            extractedData: { activities: [] },
            documentType: { code: 'CSF' },
          },
        ],
      });
      const incomeSnapshot = {
        id: 'income-snap-pfae-1',
        caseId: 'case-1',
        source: 'BANK_STATEMENTS',
        status: 'CALCULATED',
        averageGrossIncome: 15000,
        averageNetIncome: 15000,
      };
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(pfaeCase);
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue(incomeSnapshot);
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      expect(
        pfaeCase.documents.some(
          (d: { documentType: { code: string } }) => d.documentType.code === 'PAYROLL_RECEIPT',
        ),
      ).toBe(false);
      expect(mockIncomeCalcService.calculate).toHaveBeenCalledTimes(1);
      expect(mockIncomeCalcService.calculate).toHaveBeenCalledWith('case-1', []);
      await expect(mockIncomeCalcService.calculate.mock.results[0].value).resolves.toEqual(
        incomeSnapshot,
      );
      expect(result.executionStatus).toBe('COMPLETED');
      expect(mockPrismaService.analysisRun.create).toHaveBeenCalled();
    });

    it('PFAE Phase B still calculates liability when there is no payroll', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({
          personType: 'PFAE',
          documents: [
            {
              id: 'doc-1',
              extractedData: { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } },
              documentType: { code: 'INE' },
            },
          ],
        }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({
        id: 'income-snap-pfae-2',
        source: 'TAX_RETURN',
      });
      mockLiabilityCalcService.calculate.mockResolvedValue({ id: 'liability-snap-1' });
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      expect(mockIncomeCalcService.calculate).toHaveBeenCalledWith('case-1', []);
      expect(mockLiabilityCalcService.calculate).toHaveBeenCalledWith('case-1', []);
      expect(result.executionStatus).toBe('COMPLETED');
    });

    it('PFAE pfae-validation FAIL does not block Phase B or Phase C', async () => {
      const pfaeFail: RuleResult = {
        ruleId: 'pfae-validation',
        outcome: 'FAIL',
        severity: 'ERROR',
        detail: {
          sources: ['csf'],
          fields: [],
          pfaeValidation: { regime: { isSolelySalaried: true, outcome: 'FAIL' } },
        },
        alerts: [
          {
            ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
            severity: 'ERROR',
            field: 'regime',
            message: 'solo sueldos',
          },
        ],
      };
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockPfaeValidationRule.execute.mockResolvedValue(pfaeFail);
      mockIncomeCalcService.calculate.mockResolvedValue({ id: 'income-1' });
      mockLiabilityCalcService.calculate.mockResolvedValue({ id: 'liability-1' });
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      const result = await service.run('case-1', 'advisor-1');

      expect(mockIncomeCalcService.calculate).toHaveBeenCalledTimes(1);
      expect(mockLiabilityCalcService.calculate).toHaveBeenCalledTimes(1);
      expect(mockBankViabilityRule.execute).toHaveBeenCalledTimes(1);
      expect(result.executionStatus).toBe('COMPLETED');
      expect(result.outcome).toBe('FAIL');
    });

    it('persists pfae-validation gate alerts on AnalysisRun.alerts.create', async () => {
      const pfaeResult: RuleResult = {
        ruleId: 'pfae-validation',
        outcome: 'FAIL',
        severity: 'ERROR',
        detail: { sources: ['csf'], fields: [], pfaeValidation: {} },
        alerts: [
          {
            ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
            severity: 'ERROR',
            field: 'regime',
            message: 'solo sueldos',
          },
          {
            ruleCode: 'VIGENCIA_MAYOR_3_MESES',
            severity: 'WARNING',
            field: 'vigencia',
            message: 'csf vieja',
          },
          {
            ruleCode: 'PFAE_ACTIVITY_TENURE',
            severity: 'INFO',
            field: 'tenure',
            message: '12 meses',
          },
        ],
      };
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockPfaeValidationRule.execute.mockResolvedValue(pfaeResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.analysisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            alerts: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
                  severity: 'ERROR',
                  field: 'regime',
                }),
                expect.objectContaining({
                  ruleCode: 'VIGENCIA_MAYOR_3_MESES',
                  severity: 'WARNING',
                  field: 'vigencia',
                }),
                expect.objectContaining({
                  ruleCode: 'PFAE_ACTIVITY_TENURE',
                  severity: 'INFO',
                  field: 'tenure',
                }),
              ]),
            },
          }),
        }),
      );
    });
  });

  describe('PM Analyze (HU-22)', () => {
    const pmShareholderIne = {
      id: 'doc-ine',
      owner: 'SHAREHOLDER',
      extractedData: { identity: { fullName: 'JOSE PEREZ', curp: 'PEJ900315HYNRLN08' } },
      documentType: { code: 'INE' },
    };
    const pmCompanyCsf = {
      id: 'doc-csf-company',
      owner: 'COMPANY',
      extractedData: { taxpayer: { fullName: 'EMPRESA SA', rfc: 'EMP010101AAA' } },
      documentType: { code: 'CSF' },
    };
    const pmMissingOwnerBank = {
      id: 'doc-bank-shareholder',
      extractedData: {
        accountHolder: { fullName: 'JOSE PEREZ', rfc: 'PELJ900101ABC' },
        allTransactions: [
          {
            date: '2026-05-15',
            amount: 15000,
            movementType: 'DEPOSIT',
            originalConcept: 'PAGO NOMINA QUINCENA',
          },
        ],
        payrollDeposits: [],
        financialDepuration: {
          depurationSummary: { totalValidIncome: 0, validDepositsCount: 0 },
          cleanedDeposits: [],
        },
      },
      documentType: { code: 'BANK_STATEMENT' },
    };

    const buildPmCase = () =>
      buildCase({
        personType: 'PM',
        documents: [pmShareholderIne, pmCompanyCsf, pmMissingOwnerBank],
      });

    it('runs IdentityMatch only on documents whose owner is not COMPANY; missing owner counts as SHAREHOLDER', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildPmCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-pm-1' });

      await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalledTimes(1);
      const [, docsArg] = mockIdentityMatchRule.execute.mock.calls[0] as [
        Record<string, unknown>,
        { id: string; owner?: string }[],
      ];
      expect(docsArg.map((d) => d.id)).toEqual(['doc-ine', 'doc-bank-shareholder']);
      expect(docsArg.map((d) => d.id)).not.toContain('doc-csf-company');
      expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
      expect(mockPmCsfTaxRule.execute).toHaveBeenCalledTimes(1);
      expect(mockPmGatesRule.execute).toHaveBeenCalledTimes(1);
      const [, pmDocs] = mockPmCsfTaxRule.execute.mock.calls[0] as [
        Record<string, unknown>,
        { id: string }[],
      ];
      expect(pmDocs.map((d) => d.id)).toEqual([
        'doc-ine',
        'doc-csf-company',
        'doc-bank-shareholder',
      ]);
    });

    it('runs persona moral liabilities, income, then the bank comparison', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(buildPmCase());
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-pm-2' });

      const result = await service.run('case-1', 'advisor-1');

      expect(mockPrismaService.document.update).not.toHaveBeenCalled();
      expect(mockLiabilityCalcService.calculate).not.toHaveBeenCalled();
      expect(mockLiabilityCalcService.calculatePersonaMoral).toHaveBeenCalledWith(
        'case-1',
        [],
        [],
        null,
      );
      expect(mockIncomeCalcService.calculate).toHaveBeenCalledWith('case-1', []);
      const liabilityOrder =
        mockLiabilityCalcService.calculatePersonaMoral.mock.invocationCallOrder[0];
      const incomeOrder = mockIncomeCalcService.calculate.mock.invocationCallOrder[0];
      const viabilityOrder = mockBankViabilityRule.execute.mock.invocationCallOrder[0];
      expect(liabilityOrder).toBeLessThan(incomeOrder);
      expect(incomeOrder).toBeLessThan(viabilityOrder);
      expect(mockBankViabilityRule.execute).toHaveBeenCalledTimes(1);
      expect(result.detail).toHaveProperty('bankViability');
      const persistedDetail = mockPrismaService.analysisRun.create.mock.calls[0][0]
        .data.detail as Record<string, unknown>;
      expect(persistedDetail).toHaveProperty('bankViability');
      expect(result.executionStatus).toBe('COMPLETED');
    });

    it('SALARIED Analyze still runs Phase A/B/C with bankViability (regression)', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'SALARIED' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-sal' });

      const result = await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalled();
      expect(mockBankarizationRule.execute).toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
      expect(mockPmCsfTaxRule.execute).not.toHaveBeenCalled();
      expect(mockPmGatesRule.execute).not.toHaveBeenCalled();
      expect(mockIncomeCalcService.calculate).toHaveBeenCalled();
      expect(mockLiabilityCalcService.calculate).toHaveBeenCalled();
      expect(mockBankViabilityRule.execute).toHaveBeenCalled();
      expect((result.detail as Record<string, unknown>).bankViability).toEqual(
        (mockBankViabilityPassResult.detail as Record<string, unknown>).bankViability,
      );
    });

    it('PFAE Analyze still runs identity + pfae-validation, Phase B, and Phase C (regression)', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockIdentityMatchRule.execute.mockResolvedValue(mockPassRuleResult);
      mockIncomeCalcService.calculate.mockResolvedValue({});
      mockLiabilityCalcService.calculate.mockResolvedValue({});
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-pfae' });

      const result = await service.run('case-1', 'advisor-1');

      expect(mockIdentityMatchRule.execute).toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).toHaveBeenCalled();
      expect(mockPmCsfTaxRule.execute).not.toHaveBeenCalled();
      expect(mockPmGatesRule.execute).not.toHaveBeenCalled();
      expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
      expect(mockIncomeCalcService.calculate).toHaveBeenCalled();
      expect(mockLiabilityCalcService.calculate).toHaveBeenCalled();
      expect(mockBankViabilityRule.execute).toHaveBeenCalled();
      expect((result.detail as Record<string, unknown>).bankViability).toEqual(
        (mockBankViabilityPassResult.detail as Record<string, unknown>).bankViability,
      );
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

  describe('runPhaseC', () => {
    const priorPfaePhaseA: RuleResult[] = [
      mockPassRuleResult,
      mockPfaeValidationPassResult,
    ];

    const staleBankViability: RuleResult = {
      ruleId: 'bank-viability',
      outcome: 'PASS',
      severity: 'INFO',
      detail: {
        sources: ['mortgage-case'],
        fields: [],
        bankViability: {
          sourceVersion: 'STALE',
          bankResults: [{ bankCode: 'OLD' }],
        },
      },
      alerts: [],
    };

    const freshBankViability: RuleResult = {
      ruleId: 'bank-viability',
      outcome: 'PASS',
      severity: 'INFO',
      detail: {
        sources: [
          'mortgage-case',
          'income-calculation',
          'liability-snapshot',
          'bank-catalog',
        ],
        fields: [],
        bankViability: {
          sourceVersion: 'ANAQUEL_MAYO_2026',
          bankResults: [{ bankCode: 'BANORTE' }],
        },
      },
      alerts: [],
    };

    function stubPriorRun(ruleResults: RuleResult[]) {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockPrismaService.analysisRun.findFirst.mockResolvedValue({
        id: 'run-prior',
        mortgageCaseId: 'case-1',
        detail: {
          ruleResults,
          sources: ['official-id', 'csf'],
          fields: [],
          bankViability: (staleBankViability.detail as Record<string, unknown>)
            .bankViability,
        },
      });
      mockBankViabilityRule.execute.mockResolvedValue(freshBankViability);
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-phase-c' });
    }

    it('copies prior Phase A ruleResults (identity-match + pfae-validation) into a new AnalysisRun', async () => {
      stubPriorRun([...priorPfaePhaseA, staleBankViability]);

      const result = await service.runPhaseC('case-1', 'advisor-1');

      expect(result.runId).toBe('run-phase-c');
      expect(result.executionStatus).toBe('COMPLETED');
      const persisted = mockPrismaService.analysisRun.create.mock.calls[0][0]
        .data as {
        detail: { ruleResults: RuleResult[] };
      };
      const copiedIds = persisted.detail.ruleResults.map((r) => r.ruleId);
      expect(copiedIds).toEqual([
        'identity-match',
        'pfae-validation',
        'bank-viability',
      ]);
      expect(persisted.detail.ruleResults[0]).toEqual(mockPassRuleResult);
      expect(persisted.detail.ruleResults[1]).toEqual(mockPfaeValidationPassResult);
    });

    it('runs BankViabilityRule only and does not re-execute Phase A or Phase B', async () => {
      stubPriorRun([...priorPfaePhaseA, staleBankViability]);

      await service.runPhaseC('case-1', 'advisor-1');

      expect(mockBankViabilityRule.execute).toHaveBeenCalledTimes(1);
      expect(mockIdentityMatchRule.execute).not.toHaveBeenCalled();
      expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
      expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
      expect(mockIncomeCalcService.calculate).not.toHaveBeenCalled();
      expect(mockLiabilityCalcService.calculate).not.toHaveBeenCalled();
    });

    it('drops the prior bank-viability result and persists the freshly executed snapshot', async () => {
      stubPriorRun([...priorPfaePhaseA, staleBankViability]);

      const result = await service.runPhaseC('case-1', 'advisor-1');

      const persisted = mockPrismaService.analysisRun.create.mock.calls[0][0]
        .data as {
        mortgageCaseId: string;
        executionStatus: string;
        triggeredBy: string;
        detail: { ruleResults: RuleResult[]; bankViability: unknown };
      };
      expect(persisted.mortgageCaseId).toBe('case-1');
      expect(persisted.executionStatus).toBe('COMPLETED');
      expect(persisted.triggeredBy).toBe('advisor-1');
      const viabilityResults = persisted.detail.ruleResults.filter(
        (r) => r.ruleId === 'bank-viability',
      );
      expect(viabilityResults).toHaveLength(1);
      expect(viabilityResults[0].detail.bankViability).toEqual(
        (freshBankViability.detail as Record<string, unknown>).bankViability,
      );
      expect(persisted.detail.bankViability).toEqual(
        (freshBankViability.detail as Record<string, unknown>).bankViability,
      );
      expect(result.detail).toEqual(
        expect.objectContaining({
          bankViability: (freshBankViability.detail as Record<string, unknown>)
            .bankViability,
        }),
      );
    });

    it('aggregates the same outcome as a full run given copied Phase A FAIL plus new Phase C PASS', async () => {
      const pfaeFail: RuleResult = {
        ruleId: 'pfae-validation',
        outcome: 'FAIL',
        severity: 'ERROR',
        detail: { sources: ['csf'], fields: [], pfaeValidation: {} },
        alerts: [
          {
            ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
            severity: 'ERROR',
            field: 'regime',
            message: 'solo sueldos',
          },
        ],
      };
      stubPriorRun([mockPassRuleResult, pfaeFail, staleBankViability]);

      const result = await service.runPhaseC('case-1', 'advisor-1');

      expect(result.outcome).toBe('FAIL');
      expect(mockPrismaService.analysisRun.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            outcome: 'FAIL',
            alerts: {
              create: expect.arrayContaining([
                expect.objectContaining({
                  ruleCode: 'REGIMEN_EXCLUSIVAMENTE_ASALARIADO',
                }),
              ]),
            },
          }),
        }),
      );
    });

    it('SALARIED prior run copies identity-match + bankarization-validation, not pfae-validation', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'SALARIED' }),
      );
      mockPrismaService.analysisRun.findFirst.mockResolvedValue({
        id: 'run-salaried',
        mortgageCaseId: 'case-1',
        detail: {
          ruleResults: [
            mockPassRuleResult,
            mockBankarizationPassResult,
            staleBankViability,
          ],
        },
      });
      mockBankViabilityRule.execute.mockResolvedValue(freshBankViability);
      mockPrismaService.analysisRun.create.mockResolvedValue({ id: 'run-phase-c-sal' });

      await service.runPhaseC('case-1', 'advisor-1');

      const persisted = mockPrismaService.analysisRun.create.mock.calls[0][0]
        .data as { detail: { ruleResults: RuleResult[] } };
      expect(persisted.detail.ruleResults.map((r) => r.ruleId)).toEqual([
        'identity-match',
        'bankarization-validation',
        'bank-viability',
      ]);
      expect(mockPfaeValidationRule.execute).not.toHaveBeenCalled();
      expect(mockBankarizationRule.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when the case does not exist', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(null);

      await expect(service.runPhaseC('nope', 'advisor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockBankViabilityRule.execute).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when no prior AnalysisRun exists to copy Phase A from', async () => {
      mockPrismaService.mortgageCase.findUnique.mockResolvedValue(
        buildCase({ personType: 'PFAE' }),
      );
      mockPrismaService.analysisRun.findFirst.mockResolvedValue(null);

      await expect(service.runPhaseC('case-1', 'advisor-1')).rejects.toThrow(
        NotFoundException,
      );
      expect(mockBankViabilityRule.execute).not.toHaveBeenCalled();
      expect(mockPrismaService.analysisRun.create).not.toHaveBeenCalled();
    });
  });
});