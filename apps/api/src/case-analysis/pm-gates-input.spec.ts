import { collectPmGatesInput } from './pm-gates-input';

describe('collectPmGatesInput company names', () => {
  it('compares the company CSF, bureau and statements, and leaves the shareholder statement out', () => {
    const input = collectPmGatesInput(
      {
        asOf: new Date('2026-10-20T00:00:00Z'),
        sharePercentage: null,
        incorporationDate: null,
        estimatedTermMonths: null,
        destination: null,
        legalName: 'ALIMENTOS RAPIDOS PENINSULARES',
        companyRfc: 'ARP210212GC6',
      },
      [
        {
          owner: 'COMPANY',
          documentType: { code: 'CSF' },
          extractedData: { taxpayer: { fullName: 'ALIMENTOS RAPIDOS PENINSULARES SA DE CV' } },
        },
        {
          owner: 'COMPANY',
          documentType: { code: 'CREDIT_BUREAU_REPORT' },
          extractedData: { borrower: { fullName: 'ALIMENTOS RAPIDOS PENINSULARES SA DE CV' } },
        },
        {
          owner: 'COMPANY',
          documentType: { code: 'BANK_STATEMENT' },
          extractedData: { accountHolder: { fullName: 'ALIMENTOS RAPIDOS PENINSULARES SA DE CV' } },
        },
        {
          owner: 'SHAREHOLDER',
          documentType: { code: 'BANK_STATEMENT' },
          extractedData: { accountHolder: { fullName: 'JUAN ANTONIO FRIAS FUENTES' } },
        },
      ],
    );

    expect(input.companyNames).toEqual([
      'ALIMENTOS RAPIDOS PENINSULARES',
      'ALIMENTOS RAPIDOS PENINSULARES SA DE CV',
      'ALIMENTOS RAPIDOS PENINSULARES SA DE CV',
      'ALIMENTOS RAPIDOS PENINSULARES SA DE CV',
    ]);
  });
});
