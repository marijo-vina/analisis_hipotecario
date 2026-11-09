import {
  mergeBureauGrid,
  mergeCompanyBureauGrid,
  type BureauGridCredit,
  type CompanyBureauGridCredit,
} from './bureau-grid.client';

const banamexGrid: BureauGridCredit = {
  institution: 'BANAMEX TC L',
  accountNumber: '4037070121465753',
  paymentDueAmount: 1710,
  lastPaymentAmount: 19454,
  currentBalance: 32790,
  creditLimit: 49600,
  maxCredit: 48509,
  mopCodes: ['1', '1', '1'],
};

describe('mergeBureauGrid', () => {
  it('reads the account from raw text when accountNumber is empty', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'BANAMEX',
        creditLimit: 48509,
        mopCodes: ['1'],
        paymentDueAmount: null,
        rawTextReference:
          'BANAMEX TC L 010 4037070121465753 1. Saldo actual: 32,790',
      },
    ];

    mergeBureauGrid(credits, [banamexGrid]);

    expect(credits[0].creditLimit).toBe(49600);
    expect(credits[0].maxCredit).toBe(48509);
    expect(credits[0].paymentDueAmount).toBe(1710);
    expect(credits[0].mopCodes).toEqual(['1', '1', '1']);
    expect(credits[0].accountNumber).toBe('4037070121465753');
  });

  it('keeps a late digit that makes the history yellow', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'HSBC MEXICO',
        creditLimit: 538439,
        mopCodes: ['1'],
        rawTextReference: 'HSBC MEXICO 5221748001881339',
      },
    ];

    mergeBureauGrid(credits, [
      {
        institution: 'HSBC MEXICO',
        accountNumber: '5221748001881339',
        paymentDueAmount: 19049,
        lastPaymentAmount: 387,
        currentBalance: 434374,
        creditLimit: 500000,
        maxCredit: 538439,
        mopCodes: ['1', '2', '1'],
      },
    ]);

    expect(credits[0].creditLimit).toBe(500000);
    expect(credits[0].maxCredit).toBe(538439);
    expect(credits[0].mopCodes).toEqual(['1', '2', '1']);
    expect(credits[0].paymentDueAmount).toBe(19049);
  });

  it('joins a split Infonavit account so the grid limit and payment win', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'INFONAVIT',
        creditLimit: 784,
        paymentDueAmount: 0,
        mopCodes: ['1'],
        rawTextReference:
          'INFONAVIT 01003100000000312100 8542 16. Saldo actual: 0 BIENES RAICES CERRADO',
      },
    ];

    mergeBureauGrid(credits, [
      {
        institution: 'INFONAVIT',
        accountNumber: '010031000000003121008542',
        paymentDueAmount: 360,
        lastPaymentAmount: 7771,
        currentBalance: 0,
        creditLimit: 409042,
        maxCredit: 409042,
        mopCodes: ['1', '1', '1'],
      },
    ]);

    expect(credits[0].creditLimit).toBe(409042);
    expect(credits[0].paymentDueAmount).toBe(360);
    expect(credits[0].accountNumber).toBe('010031000000003121008542');
  });

  it('pairs a closed HSBC with no Gemini account by institution order', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'HSBC MEXICO',
        creditLimit: 57190,
        mopCodes: ['1'],
        rawTextReference: 'HSBC MEXICO TARJETA DE CREDITO CERRADO',
      },
      {
        institution: 'HSBC MEXICO',
        creditLimit: 57190,
        mopCodes: ['1'],
        rawTextReference: 'HSBC MEXICO TARJETA DE CREDITO CERRADO',
      },
    ];

    mergeBureauGrid(credits, [
      {
        institution: 'HSBC MEXICO',
        accountNumber: '4912838016196943',
        paymentDueAmount: 0,
        lastPaymentAmount: 0,
        currentBalance: 0,
        creditLimit: 1,
        maxCredit: 57190,
        mopCodes: ['1', 'U'],
      },
      {
        institution: 'HSBC MEXICO',
        accountNumber: '4912838016139737',
        paymentDueAmount: 0,
        lastPaymentAmount: 0,
        currentBalance: 0,
        creditLimit: 1,
        maxCredit: 57190,
        mopCodes: ['1', '1', '1', '3'],
      },
    ]);

    expect(credits[0].creditLimit).toBe(1);
    expect(credits[0].maxCredit).toBe(57190);
    expect(credits[0].accountNumber).toBe('4912838016196943');
    expect(credits[1].creditLimit).toBe(1);
    expect(credits[1].mopCodes).toEqual(['1', '1', '1', '3']);
  });

  it('does not give an AMEX row to AMEX COMPANY when both lack accounts', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'AMEX',
        creditLimit: 150000,
        mopCodes: ['1'],
        rawTextReference: 'AMEX TARJETA DE CREDITO',
      },
      {
        institution: 'AMEX COMPANY',
        creditLimit: 153441,
        mopCodes: ['1'],
        rawTextReference: 'AMEX COMPANY TARJETA DE CREDITO',
      },
    ];

    mergeBureauGrid(credits, [
      {
        institution: 'AMEX',
        accountNumber: '376722482104002',
        paymentDueAmount: 1875,
        lastPaymentAmount: 50000,
        currentBalance: 30283,
        creditLimit: 150000,
        maxCredit: 193336,
        mopCodes: ['1'],
      },
      {
        institution: 'AMEX COMPANY',
        accountNumber: '376702569371005',
        paymentDueAmount: 0,
        lastPaymentAmount: 41600,
        currentBalance: 49948,
        creditLimit: null,
        maxCredit: 153441,
        mopCodes: ['1', '1', '3'],
      },
    ]);

    expect(credits[0].paymentDueAmount).toBe(1875);
    expect(credits[1].mopCodes).toEqual(['1', '1', '3']);
    expect(credits[1].accountNumber).toBe('376702569371005');
  });
});

describe('mergeCompanyBureauGrid', () => {
  const cemex: CompanyBureauGridCredit = {
    institution: 'CEMEX SAB',
    accountNumber: '0050017615',
    creditType: 'LINEA DE CREDITO',
    classification: 'REVOLVING',
    originalAmount: 3_850_000,
    currentBalance: 0,
    pastDueAmount: 0,
    termDays: 30,
    mopCodes: ['1', '1', '2'],
  };

  it('writes granted amount, balance and term onto the matching account', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'CEMEX',
        accountNumber: '0050017615',
        originalAmount: null,
        currentBalance: 0,
        classification: 'UNKNOWN',
      },
    ];

    mergeCompanyBureauGrid(credits, [cemex]);

    expect(credits).toHaveLength(1);
    expect(credits[0].originalAmount).toBe(3_850_000);
    expect(credits[0].currentBalance).toBe(0);
    expect(credits[0].termDays).toBe(30);
    expect(credits[0].classification).toBe('REVOLVING');
    expect(credits[0].mopCodes).toEqual(['1', '1', '2']);
  });

  it('appends a company credit Gemini did not return', () => {
    const credits: Record<string, unknown>[] = [];

    mergeCompanyBureauGrid(credits, [cemex]);

    expect(credits).toHaveLength(1);
    expect(credits[0].accountNumber).toBe('0050017615');
    expect(credits[0].originalAmount).toBe(3_850_000);
    expect(credits[0].status).toBe('ACTIVE');
  });

  it('fills the account on the existing row instead of appending a second copy', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'ARRENDADORA',
        accountNumber: null,
        originalAmount: 29_311_000,
        currentBalance: 26_610_000,
        paymentDueAmount: null,
      },
    ];

    mergeCompanyBureauGrid(credits, [
      {
        institution: 'ARRENDADORA',
        accountNumber: 'MPM00080',
        creditType: 'ARRENDAMIENTO PURO',
        classification: 'FIXED_PAYMENT',
        originalAmount: 29_311_000,
        currentBalance: 26_610_000,
        pastDueAmount: 0,
        termDays: 7296,
      },
    ]);

    expect(credits).toHaveLength(1);
    expect(credits[0].accountNumber).toBe('MPM00080');
    expect(credits[0].termDays).toBe(7296);
  });

  it('moves a past-due amount out of the payment field', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'BANCA MIFEL',
        accountNumber: null,
        originalAmount: 3_750_000,
        currentBalance: 0,
        paymentDueAmount: 679_000,
      },
    ];

    mergeCompanyBureauGrid(credits, [
      {
        institution: 'BANCA MIFEL',
        accountNumber: '03000459980',
        creditType: 'SIMPLE',
        classification: 'FIXED_PAYMENT',
        originalAmount: 3_750_000,
        currentBalance: 0,
        pastDueAmount: 679_000,
        termDays: 1095,
      },
    ]);

    expect(credits).toHaveLength(1);
    expect(credits[0].pastDueAmount).toBe(679_000);
    expect(credits[0].paymentDueAmount).toBeNull();
    expect(credits[0].accountNumber).toBe('03000459980');
  });

  it('keeps a commercial overdue amount out of the payment field', () => {
    const credits: Record<string, unknown>[] = [
      {
        institution: 'SORIANA',
        classification: 'DEPARTMENT_STORE',
        paymentDueAmount: 58_000,
        currentBalance: 0,
      },
    ];

    mergeCompanyBureauGrid(credits, []);

    expect(credits).toHaveLength(1);
    expect(credits[0].pastDueAmount).toBe(58_000);
    expect(credits[0].paymentDueAmount).toBeNull();
  });
});
