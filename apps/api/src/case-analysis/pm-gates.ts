import { completedShareTenureMonths } from '../documents/articles-shareholding';
import { matchGlobalNonSusceptibleActivity } from './non-susceptible-activities';

export const PM_GATE_BANKS = [
  'SANTANDER',
  'SCOTIABANK',
  'BANORTE',
  'HSBC',
  'CITIBANAMEX',
] as const;

export type PmGateBankCode = (typeof PM_GATE_BANKS)[number];
export type PmBankGateStatus = 'VIABLE' | 'NOT_VIABLE' | 'INCOMPLETE';

export interface PmGateLock {
  code: string;
  message: string;
}

export interface PmBankGateResult {
  bankCode: PmGateBankCode;
  status: PmBankGateStatus;
  locks: PmGateLock[];
}

export interface PmShareholderRow {
  name: string;
  percentage: number | null;
  relationshipToApplicant: string | null;
}

export interface PmGatesInput {
  asOf: Date;
  sharePercentage: number | null;
  incorporationDate: string | null;
  shareEntryDate: string | null;
  birthDate: string | null;
  termMonths: number | null;
  destination: string | null;
  companyBureauPresent: boolean;
  companyActivity: string | null;
  shareholders: PmShareholderRow[];
  companyNames: string[];
  companyRfcs: string[];
}

export interface PmGatesResult {
  banks: PmBankGateResult[];
  companyIdentity: 'PASS' | 'FAIL';
  identityLocks: PmGateLock[];
  prohibitedActivity: string | null;
  ageExceeded: boolean;
}

const AGE_LIMIT_MONTHS = 80 * 12 + 6;

/** PDF company-operation months. The CMA activity column stays the PFAE arraigo. */
export const PM_COMPANY_TENURE_MONTHS: Partial<Record<PmGateBankCode, number>> = {
  SCOTIABANK: 48,
  BANORTE: 24,
  CITIBANAMEX: 48,
};
const FAMILY =
  /c[oó]nyuge|espos[oa]|hijo|hija|padre|madre|herman[oa]/i;

export function evaluatePmGates(input: PmGatesInput): PmGatesResult {
  const identityLocks = companyIdentityLocks(input.companyNames, input.companyRfcs);
  const exclusion = matchGlobalNonSusceptibleActivity(input.companyActivity);
  const prohibitedActivity = exclusion.kind === 'excluded' ? exclusion.label : null;
  const ageMonths =
    input.birthDate == null
      ? null
      : completedShareTenureMonths(input.birthDate, input.asOf);
  const ageExceeded =
    ageMonths != null &&
    input.termMonths != null &&
    ageMonths + input.termMonths > AGE_LIMIT_MONTHS;
  const companyMonths =
    input.incorporationDate == null
      ? null
      : completedShareTenureMonths(input.incorporationDate, input.asOf);
  const shareMonths =
    input.shareEntryDate == null
      ? null
      : completedShareTenureMonths(input.shareEntryDate, input.asOf);

  const banks = PM_GATE_BANKS.map((bankCode) => {
    const locks: PmGateLock[] = [];
    if (prohibitedActivity) {
      locks.push({
        code: 'GIRO_NO_SUSCEPTIBLE',
        message: `La actividad de la empresa no es susceptible de financiamiento (${prohibitedActivity}).`,
      });
    }
    if (ageExceeded) {
      locks.push({
        code: 'EDAD_MAS_PLAZO',
        message: 'La edad al vencimiento pasa de 80 años y 6 meses.',
      });
    }
    locks.push(
      ...locksForBank(bankCode, input, companyMonths, shareMonths),
    );
    return { bankCode, status: statusFor(locks), locks };
  });

  return {
    banks,
    companyIdentity: identityLocks.length > 0 ? 'FAIL' : 'PASS',
    identityLocks,
    prohibitedActivity,
    ageExceeded,
  };
}

function locksForBank(
  bank: PmGateBankCode,
  input: PmGatesInput,
  companyMonths: number | null,
  shareMonths: number | null,
): PmGateLock[] {
  const locks: PmGateLock[] = [];
  const share = input.sharePercentage;

  if (bank === 'SANTANDER') {
    if (share == null) locks.push(missingShare());
    else if (share <= 1) {
      locks.push({
        code: 'PORCENTAJE_SANTANDER',
        message: 'Santander pide más de 1% de las acciones.',
      });
    }
    if (shareMonths == null) locks.push(missingShareTenure());
    else if (shareMonths <= 24) {
      locks.push({
        code: 'ANTIGUEDAD_SOCIO_SANTANDER',
        message: 'Santander pide más de 2 años como accionista.',
      });
    }
  }

  if (bank === 'SCOTIABANK') {
    if (share == null) locks.push(missingShare());
    else if (share < 51) {
      locks.push({
        code: 'PORCENTAJE_SCOTIABANK',
        message: 'Scotiabank pide al menos 51% de las acciones.',
      });
    }
    pushCompanyAge(
      locks,
      companyMonths,
      PM_COMPANY_TENURE_MONTHS.SCOTIABANK ?? 48,
      'ANTIGUEDAD_EMPRESA_SCOTIABANK',
      'Scotiabank pide 4 años de constitución.',
    );
  }

  if (bank === 'BANORTE') {
    if (share == null) locks.push(missingShare());
    else if (share < 10) {
      locks.push({
        code: 'PORCENTAJE_BANORTE',
        message: 'Banorte pide al menos 10% de las acciones.',
      });
    }
    pushCompanyAge(
      locks,
      companyMonths,
      PM_COMPANY_TENURE_MONTHS.BANORTE ?? 24,
      'ANTIGUEDAD_EMPRESA_BANORTE',
      'Banorte pide 2 años de constitución.',
    );
    if (!input.companyBureauPresent) {
      locks.push({
        code: 'BURO_EMPRESA_BANORTE',
        message: 'Banorte no es viable sin el buró de la empresa.',
      });
    }
  }

  if (bank === 'HSBC') {
    if (input.destination === 'LIQUIDITY') {
      locks.push({
        code: 'HSBC_SIN_LIQUIDEZ',
        message: 'HSBC no ofrece liquidez para Persona Moral.',
      });
    }
    if (share == null) locks.push(missingShare());
    else if (share < 25) {
      locks.push({
        code: 'PORCENTAJE_HSBC',
        message: 'HSBC pide al menos 25% de las acciones.',
      });
    }
    if (shareMonths == null) locks.push(missingShareTenure());
    else if (shareMonths < 24) {
      locks.push({
        code: 'ANTIGUEDAD_SOCIO_HSBC',
        message: 'HSBC pide al menos 2 años con esas acciones.',
      });
    }
  }

  if (bank === 'CITIBANAMEX') {
    if (share == null) locks.push(missingShare());
    else if (!banamexParticipation(share, input.shareholders)) {
      locks.push({
        code: 'PORCENTAJE_BANAMEX',
        message: 'Banamex pide más de 50% del solicitante o de su familia directa.',
      });
    }
    pushCompanyAge(
      locks,
      companyMonths,
      PM_COMPANY_TENURE_MONTHS.CITIBANAMEX ?? 48,
      'ANTIGUEDAD_EMPRESA_BANAMEX',
      'Banamex pide 4 años de constitución.',
    );
  }

  return locks;
}

function pushCompanyAge(
  locks: PmGateLock[],
  months: number | null,
  minimum: number,
  code: string,
  message: string,
): void {
  if (months == null) {
    locks.push({
      code: 'SIN_FECHA_CONSTITUCION',
      message: 'No hay fecha de constitución para evaluar la antigüedad de la empresa.',
    });
    return;
  }
  if (months < minimum) locks.push({ code, message });
}

function missingShare(): PmGateLock {
  return {
    code: 'SIN_PORCENTAJE',
    message: 'No hay porcentaje de participación para evaluar el candado.',
  };
}

function missingShareTenure(): PmGateLock {
  return {
    code: 'SIN_ANTIGUEDAD_SOCIO',
    message: 'El acta no fija la fecha de ingreso del solicitante.',
  };
}

function banamexParticipation(share: number, shareholders: PmShareholderRow[]): boolean {
  if (share > 50) return true;
  const family = shareholders
    .filter((row) => FAMILY.test(row.relationshipToApplicant ?? ''))
    .reduce((sum, row) => sum + (row.percentage ?? 0), 0);
  return share + family > 50;
}

function statusFor(locks: PmGateLock[]): PmBankGateStatus {
  if (locks.length === 0) return 'VIABLE';
  const hard = locks.some((lock) => !lock.code.startsWith('SIN_'));
  return hard ? 'NOT_VIABLE' : 'INCOMPLETE';
}

function companyIdentityLocks(names: string[], rfcs: string[]): PmGateLock[] {
  const locks: PmGateLock[] = [];
  if (distinct(names.map(normalizeName)).length > 1) {
    locks.push({
      code: 'IDENTIDAD_RAZON_SOCIAL',
      message: 'La razón social no coincide entre los documentos de la empresa.',
    });
  }
  if (distinct(rfcs.map(normalizeRfc)).length > 1) {
    locks.push({
      code: 'IDENTIDAD_RFC_EMPRESA',
      message: 'El RFC de la empresa no coincide entre los documentos.',
    });
  }
  return locks;
}

function distinct(values: string[]): string[] {
  return [...new Set(values.filter((value) => value !== ''))];
}

function normalizeName(value: string): string {
  const folded = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const suffixes = [
    'S A P I DE C V',
    'SAPI DE CV',
    'S DE R L DE C V',
    'S DE RL DE CV',
    'S A DE C V',
    'SA DE CV',
  ];
  for (const suffix of suffixes) {
    if (folded === suffix) return folded;
    if (folded.endsWith(` ${suffix}`)) return folded.slice(0, -suffix.length).trim();
  }
  return folded;
}

function normalizeRfc(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9&Ñ]/g, '');
}
