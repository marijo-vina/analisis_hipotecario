import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** One credit row from the pdfplumber grid service. */
export interface BureauGridCredit {
  institution: string;
  accountNumber: string | null;
  paymentDueAmount: number | null;
  lastPaymentAmount: number | null;
  currentBalance: number | null;
  creditLimit: number | null;
  maxCredit: number | null;
  mopCodes: string[];
}

/**
 * Ask the local Python grid for column-accurate bureau figures.
 * Returns null when the service is down or the body is unusable so the
 * caller can keep the existing extraction.
 */
@Injectable()
export class BureauGridClient {
  private readonly logger = new Logger(BureauGridClient.name);

  constructor(private readonly configService: ConfigService) {}

  async extract(pdf: Buffer): Promise<BureauGridCredit[] | null> {
    const credits = await this.post('/extract/bureau', pdf);
    return credits as BureauGridCredit[] | null;
  }

  /** Personas Morales report. Amounts come back in pesos. */
  async extractCompany(pdf: Buffer): Promise<CompanyBureauGridCredit[] | null> {
    const credits = await this.post('/extract/bureau-company', pdf);
    return credits as CompanyBureauGridCredit[] | null;
  }

  /** BBVA movement rows whose amount sits in the ABONOS column. */
  async extractBbvaDeposits(pdf: Buffer): Promise<BbvaGridDeposit[] | null> {
    const body = await this.postJson('/extract/bbva-statement', pdf);
    const rows = body?.deposits;
    if (!Array.isArray(rows)) return null;
    const deposits: BbvaGridDeposit[] = [];
    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const amount = (row as { amount?: unknown }).amount;
      const concept = (row as { concept?: unknown }).concept;
      const date = (row as { date?: unknown }).date;
      if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) {
        continue;
      }
      deposits.push({
        date: typeof date === 'string' && date.trim() !== '' ? date : null,
        amount,
        concept: typeof concept === 'string' ? concept : '',
      });
    }
    return deposits.length > 0 ? deposits : null;
  }

  private async post(path: string, pdf: Buffer): Promise<unknown[] | null> {
    const body = await this.postJson(path, pdf);
    if (!body || !Array.isArray(body.credits)) return null;
    return body.credits;
  }

  private async postJson(
    path: string,
    pdf: Buffer,
  ): Promise<{ credits?: unknown; deposits?: unknown } | null> {
    const base =
      this.configService.get<string>('BUREAU_GRID_URL') ??
      'http://127.0.0.1:8077';
    const url = `${base.replace(/\/$/, '')}${path}`;
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }),
      'bureau.pdf',
    );
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 45_000);
    try {
      const response = await fetch(url, {
        method: 'POST',
        body: form,
        signal: controller.signal,
      });
      if (!response.ok) {
        this.logger.warn(
          `[BureauGrid] HTTP ${response.status} from ${url}`,
        );
        return null;
      }
      const body = (await response.json()) as {
        credits?: unknown;
        deposits?: unknown;
      };
      return body ?? null;
    } catch (err) {
      this.logger.warn(
        `[BureauGrid] Unavailable, keeping the current extraction: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
}

/** One BBVA deposit taken from the ABONOS column. */
export interface BbvaGridDeposit {
  date: string | null;
  amount: number;
  concept: string;
}

/** One active credit from a Personas Morales report, already in pesos. */
export interface CompanyBureauGridCredit {
  institution: string;
  accountNumber: string | null;
  creditType: string | null;
  classification: string | null;
  originalAmount: number | null;
  currentBalance: number | null;
  pastDueAmount: number | null;
  termDays: number | null;
  mopCodes?: string[];
}

function digits(value: unknown): string {
  return String(value ?? '').replace(/\D/g, '');
}

function institutionKey(name: string): string {
  return name.replace(/[^0-9A-ZÑ]/gi, '').toUpperCase();
}

function institutionsRelated(left: string, right: string): boolean {
  const a = institutionKey(left);
  const b = institutionKey(right);
  if (!a || !b) return false;
  const head = 8;
  return a.startsWith(b.slice(0, head)) || b.startsWith(a.slice(0, head));
}

function institutionsEqual(left: string, right: string): boolean {
  const a = institutionKey(left);
  const b = institutionKey(right);
  return !!a && a === b;
}

function accountsMatch(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  if (
    left.length >= 4 &&
    right.length >= 4 &&
    left.slice(-4) === right.slice(-4)
  ) {
    return true;
  }
  const [short, long] =
    left.length <= right.length ? [left, right] : [right, left];
  const extra = long.length - short.length;
  return (
    short.length >= 10 &&
    extra >= 3 &&
    extra <= 6 &&
    long.startsWith(short)
  );
}

/**
 * Gemini often leaves accountNumber empty and puts the digits inside
 * rawTextReference. OCR may split a long account (`…12100 8542`). The
 * longest 6+ run is the account; a short tail glued to a long run wins
 * when it is longer than the pieces.
 */
function accountFromCredit(credit: Record<string, unknown>): string {
  const direct = digits(credit.accountNumber);
  const raw = String(credit.rawTextReference ?? '');
  const glued = (raw.match(/\d{10,}\s+\d{3,6}(?!\d)/g) ?? []).map((piece) =>
    piece.replace(/\s+/g, ''),
  );
  const runs: string[] = raw.match(/\d{6,}/g) ?? [];
  const candidates = [direct, ...glued, ...runs].filter(
    (value) => value.length >= 6,
  );
  if (candidates.length === 0) return '';
  return candidates.reduce((best, run) =>
    run.length > best.length ? run : best,
  );
}

/**
 * Copy limit, maximum, payment and payment-history codes from the grid
 * onto Gemini credits. The limit is never filled with the maximum.
 */
export function mergeBureauGrid(
  credits: Record<string, unknown>[],
  grid: BureauGridCredit[],
): void {
  const claimed = new Set<number>();
  const assigned = new Set<Record<string, unknown>>();

  const claim = (index: number, credit: Record<string, unknown>): void => {
    claimed.add(index);
    assigned.add(credit);
    const row = grid[index];
    if (typeof row.creditLimit === 'number') {
      credit.creditLimit = row.creditLimit;
    }
    if (typeof row.maxCredit === 'number') {
      credit.maxCredit = row.maxCredit;
    }
    if (typeof row.paymentDueAmount === 'number') {
      credit.paymentDueAmount = row.paymentDueAmount;
      credit.paymentDueAmountSource = 'BAND_MATCH';
      credit.paymentDueAmountConfirmed = true;
      credit.candidatePaymentDueAmount = row.paymentDueAmount;
    }
    if (typeof row.lastPaymentAmount === 'number') {
      credit.lastPaymentAmount = row.lastPaymentAmount;
    }
    if (typeof row.currentBalance === 'number') {
      credit.currentBalance = row.currentBalance;
    }
    if (Array.isArray(row.mopCodes) && row.mopCodes.length > 0) {
      credit.mopCodes = row.mopCodes.map((code) => String(code));
      credit.paymentHistory = row.mopCodes.join('');
    }
    if (row.accountNumber && !credit.accountNumber) {
      credit.accountNumber = row.accountNumber;
    }
  };

  for (const credit of credits) {
    const account = accountFromCredit(credit);
    const institution = String(credit.institution ?? '');
    let match = -1;

    if (account) {
      match = grid.findIndex(
        (row, index) =>
          !claimed.has(index) &&
          accountsMatch(account, digits(row.accountNumber)) &&
          institutionsRelated(institution, row.institution ?? ''),
      );
      if (match === -1) {
        match = grid.findIndex(
          (row, index) =>
            !claimed.has(index) &&
            digits(row.accountNumber) === account,
        );
      }
    }

    if (match === -1 && account && institution) {
      match = grid.findIndex(
        (row, index) =>
          !claimed.has(index) &&
          !digits(row.accountNumber) &&
          institutionsRelated(institution, row.institution ?? ''),
      );
    }

    if (match === -1) continue;
    claim(match, credit);
  }

  for (const credit of credits) {
    if (assigned.has(credit)) continue;
    if (accountFromCredit(credit)) continue;
    const institution = String(credit.institution ?? '');
    if (!institution) continue;
    const match = grid.findIndex(
      (row, index) =>
        !claimed.has(index) &&
        institutionsEqual(institution, row.institution ?? ''),
    );
    if (match === -1) continue;
    claim(match, credit);
  }
}

function sameCompanyAccount(left: string, right: string): boolean {
  if (!left || !right) return false;
  if (left === right) return true;
  const short = left.length <= right.length ? left : right;
  const long = left.length < right.length ? right : left;
  return short.length >= 6 && long.endsWith(short);
}

function applyCompanyRow(
  credit: Record<string, unknown>,
  row: CompanyBureauGridCredit,
): void {
  if (row.institution) credit.institution = row.institution;
  if (row.accountNumber) credit.accountNumber = row.accountNumber;
  if (row.creditType) credit.creditType = row.creditType;
  if (row.classification && row.classification !== 'UNKNOWN') {
    credit.classification = row.classification;
  }
  if (row.originalAmount != null) credit.originalAmount = row.originalAmount;
  if (row.currentBalance != null) credit.currentBalance = row.currentBalance;
  if (row.pastDueAmount != null) credit.pastDueAmount = row.pastDueAmount;
  if (row.termDays != null) credit.termDays = row.termDays;
  if (Array.isArray(row.mopCodes) && row.mopCodes.length > 0) {
    credit.mopCodes = row.mopCodes.map((code) => String(code));
    credit.paymentHistory = row.mopCodes.join('');
  }
}

/**
 * Overwrite the company columns (tipo, saldo, crédito otorgado, plazo)
 * from the Personas Morales reader. Amounts are already in pesos.
 * A grid row with no matching account is appended.
 */
export function mergeCompanyBureauGrid(
  credits: Record<string, unknown>[],
  grid: CompanyBureauGridCredit[],
): void {
  const claimed = new Set<number>();
  for (const credit of credits) {
    const account = accountFromCredit(credit);
    if (!account) continue;
    const match = grid.findIndex(
      (row, index) =>
        !claimed.has(index) &&
        sameCompanyAccount(account, digits(row.accountNumber)),
    );
    if (match === -1) continue;
    claimed.add(match);
    applyCompanyRow(credit, grid[match]);
  }
  for (const [index, row] of grid.entries()) {
    if (claimed.has(index)) continue;
    const credit: Record<string, unknown> = { status: 'ACTIVE' };
    applyCompanyRow(credit, row);
    credits.push(credit);
  }
}
