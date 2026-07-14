// Tests unitarios para BankarizationValidationRule (HU-10).
// Los servicios (matching + pagadora) se mockean; se verifica la orquestacion,
// el mapeo de resultados→alertas y el calculo de outcome (PASS/PARTIAL/FAIL).

import { BankarizationValidationRule } from './bankarization-validation.rule';
import { PayrollBankMatchingService } from '../services/payroll-bank-matching.service';
import { PagadoraDetectionService } from '../services/pagadora-detection.service';
import type {
  PayrollMatchResult,
  PagadoraEvaluation,
} from '../types/bankarization.types';
import type { PrismaDocumentLike } from './identity-match.rule';

describe('BankarizationValidationRule', () => {
  const mockMatch = { match: jest.fn() };
  const mockPagadora = { evaluate: jest.fn() };
  let rule: BankarizationValidationRule;

  beforeEach(() => {
    jest.clearAllMocks();
    rule = new BankarizationValidationRule(
      mockMatch as unknown as PayrollBankMatchingService,
      mockPagadora as unknown as PagadoraDetectionService,
    );
  });

  const doc = (
    typeCode: string,
    extractedData: Record<string, unknown> | null,
  ): PrismaDocumentLike => ({ documentType: { code: typeCode }, extractedData });

  const payrollDoc = (over: Record<string, unknown> = {}): PrismaDocumentLike =>
    doc('PAYROLL_RECEIPT', {
      employer: { rfc: 'ABC123456XYZ', legalName: 'Empresa Demo' },
      income: { netIncome: 10000 },
      payrollPeriod: { paymentDate: '2026-07-01' },
      ...over,
    });

  const bankDoc = (
    over: {
      isJointAccount?: boolean;
      deposits?: Record<string, unknown>[];
    } = {},
  ): PrismaDocumentLike =>
    doc('BANK_STATEMENT', {
      accountHolder: {
        fullName: 'JOSE PEREZ',
        rfc: 'PELJ900101ABC',
        isJointAccount: over.isJointAccount ?? false,
      },
      bank: { institutionName: 'BBVA' },
      payrollDeposits: over.deposits ?? [
        {
          date: '2026-07-02',
          amount: 10000,
          originalConcept: 'PAGO DE NOMINA',
          detectedPayerRfc: 'ABC123456XYZ',
          detectedEmployerOrPayerName: 'Empresa Demo',
        },
      ],
    });

  const noEval = (i: number): PagadoraEvaluation => ({
    receiptIndex: i,
    isProviderCandidate: false,
    isMirrorConfirmed: false,
    providerRfc: null,
    employerDepositFound: false,
    providerDepositFound: false,
    scotiabankExcluded: false,
  });

  it('tiene ruleId "bankarization-validation"', () => {
    expect(rule.ruleId).toBe('bankarization-validation');
  });

  it('extrae receipts y deposits de los documentos y los pasa al matching', async () => {
    mockMatch.match.mockReturnValue([
      {
        receiptIndex: 0,
        status: 'MATCHED',
        method: 'RFC',
        candidateDepositId: '0-0',
        candidateAmount: 10000,
        candidateDate: '2026-07-02',
        candidateConcept: 'PAGO DE NOMINA',
        score: null,
        scotiabankExcluded: false,
        traceability: { rule: 'RFC_MATCH', rfcUsed: 'ABC123456XYZ' },
      } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    expect(mockMatch.match).toHaveBeenCalledTimes(1);
    const args = mockMatch.match.mock.calls[0];
    // receipts
    expect(args[0]).toHaveLength(1);
    expect(args[0][0].employerRfc).toBe('ABC123456XYZ');
    expect(args[0][0].netIncome).toBe(10000);
    // deposits
    expect(args[1]).toHaveLength(1);
    expect(args[1][0].amount).toBe(10000);
    // isJointAccount
    expect(args[2]).toBe(false);
    // resultado base
    expect(result.outcome).toBe('PASS');
    expect(result.severity).toBe('INFO');
    expect(result.alerts).toHaveLength(0);
  });

  it('combina isJointAccount=true desde el estado de cuenta mancomunado', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'MANUAL_REVIEW', method: 'RFC', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'RFC_MATCH' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    await rule.execute({} as never, [payrollDoc(), bankDoc({ isJointAccount: true })]);

    expect(mockMatch.match.mock.calls[0][2]).toBe(true);
  });

  it('mapea DISCREPANCY → alerta DISCREPANCY_5PCT (WARNING) y outcome PARTIAL', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'DISCREPANCY', method: 'RFC', candidateDepositId: '0-0', candidateAmount: 11000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'RFC_MATCH', amountDiffPercent: 10 } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    expect(result.outcome).toBe('PARTIAL');
    expect(result.severity).toBe('WARNING');
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ ruleCode: 'DISCREPANCY_5PCT', severity: 'WARNING' }),
    );
  });

  it('mapea RFC_INCOMPATIBLE sin resolver → BANK_PAYROLL_MISMATCH (ERROR) y FAIL', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'RFC_INCOMPATIBLE', method: 'NONE', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'TRANSFERENCIA', score: null, scotiabankExcluded: false, traceability: { rule: 'NONE' } } as PayrollMatchResult,
    ]);
    // pagadora no confirma → sigue unresolved
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    expect(result.outcome).toBe('FAIL');
    expect(result.severity).toBe('ERROR');
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ ruleCode: 'BANK_PAYROLL_MISMATCH', severity: 'ERROR' }),
    );
  });

  it('confirma PROVIDER_MIRROR → PAYROLL_PROVIDER_MIRROR (INFO) y outcome PASS', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'RFC_INCOMPATIBLE', method: 'NONE', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'NONE' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([
      {
        ...noEval(0),
        isProviderCandidate: true,
        isMirrorConfirmed: true,
        providerRfc: 'PAGADORA456',
        employerDepositFound: true,
        providerDepositFound: true,
        scotiabankExcluded: false,
      },
    ]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    expect(result.outcome).toBe('PASS');
    expect(result.severity).toBe('INFO');
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ ruleCode: 'PAYROLL_PROVIDER_MIRROR', severity: 'INFO' }),
    );
  });

  it('scotiabankExcluded → PAYROLL_PROVIDER_SCOTIABANK (WARNING) y PARTIAL', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'RFC_INCOMPATIBLE', method: 'NONE', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'TRANSFERENCIA TERCEROS', score: null, scotiabankExcluded: false, traceability: { rule: 'NONE' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([
      {
        ...noEval(0),
        isProviderCandidate: true,
        isMirrorConfirmed: false,
        providerRfc: 'PAGADORA456',
        providerDepositFound: true,
        scotiabankExcluded: true,
      },
    ]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    expect(result.outcome).toBe('PARTIAL');
    expect(result.alerts).toContainEqual(
      expect.objectContaining({ ruleCode: 'PAYROLL_PROVIDER_SCOTIABANK', severity: 'WARNING' }),
    );
  });

  it('MAUAL_REVIEW (cuenta mancomunada) → PARTIAL/WARNING con alerta BANK_JOINT_ACCOUNT', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'MANUAL_REVIEW', method: 'RFC', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'RFC_MATCH' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc({ isJointAccount: true })]);

    expect(result.outcome).toBe('PARTIAL');
    expect(result.severity).toBe('WARNING');
    // La alerta BANK_JOINT_ACCOUNT se emite cuando isJointAccount = true y hay
    // resultados en MANUAL_REVIEW (cuenta mancomunada forzada por el matching).
    expect(result.alerts.some((a) => a.ruleCode === 'BANK_JOINT_ACCOUNT')).toBe(true);
  });

  it('outcome FAIL gana sobre PARTIAL cuando hay resultados mixtos', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'MATCHED', method: 'RFC', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'RFC_MATCH' } } as PayrollMatchResult,
      { receiptIndex: 1, status: 'RFC_INCOMPATIBLE', method: 'NONE', candidateDepositId: null, candidateAmount: null, candidateDate: null, candidateConcept: null, score: null, scotiabankExcluded: false, traceability: { rule: 'NONE' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0), noEval(1)]);

    const result = await rule.execute({} as never, [payrollDoc(), payrollDoc(), bankDoc()]);

    expect(result.outcome).toBe('FAIL');
    expect(result.severity).toBe('ERROR');
    // emite BANK_PAYROLL_MISMATCH por el RFC_INCOMPATIBLE
    expect(result.alerts.some((a) => a.ruleCode === 'BANK_PAYROLL_MISMATCH')).toBe(true);
  });

  it('NO incluye resultados en detail.fields (los resultados van en alerts y la UI de conciliacion)', async () => {
    mockMatch.match.mockReturnValue([
      { receiptIndex: 0, status: 'MATCHED', method: 'RFC', candidateDepositId: '0-0', candidateAmount: 10000, candidateDate: '2026-07-02', candidateConcept: 'NOMINA', score: null, scotiabankExcluded: false, traceability: { rule: 'RFC_MATCH' } } as PayrollMatchResult,
    ]);
    mockPagadora.evaluate.mockReturnValue([noEval(0)]);

    const result = await rule.execute({} as never, [payrollDoc(), bankDoc()]);

    // detail.fields debe estar vacio: los resultados de bancarizacion no se muestran
    // en la tabla de identidad cross-document. La UI de conciliacion (estados-conciliacion.tsx)
    // consume los documentos extraidos directamente, no los FieldComparison.
    expect(result.detail.fields).toEqual([]);
  });
});