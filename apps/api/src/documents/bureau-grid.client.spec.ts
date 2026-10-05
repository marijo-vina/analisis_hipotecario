import { mergeBureauGrid, type BureauGridCredit } from './bureau-grid.client';

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
        creditLimit: 160000,
        mopCodes: ['1'],
        rawTextReference: 'AMEX COMPANY TARJETA DE CREDITO',
      },
    ];

    mergeBureauGrid(credits, [
      {
        institution: 'AMEX',
        accountNumber: '4000000000000001',
        paymentDueAmount: 1875,
        lastPaymentAmount: 50000,
        currentBalance: 30000,
        creditLimit: 150000,
        maxCredit: 200000,
        mopCodes: ['1'],
      },
      {
        institution: 'AMEX COMPANY',
        accountNumber: '4000000000000003',
        paymentDueAmount: 0,
        lastPaymentAmount: 41600,
        currentBalance: 45000,
        creditLimit: null,
        maxCredit: 160000,
        mopCodes: ['1', '1', '3'],
      },
    ]);

    expect(credits[0].paymentDueAmount).toBe(1875);
    expect(credits[1].mopCodes).toEqual(['1', '1', '3']);
    expect(credits[1].accountNumber).toBe('4000000000000003');
  });
});
