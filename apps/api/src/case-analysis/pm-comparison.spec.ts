import type { PmIncomeBases } from '../income-calculation/income-calculation.types';
import { decidePmBank, resolveBanamexPmFactor } from './pm-comparison';
import type { PmBankGateResult } from './pm-gates';

const STATEMENTS = 1_231_490.59;
const TAX = 873_083.37;

function priced(capacity: number) {
  return {
    status: 'CALCULATED' as const,
    reason: null,
    admissibleIncome: capacity,
    incomeToConsider: capacity,
    maximumDebt: capacity,
    capacity,
  };
}

function gate(bankCode: PmBankGateResult['bankCode'], locks: PmBankGateResult['locks'] = []): PmBankGateResult {
  return {
    bankCode,
    status: locks.length === 0 ? 'VIABLE' : 'NOT_VIABLE',
    locks,
  };
}

function bases(share = 50): PmIncomeBases {
  return {
    profile: 'PM',
    sharePercentage: share,
    activityFactor: 0.5,
    banorteClientFactor: 0.4,
    bank: {
      valid: true,
      invalidReason: null,
      monthlyGross: 11_183_203.42,
      monthlyNet: 11_183_203.42,
      windowMonths: 6,
      monthsUsed: [],
      droppedMax: null,
      droppedMin: null,
    },
    taxReturn: {
      valid: true,
      invalidReason: null,
      monthlyGross: 8_315_945.68,
      monthlyNet: 8_315_945.68,
    },
    activity: {
      description: 'Servicios',
      percentage: 100,
      order: 1,
      matchedKeyword: 'servicio',
      windowMonths: 6,
    },
    capacities: {
      santanderStatements: {
        status: 'CALCULATED',
        reason: null,
        admissibleIncome: 2_795_800.86,
        incomeToConsider: 2_777_828.94,
        maximumDebt: 1_388_914.47,
        capacity: STATEMENTS,
      },
      santanderTaxReturn: {
        status: 'CALCULATED',
        reason: null,
        admissibleIncome: 2_078_986.42,
        incomeToConsider: 2_061_014.5,
        maximumDebt: 1_030_507.25,
        capacity: TAX,
      },
      scotiabank: {
        status: 'CALCULATED',
        reason: null,
        admissibleIncome: 5_591_601.71,
        incomeToConsider: 5_591_601.71,
        maximumDebt: 2_236_640.68,
        capacity: 2_079_216.8,
      },
      banorteStatements: priced(1_000),
      banorteTaxReturn: priced(800),
      hsbcStatements: priced(900),
      hsbcTaxReturn: priced(700),
      banregioStatements: priced(400),
      banregioTaxReturn: priced(300),
      banamexStatements: priced(17_500),
      banamexTaxReturn: {
        status: 'REQUIRES_REVIEW',
        reason: 'BANAMEX_SOLO_ESTADOS',
        admissibleIncome: null,
        incomeToConsider: null,
        maximumDebt: null,
        capacity: null,
      },
    },
  };
}

describe('PM bank comparison', () => {
  it('shows Santander viable with the statement capacity from the engine', () => {
    const decision = decidePmBank({
      bankCode: 'SANTANDER',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(),
      gate: gate('SANTANDER'),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 120,
    });

    expect(decision.status).toBe('PRELIMINARY_VIABLE');
    expect(decision.availableCapacity).toBe(STATEMENTS);
    expect(decision.incomeUsed).toBe(2_777_828.94);
    expect(decision.debtCommitmentFactor).toBe('0.50');
    expect(decision.appliedFactor).toBe('0.50');
    expect(decision.activityTenure.status).toBe('NOT_APPLICABLE');
  });

  it('uses the tax capacity when the chosen source is the return', () => {
    const decision = decidePmBank({
      bankCode: 'SANTANDER',
      incomeSource: 'TAX_RETURN',
      bases: bases(),
      gate: gate('SANTANDER'),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 120,
    });

    expect(decision.status).toBe('PRELIMINARY_VIABLE');
    expect(decision.availableCapacity).toBe(TAX);
  });

  it('keeps Scotiabank out at 50% even though the engine priced it', () => {
    const decision = decidePmBank({
      bankCode: 'SCOTIABANK',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(),
      gate: gate('SCOTIABANK', [{
        code: 'PORCENTAJE_SCOTIABANK',
        message: 'Scotiabank pide al menos 51% de las acciones.',
      }]),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 120,
    });

    expect(decision.status).toBe('NOT_COMPATIBLE');
    expect(decision.reasons).toContain('PORCENTAJE_SCOTIABANK');
    expect(decision.availableCapacity).toBe(2_079_216.8);
    expect(decision.debtCommitmentFactor).toBe('0.40');
  });

  it('fails Scotiabank company tenure below 4 years', () => {
    const decision = decidePmBank({
      bankCode: 'SCOTIABANK',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(60),
      gate: gate('SCOTIABANK', [{
        code: 'ANTIGUEDAD_EMPRESA_SCOTIABANK',
        message: 'Scotiabank pide 4 años de constitución.',
      }]),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 30,
    });

    expect(decision.status).toBe('NOT_COMPATIBLE');
    expect(decision.activityTenure).toMatchObject({
      status: 'FAIL',
      requiredMonths: 48,
      actualMonths: 30,
    });
  });

  it('fails HSBC below 25% or below 2 years with those shares', () => {
    const decision = decidePmBank({
      bankCode: 'HSBC',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(20),
      gate: gate('HSBC', [
        { code: 'PORCENTAJE_HSBC', message: 'HSBC pide al menos 25% de las acciones.' },
        { code: 'ANTIGUEDAD_SOCIO_HSBC', message: 'HSBC pide al menos 2 años con esas acciones.' },
      ]),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 120,
    });

    expect(decision.status).toBe('NOT_COMPATIBLE');
    expect(decision.reasons).toEqual(expect.arrayContaining([
      'PORCENTAJE_HSBC',
      'ANTIGUEDAD_SOCIO_HSBC',
    ]));
  });

  it('uses 15% for a company and 50% for associated professionals', () => {
    expect(resolveBanamexPmFactor('S.A. de C.V.')).toMatchObject({
      kind: 'COMPANIA',
      factor: 0.15,
    });
    expect(resolveBanamexPmFactor('S.C.')).toMatchObject({
      kind: 'PROFESIONISTAS_ASOCIADOS',
      factor: 0.5,
    });
    expect(resolveBanamexPmFactor(null).kind).toBe('UNKNOWN');

    const company = decidePmBank({
      bankCode: 'CITIBANAMEX',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(60),
      gate: gate('CITIBANAMEX'),
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: 60,
    });
    expect(company.appliedFactor).toBe('0.15');
    expect(company.matchedNativeLabel).toBe('compañía');
    expect(company.status).toBe('PRELIMINARY_VIABLE');
    expect(company.availableCapacity).toBe(17_500);
    expect(company.reasons).not.toContain('BANAMEX_PM_CAPACITY_OPEN');

    const civil = decidePmBank({
      bankCode: 'CITIBANAMEX',
      incomeSource: 'BANK_STATEMENTS',
      bases: bases(60),
      gate: gate('CITIBANAMEX'),
      legalForm: 'Sociedad Civil',
      companyTenureMonths: 60,
    });
    expect(civil.appliedFactor).toBe('0.50');
    expect(civil.matchedNativeLabel).toBe('profesionistas asociados');
  });

  it('prices Banregio as an accionista without the other banks locks', () => {
    const pricedBases = bases();
    pricedBases.capacities.banregioStatements = {
      status: 'CALCULATED',
      reason: null,
      admissibleIncome: 100_000,
      incomeToConsider: 50_000,
      maximumDebt: 50_000,
      capacity: 40_000,
    };

    const decision = decidePmBank({
      bankCode: 'BANREGIO',
      incomeSource: 'BANK_STATEMENTS',
      bases: pricedBases,
      gate: null,
      legalForm: 'S.A. de C.V.',
      companyTenureMonths: null,
    });

    expect(decision.status).toBe('PRELIMINARY_VIABLE');
    expect(decision.availableCapacity).toBe(40_000);
    expect(decision.incomeUsed).toBe(50_000);
    expect(decision.appliedFactor).toBe('1.00');
    expect(decision.matchedNativeLabel).toBe('Accionista');
    expect(decision.debtCommitmentFactor).toBe('0.50');
    expect(decision.reasons).not.toContain('PM_SIN_POLITICA');
  });
});
