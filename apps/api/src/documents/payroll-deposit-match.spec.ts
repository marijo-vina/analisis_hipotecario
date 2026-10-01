import {
  applySalariedPayrollDepuration,
  conceptHasPayrollKeyword,
  depositMatchesEmployer,
  distinctiveEmployerTokens,
  promoteEmployerPayrollDeposits,
  selectPayrollDeposits,
} from './payroll-deposit-match';

const ACAMEX_SPEI =
  'TRK0000000000000001 SPEI RECIBIDO, BCO:0699 FONDEADORA HR LIQ: 16:42:52 DEL CLIENTE ACAMEX DE LA CLABE 012180001234567890 CON RFC ACM230101AA1 CONCEPTO: PAGO REFERENCIA: 2204490';

const employer = {
  legalName: 'ACAMEX SA DE CV',
  rfc: 'ACM230101AA1',
};

describe('payroll deposit employer match', () => {
  it('keeps the brand token and drops generic words', () => {
    expect(distinctiveEmployerTokens(employer.legalName)).toEqual(['ACAMEX']);
  });

  it('matches a SPEI whose concept is only PAGO when the employer name and RFC are in the description', () => {
    expect(depositMatchesEmployer(ACAMEX_SPEI, null, employer)).toBe(true);
    const [hit] = selectPayrollDeposits(
      [{ date: '2026-09-15', amount: 50000, originalConcept: ACAMEX_SPEI, movementType: 'DEPOSIT' }],
      [employer],
    );
    expect(hit.detectedPayerRfc).toBe('ACM230101AA1');
    expect(hit.amount).toBe(50000);
  });

  it('accepts a deposit whose concept says nomina even without the employer name', () => {
    expect(conceptHasPayrollKeyword('PAGO NOMINA QUINCENA')).toBe(true);
    expect(conceptHasPayrollKeyword('SPEI CONCEPTO: PAGO')).toBe(false);
    const [hit] = selectPayrollDeposits(
      [{ date: '2026-06-03', amount: 10000, originalConcept: 'PAGO NOMINA QUINCENA', movementType: 'DEPOSIT' }],
      [],
    );
    expect(hit.containsPayrollKeyword).toBe(true);
    expect(hit.amount).toBe(10000);
  });

  it('does not treat a bare PAGO deposit as payroll', () => {
    const other = 'SPEI RECIBIDO CONCEPTO: PAGO REFERENCIA: 998877';
    expect(depositMatchesEmployer(other, null, employer)).toBe(false);
    expect(
      selectPayrollDeposits(
        [{ originalConcept: other, movementType: 'DEPOSIT', amount: 1000 }],
        [employer],
      ),
    ).toEqual([]);
  });

  it('matches by RFC when the legal name is truncated past the brand token', () => {
    expect(
      depositMatchesEmployer('SPEI CONCEPTO: PAGO CON RFC ACM230101AA1', null, {
        legalName: null,
        rfc: 'ACM230101AA1',
      }),
    ).toBe(true);
  });

  it('promotes matched movements and clears the empty-payroll alert', () => {
    const data: Record<string, unknown> = {
      allTransactions: [
        { date: '2026-09-15', amount: 50000, originalConcept: ACAMEX_SPEI, movementType: 'DEPOSIT' },
        { date: '2026-09-16', amount: 200, originalConcept: 'SPEI CONCEPTO: PAGO', movementType: 'DEPOSIT' },
      ],
      payrollDeposits: [],
      alerts: [{ code: 'BANK_NO_PAYROLL_DEPOSITS', message: 'No se detectaron depósitos de nómina en el estado de cuenta.' }],
    };

    expect(promoteEmployerPayrollDeposits(data, [employer])).toBe(true);
    expect(data.payrollDeposits).toHaveLength(1);
    expect(data.alerts).toEqual([]);
  });

  it('keeps salaried valid income to payroll keyword and employer matches only', () => {
    const data: Record<string, unknown> = {
      payrollDeposits: [
        { date: '2026-06-01', amount: 190000, originalConcept: ACAMEX_SPEI, containsPayrollKeyword: false },
        { date: '2026-06-03', amount: 10000, originalConcept: 'PAGO NOMINA QUINCENA', containsPayrollKeyword: true },
      ],
      alerts: [{ code: 'STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED', message: 'atipico' }],
      financialDepuration: {
        integrityCheck: { status: 'CRITICAL_DISCREPANCY', message: 'falta una hoja' },
        highImpactExceptions: [{ originalConcept: 'DEP.EFECTIVO', amount: 61000 }],
        cleanedDeposits: [
          { classification: 'NEEDS_REVIEW', amount: 61000, originalConcept: 'DEP.EFECTIVO' },
        ],
        depurationSummary: {
          totalGrossDeposits: 261000,
          totalValidIncome: 61000,
          validDepositsCount: 0,
          needsReviewCount: 1,
          trashDepositsCount: 0,
          totalTrashDeposits: 0,
        },
      },
    };

    expect(applySalariedPayrollDepuration(data)).toBe(true);
    const depuration = data.financialDepuration as {
      incomeMode: string;
      highImpactExceptions: unknown[];
      cleanedDeposits: { amount: number; isHighImpactOutlier: boolean }[];
      integrityCheck: { status: string };
      depurationSummary: { totalValidIncome: number; validDepositsCount: number; needsReviewCount: number; totalGrossDeposits: number };
    };
    expect(depuration.incomeMode).toBe('PAYROLL');
    expect(depuration.depurationSummary.totalValidIncome).toBe(200000);
    expect(depuration.depurationSummary.validDepositsCount).toBe(2);
    expect(depuration.depurationSummary.needsReviewCount).toBe(0);
    expect(depuration.depurationSummary.totalGrossDeposits).toBe(261000);
    expect(depuration.highImpactExceptions).toEqual([]);
    expect(depuration.cleanedDeposits.every((row) => row.isHighImpactOutlier === false)).toBe(true);
    expect(depuration.integrityCheck.status).toBe('CRITICAL_DISCREPANCY');
    expect(data.alerts).toEqual([]);
    expect(applySalariedPayrollDepuration(data)).toBe(false);
  });
});
