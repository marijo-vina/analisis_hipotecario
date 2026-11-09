import { calculatePmCompanyLiabilities } from './pm-company-liability';

describe('calculatePmCompanyLiabilities', () => {
  it('reproduces the persona moral fixture at 50% share: 17,971.92', () => {
    const result = calculatePmCompanyLiabilities(
      [
        {
          creditReference: 'simple-1460',
          institution: 'BANCO',
          creditType: 'CREDITO SIMPLE',
          classification: 'FIXED_PAYMENT',
          isClosed: false,
          originalAmount: 445_000,
          currentBalance: 445_000,
          termDays: 1460,
        },
        {
          creditReference: 'simple-30',
          institution: 'BANCO',
          creditType: 'CREDITO SIMPLE',
          classification: 'FIXED_PAYMENT',
          isClosed: false,
          originalAmount: 24_000,
          currentBalance: 24_000,
          termDays: 30,
        },
        {
          creditReference: 'revolving',
          institution: 'BANCO',
          creditType: 'LINEA REVOLVENTE',
          classification: 'REVOLVING',
          isClosed: false,
          originalAmount: 28_000,
          currentBalance: 28_000,
          termDays: null,
        },
      ],
      50,
    );

    expect(result.credits.map((credit) => credit.monthlyDebtContribution)).toEqual([
      4571.92,
      12000,
      1400,
    ]);
    expect(result.pmMonthlyDebt).toBe(17971.92);
    expect(result.hasIncomplete).toBe(false);
  });

  it('does not total the company bag when the share percentage is missing', () => {
    const result = calculatePmCompanyLiabilities(
      [
        {
          creditReference: 'simple-30',
          institution: 'BANCO',
          creditType: 'CREDITO SIMPLE',
          classification: 'FIXED_PAYMENT',
          isClosed: false,
          originalAmount: 24_000,
          currentBalance: 24_000,
          termDays: 30,
        },
      ],
      null,
    );

    expect(result.pmMonthlyDebt).toBeNull();
    expect(result.hasIncomplete).toBe(true);
    expect(result.credits[0].monthlyDebtContribution).toBeNull();
  });

  it('leaves a closed company credit at zero', () => {
    const result = calculatePmCompanyLiabilities(
      [
        {
          creditReference: 'closed',
          institution: 'BANCO',
          creditType: 'CREDITO SIMPLE',
          classification: 'FIXED_PAYMENT',
          isClosed: true,
          originalAmount: 24_000,
          currentBalance: 0,
          termDays: 30,
        },
      ],
      50,
    );

    expect(result.pmMonthlyDebt).toBe(0);
    expect(result.credits[0].monthlyDebtContribution).toBe(0);
  });

  it('keeps a commercial credit out of the financial total', () => {
    const result = calculatePmCompanyLiabilities(
      [
        {
          creditReference: 'simple-30',
          institution: 'BANCO',
          creditType: 'CREDITO SIMPLE',
          classification: 'FIXED_PAYMENT',
          isClosed: false,
          originalAmount: 24_000,
          currentBalance: 24_000,
          termDays: 30,
        },
        {
          creditReference: 'soriana',
          institution: 'SORIANA',
          creditType: 'COMERCIAL',
          classification: 'DEPARTMENT_STORE',
          isClosed: false,
          originalAmount: null,
          currentBalance: null,
          termDays: null,
        },
      ],
      50,
    );

    expect(result.hasIncomplete).toBe(false);
    expect(result.pmMonthlyDebt).toBe(12000);
    expect(result.credits[1].monthlyDebtContribution).toBe(0);
    expect(result.credits[1].ruleApplied).toBe('PM_COMMERCIAL');
  });
});
