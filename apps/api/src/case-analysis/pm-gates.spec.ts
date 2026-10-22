import { evaluatePmGates, type PmGatesInput } from './pm-gates';

const asOf = new Date(2026, 9, 22);

function input(overrides: Partial<PmGatesInput> = {}): PmGatesInput {
  return {
    asOf,
    sharePercentage: 50,
    incorporationDate: '1997-04-28',
    shareEntryDate: '1997-04-28',
    birthDate: '1980-01-15',
    termMonths: 240,
    destination: 'ACQUISITION',
    companyBureauPresent: true,
    companyActivity: 'Servicios de consultoría',
    shareholders: [],
    companyNames: ['MODIEBO'],
    companyRfcs: ['MOD970428AAA'],
    ...overrides,
  };
}

function bank(result: ReturnType<typeof evaluatePmGates>, code: string) {
  return result.banks.find((item) => item.bankCode === code);
}

describe('evaluatePmGates', () => {
  it('blocks Scotiabank at 50% and Banamex at exactly 50%, and keeps Santander', () => {
    const result = evaluatePmGates(input());

    expect(bank(result, 'SCOTIABANK')?.status).toBe('NOT_VIABLE');
    expect(bank(result, 'CITIBANAMEX')?.status).toBe('NOT_VIABLE');
    expect(bank(result, 'SANTANDER')?.status).toBe('VIABLE');
    expect(bank(result, 'BANORTE')?.status).toBe('VIABLE');
    expect(bank(result, 'HSBC')?.status).toBe('VIABLE');
  });

  it('accepts Banamex when the applicant plus a direct relative exceed 50%', () => {
    const result = evaluatePmGates(
      input({
        sharePercentage: 40,
        shareholders: [
          { name: 'SOCIO', percentage: 40, relationshipToApplicant: null },
          { name: 'CONYUGE', percentage: 15, relationshipToApplicant: 'cónyuge' },
        ],
      }),
    );

    expect(bank(result, 'CITIBANAMEX')?.status).toBe('VIABLE');
  });

  it('treats exactly 24 shareholder months as enough for HSBC and not enough for Santander', () => {
    const result = evaluatePmGates(input({ shareEntryDate: '2024-10-22' }));

    expect(bank(result, 'SANTANDER')?.status).toBe('NOT_VIABLE');
    expect(bank(result, 'HSBC')?.status).toBe('VIABLE');
  });

  it('leaves the shareholder-tenure banks incomplete when the acta has no entry date', () => {
    const result = evaluatePmGates(input({ shareEntryDate: null }));

    expect(bank(result, 'SANTANDER')?.status).toBe('INCOMPLETE');
    expect(bank(result, 'HSBC')?.status).toBe('INCOMPLETE');
    expect(bank(result, 'BANORTE')?.status).toBe('VIABLE');
  });

  it('knocks Banorte when the company bureau is missing and HSBC liquidity always', () => {
    const result = evaluatePmGates(
      input({ companyBureauPresent: false, destination: 'LIQUIDITY' }),
    );

    expect(bank(result, 'BANORTE')?.locks.map((lock) => lock.code)).toContain(
      'BURO_EMPRESA_BANORTE',
    );
    expect(bank(result, 'HSBC')?.locks.map((lock) => lock.code)).toContain(
      'HSBC_SIN_LIQUIDEZ',
    );
  });

  it('knocks every bank when the company activity is a casino', () => {
    const result = evaluatePmGates(input({ companyActivity: 'Operación de casinos' }));

    expect(result.prohibitedActivity).not.toBeNull();
    expect(result.banks.every((item) => item.status === 'NOT_VIABLE')).toBe(true);
  });

  it('fails company identity when the RFC differs and the name does not', () => {
    const result = evaluatePmGates(
      input({ companyRfcs: ['MOD970428AAA', 'XXX010101AAA'] }),
    );

    expect(result.companyIdentity).toBe('FAIL');
    expect(result.identityLocks.map((lock) => lock.code)).toEqual(['IDENTIDAD_RFC_EMPRESA']);
  });

  it('fails the term when age plus term passes 80 years and 6 months', () => {
    const result = evaluatePmGates(
      input({ birthDate: '1950-01-01', termMonths: 240 }),
    );

    expect(result.ageExceeded).toBe(true);
    expect(bank(result, 'SANTANDER')?.status).toBe('NOT_VIABLE');
  });
});
