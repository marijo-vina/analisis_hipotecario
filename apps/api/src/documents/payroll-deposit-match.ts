/**
 * Marks a bank deposit as payroll when the description matches an employer
 * from the case payroll receipts (legal name or RFC). The word "pago" alone
 * is not enough: other deposits use that concept too.
 */

export interface PayrollEmployerRef {
  legalName: string | null;
  rfc: string | null;
}

export interface BankMovement {
  date?: string | null;
  amount?: number | null;
  currency?: string | null;
  movementType?: string | null;
  originalConcept?: string | null;
  payerOrBeneficiaryName?: string | null;
  payerRfc?: string | null;
}

export interface PayrollDepositRecord {
  date: string | null;
  amount: number | null;
  currency: string;
  originalConcept: string | null;
  detectedEmployerOrPayerName: string | null;
  detectedPayerRfc: string | null;
  isPayrollConcept: boolean;
  containsPayrollKeyword: boolean;
  possiblePayrollProvider: false;
}

/** Same catalog the salaried reconciliation already uses. "pago" alone is not included. */
const PAYROLL_CONCEPT_KEYWORDS = [
  'NOMINA',
  'SUELDO',
  'PAGO DE HABERES',
  'HABERES',
  'PAGO EMPLEADO',
  'SPEI EMPLEADOR',
];

const GENERIC_NAME_TOKENS = new Set([
  'SOLUCIONES',
  'TECNOLOGIA',
  'TECNOLOGIAS',
  'SERVICIOS',
  'PUBLICIDAD',
  'GRUPO',
  'COMERCIAL',
  'CONSTRUCTORA',
  'CONSULTORIA',
  'CONSULTORES',
  'EMPRESA',
  'MEXICO',
  'NACIONAL',
  'INTERNACIONAL',
  'INDUSTRIAL',
  'INDUSTRIAS',
  'CORPORATIVO',
  'HOLDING',
  'ASOCIADOS',
  'ASOCIACION',
  'PROMOTORA',
  'DESARROLLOS',
  'INMOBILIARIA',
  'OPERADORA',
  'ADMINISTRADORA',
  'INTEGRADORA',
  'SISTEMAS',
  'DIGITAL',
  'MARKETING',
  'COMUNICACION',
  'SOCIEDAD',
  'ANONIMA',
  'CAPITAL',
  'VARIABLE',
  'PROMOCION',
]);

const RFC_PATTERN = /\b([A-ZÑ&]{3,4}\d{6}[A-Z0-9]{3})\b/;

export function normalizeMatchText(value: string | null | undefined): string {
  if (!value) return '';
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9Ñ&]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRfc(value: string | null | undefined): string | null {
  const compact = normalizeMatchText(value).replace(/ /g, '');
  if (!compact) return null;
  const match = RFC_PATTERN.exec(compact);
  return match ? match[1] : null;
}

/** Brand-like tokens from a razón social. Drops legal suffixes and generic words. */
export function distinctiveEmployerTokens(legalName: string | null | undefined): string[] {
  let text = normalizeMatchText(legalName);
  const suffixes = [
    'S A P I DE C V',
    'SAPI DE CV',
    'S DE R L DE C V',
    'S DE RL DE CV',
    'S A DE C V',
    'SA DE CV',
    'S DE RL',
    'DE CV',
  ];
  for (const suffix of suffixes) {
    text = text.replace(new RegExp(`\\b${suffix}\\b`, 'g'), ' ');
  }
  return text
    .split(' ')
    .filter((token) => token.length >= 6 && !GENERIC_NAME_TOKENS.has(token));
}

export function depositMatchesEmployer(
  concept: string | null | undefined,
  payerRfc: string | null | undefined,
  employer: PayrollEmployerRef,
): boolean {
  const conceptNorm = normalizeMatchText(concept);
  const compactConcept = conceptNorm.replace(/ /g, '');
  const employerRfc = normalizeRfc(employer.rfc);
  const seenRfc = normalizeRfc(payerRfc) ?? normalizeRfc(concept);
  if (employerRfc && (seenRfc === employerRfc || compactConcept.includes(employerRfc))) {
    return true;
  }

  const tokens = distinctiveEmployerTokens(employer.legalName);
  if (tokens.length === 0 || conceptNorm === '') return false;
  const longest = [...tokens].sort((a, b) => b.length - a.length)[0];
  return conceptNorm.includes(longest);
}

export function conceptHasPayrollKeyword(
  concept: string | null | undefined,
): boolean {
  const text = normalizeMatchText(concept);
  if (!text) return false;
  return PAYROLL_CONCEPT_KEYWORDS.some((keyword) => text.includes(keyword));
}

function isIncomingDeposit(movement: BankMovement): boolean {
  const type = (movement.movementType ?? 'DEPOSIT').toUpperCase();
  return type === 'DEPOSIT' || type === 'UNKNOWN';
}

export function selectPayrollDeposits(
  movements: BankMovement[],
  employers: PayrollEmployerRef[],
): PayrollDepositRecord[] {
  const usable = employers.filter((e) => e.legalName || e.rfc);

  const hits: PayrollDepositRecord[] = [];
  for (const movement of movements) {
    if (!isIncomingDeposit(movement)) continue;
    const concept = movement.originalConcept ?? movement.payerOrBeneficiaryName ?? null;
    const keyword =
      conceptHasPayrollKeyword(movement.originalConcept) ||
      conceptHasPayrollKeyword(movement.payerOrBeneficiaryName);
    const matched = usable.find((employer) =>
      depositMatchesEmployer(concept, movement.payerRfc, employer),
    );
    if (!matched && !keyword) continue;
    hits.push({
      date: movement.date ?? null,
      amount: typeof movement.amount === 'number' ? movement.amount : null,
      currency: movement.currency || 'MXN',
      originalConcept: movement.originalConcept ?? null,
      detectedEmployerOrPayerName:
        movement.payerOrBeneficiaryName ?? matched?.legalName ?? null,
      detectedPayerRfc: movement.payerRfc ?? normalizeRfc(matched?.rfc),
      isPayrollConcept: keyword,
      containsPayrollKeyword: keyword,
      possiblePayrollProvider: false,
    });
  }
  return hits;
}

function depositKey(deposit: {
  date?: string | null;
  amount?: number | null;
  originalConcept?: string | null;
}): string {
  return [
    deposit.date ?? '',
    deposit.amount ?? '',
    normalizeMatchText(deposit.originalConcept),
  ].join('|');
}

/**
 * Adds employer-matched movements to `payrollDeposits` and drops the
 * "no payroll deposits" alert when at least one match exists.
 * Returns true when the extracted payload changed.
 */
export function promoteEmployerPayrollDeposits(
  extractedData: Record<string, unknown>,
  employers: PayrollEmployerRef[],
): boolean {
  const movements = Array.isArray(extractedData.allTransactions)
    ? (extractedData.allTransactions as BankMovement[])
    : [];
  const hits = selectPayrollDeposits(movements, employers);
  if (hits.length === 0) return false;

  const existing = Array.isArray(extractedData.payrollDeposits)
    ? (extractedData.payrollDeposits as Record<string, unknown>[])
    : [];
  const seen = new Set(existing.map((deposit) => depositKey(deposit)));
  let added = 0;
  for (const hit of hits) {
    const key = depositKey(hit);
    if (seen.has(key)) continue;
    existing.push(hit as unknown as Record<string, unknown>);
    seen.add(key);
    added += 1;
  }
  extractedData.payrollDeposits = existing;

  const alerts = Array.isArray(extractedData.alerts)
    ? (extractedData.alerts as { code?: string }[])
    : [];
  const nextAlerts = alerts.filter((alert) => alert.code !== 'BANK_NO_PAYROLL_DEPOSITS');
  const removedAlert = nextAlerts.length !== alerts.length;
  if (removedAlert) extractedData.alerts = nextAlerts;

  return added > 0 || removedAlert;
}

/**
 * Salaried statements do not use the PFAE deposit review.
 * Valid income is only payroll-keyword deposits and employer matches.
 * The cover-vs-lines integrity check stays as the cleaner computed it.
 * Returns true when the stored depuration changed.
 */
export function applySalariedPayrollDepuration(
  extractedData: Record<string, unknown>,
): boolean {
  const depuration = extractedData.financialDepuration as
    | {
        incomeMode?: string;
        cleanedDeposits?: unknown[];
        highImpactExceptions?: unknown[];
        depurationSummary?: {
          totalValidIncome?: number;
          validDepositsCount?: number;
          needsReviewCount?: number;
          trashDepositsCount?: number;
          totalTrashDeposits?: number;
        };
      }
    | undefined;
  if (!depuration?.depurationSummary) return false;

  const payroll = Array.isArray(extractedData.payrollDeposits)
    ? (extractedData.payrollDeposits as Record<string, unknown>[])
    : [];
  const cleaned = payroll.map((deposit) => {
    const keyword = deposit.containsPayrollKeyword === true;
    const amount = typeof deposit.amount === 'number' ? deposit.amount : 0;
    return {
      date: (deposit.date as string | null) ?? null,
      amount,
      currency: (deposit.currency as string) || 'MXN',
      originalConcept: (deposit.originalConcept as string) || '',
      payerOrBeneficiaryName:
        (deposit.detectedEmployerOrPayerName as string | null) ?? null,
      payerRfc: (deposit.detectedPayerRfc as string | null) ?? null,
      classification: 'VALID' as const,
      validCategory: 'GENERAL_INCOME',
      reason: keyword
        ? 'Depósito con concepto de nómina'
        : 'Depósito del patrón identificado en la nómina',
      confidenceScore: 0.95,
      isHighImpactOutlier: false,
    };
  });
  const totalValidIncome =
    Math.round(cleaned.reduce((sum, deposit) => sum + deposit.amount, 0) * 100) / 100;
  const summary = depuration.depurationSummary;
  const unchanged =
    depuration.incomeMode === 'PAYROLL' &&
    summary.totalValidIncome === totalValidIncome &&
    summary.validDepositsCount === cleaned.length &&
    summary.needsReviewCount === 0 &&
    summary.trashDepositsCount === 0 &&
    summary.totalTrashDeposits === 0 &&
    Array.isArray(depuration.highImpactExceptions) &&
    depuration.highImpactExceptions.length === 0 &&
    Array.isArray(depuration.cleanedDeposits) &&
    depuration.cleanedDeposits.length === cleaned.length;
  if (unchanged) return false;

  depuration.incomeMode = 'PAYROLL';
  depuration.cleanedDeposits = cleaned;
  depuration.highImpactExceptions = [];
  depuration.depurationSummary = {
    ...summary,
    totalValidIncome,
    validDepositsCount: cleaned.length,
    totalTrashDeposits: 0,
    trashDepositsCount: 0,
    needsReviewCount: 0,
  };

  if (Array.isArray(extractedData.alerts)) {
    extractedData.alerts = (extractedData.alerts as { code?: string }[]).filter(
      (alert) => alert.code !== 'STATEMENT_HIGH_IMPACT_OUTLIER_DETECTED',
    );
  }
  return true;
}

export function employersFromDocuments(
  docs: { documentType?: { code?: string } | null; extractedData?: unknown }[],
): PayrollEmployerRef[] {
  const employers: PayrollEmployerRef[] = [];
  const seen = new Set<string>();
  for (const doc of docs) {
    if (doc.documentType?.code !== 'PAYROLL_RECEIPT') continue;
    const data = (doc.extractedData ?? {}) as Record<string, unknown>;
    const employer = (data.employer ?? {}) as Record<string, unknown>;
    const legalName = (employer.legalName as string) ?? null;
    const rfc = (employer.rfc as string) ?? null;
    if (!legalName && !rfc) continue;
    const key = `${normalizeRfc(rfc) ?? ''}|${normalizeMatchText(legalName)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    employers.push({ legalName, rfc });
  }
  return employers;
}
