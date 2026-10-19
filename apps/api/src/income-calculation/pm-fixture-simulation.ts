import { readFileSync } from 'fs';
import { join } from 'path';
import { LiabilityCalculationService } from '../liability/liability.service';
import {
  mapBureauCreditToInput,
  mapCompanyBureauCredit,
} from '../liability/credit-mapper';
import { resolveActivity, type TaxReturnExtract } from './pfae-income.helpers';
import {
  calculatePmCapacities,
  pmTaxBase,
  smoothCompanyDeposits,
  type PmCapacityResult,
} from './pm-capacity';
import {
  evaluateSantanderDepositGate,
  groupCompanyStatementMonths,
  selectLatestProcessedFiscal,
  type CompanyStatementInput,
} from './pm-company-statements';
import type { CsfActivityInput } from './pfae-income.helpers';

export interface PmOcrDocument {
  owner: 'COMPANY' | 'SHAREHOLDER';
  type: string;
  status?: string;
  processedAt?: string;
  createdAt?: string;
  extractedData: Record<string, unknown>;
}

/** Extracted JSON in the same shape the OCR pipeline stores on a document. */
export interface PmOcrFixture {
  case: {
    personType?: string;
    sharePercentage: number | null;
  };
  documents: PmOcrDocument[];
}

export interface PmSimulationResult {
  sharePercentage: number | null;
  smoothedMonthly: number | null;
  pmMonthlyDebt: number | null;
  pfMonthlyDebt: number | null;
  capacities: PmCapacityResult;
}

const FIXTURE_PATH = join(__dirname, 'fixtures', 'pm-ejemplo.ocr.json');

export function loadPmEjemploFixture(): PmOcrFixture {
  return JSON.parse(readFileSync(FIXTURE_PATH, 'utf8')) as PmOcrFixture;
}

/**
 * Runs the persona moral income and debt formulas on extracted JSON.
 * No database, no PDF, and no OCR call.
 */
export async function simulatePmOcrCase(
  fixture: PmOcrFixture,
): Promise<PmSimulationResult> {
  const companyDocs = fixture.documents.filter((doc) => doc.owner === 'COMPANY');
  const fiscal = selectLatestProcessedFiscal(
    companyDocs.map((doc) => ({
      typeCode: doc.type,
      statusCode: doc.status ?? '',
      processedAt: doc.processedAt,
      createdAt: doc.createdAt,
      value: doc.extractedData,
    })),
  );
  const activities =
    ((fiscal ?? {}) as { activities?: CsfActivityInput[] }).activities ?? [];
  const activity = resolveActivity(activities);
  const statements = companyDocs
    .filter((doc) => doc.type === 'BANK_STATEMENT')
    .map((doc) => doc.extractedData as CompanyStatementInput);
  const months = groupCompanyStatementMonths(statements);
  const gate = evaluateSantanderDepositGate(months, activity.windowMonths);
  const bank = smoothCompanyDeposits(months, activity.windowMonths);
  const tax = pmTaxBase(latestTax(companyDocs));

  const liabilities = await new LiabilityCalculationService(
    fakePrisma() as never,
  ).calculatePersonaMoral(
    'pm-ejemplo',
    creditsOf(fixture, 'SHAREHOLDER').map(mapBureauCreditToInput),
    creditsOf(fixture, 'COMPANY').map(mapCompanyBureauCredit),
    fixture.case.sharePercentage,
  );

  const capacities = calculatePmCapacities({
    bank,
    tax,
    depositGateViable: gate.viable,
    activityDescription: activity.description,
    sharePercentage: fixture.case.sharePercentage,
    pmMonthlyDebt: liabilities.pmMonthlyDebt ?? null,
    pfMonthlyDebt: liabilities.grossCurrentMonthlyDebt,
  });

  return {
    sharePercentage: fixture.case.sharePercentage,
    smoothedMonthly: bank.monthlyGross,
    pmMonthlyDebt: liabilities.pmMonthlyDebt ?? null,
    pfMonthlyDebt: liabilities.grossCurrentMonthlyDebt,
    capacities,
  };
}

function creditsOf(
  fixture: PmOcrFixture,
  owner: PmOcrDocument['owner'],
): Record<string, unknown>[] {
  const report = fixture.documents.find(
    (doc) => doc.owner === owner && doc.type === 'CREDIT_BUREAU_REPORT',
  );
  const credits = report?.extractedData.credits;
  return Array.isArray(credits) ? (credits as Record<string, unknown>[]) : [];
}

function latestTax(docs: PmOcrDocument[]): TaxReturnExtract | null {
  const processed = docs.filter(
    (doc) => doc.type === 'TAX_RETURN' && doc.status === 'PROCESSED',
  );
  processed.sort((left, right) => {
    const byProcessed =
      Date.parse(right.processedAt ?? '') - Date.parse(left.processedAt ?? '');
    if (byProcessed !== 0) return byProcessed;
    return Date.parse(right.createdAt ?? '') - Date.parse(left.createdAt ?? '');
  });
  return (processed[0]?.extractedData as TaxReturnExtract | undefined) ?? null;
}

function fakePrisma() {
  return {
    liabilitySnapshot: {
      create: async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'simulado',
        calculatedAt: new Date('2026-06-30T00:00:00.000Z'),
        ...data,
      }),
    },
  };
}

function money(value: number | null): string {
  if (value == null) return '—';
  return value.toLocaleString('es-MX', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

async function main(): Promise<void> {
  const result = await simulatePmOcrCase(loadPmEjemploFixture());
  const santander = result.capacities.santanderStatements;
  const tax = result.capacities.santanderTaxReturn;
  const scotia = result.capacities.scotiabank;

  console.log('Caso simulado PM (JSON de extracción, sin PDFs)');
  console.log(`Promedio 4 meses:        ${money(result.smoothedMonthly)}`);
  console.log(`Deuda empresa:           ${money(result.pmMonthlyDebt)}`);
  console.log(`Deuda socio:             ${money(result.pfMonthlyDebt)}`);
  console.log(`Santander estados:       ${money(santander.capacity)} (${santander.status})`);
  console.log(`Santander declaración:   ${money(tax.capacity)} (${tax.status})`);
  console.log(`Scotiabank:              ${money(scotia.capacity)} (${scotia.status})`);
  console.log(`Banorte:                 ${result.capacities.banorte.reason}`);
  console.log(`HSBC:                    ${result.capacities.hsbc.reason}`);
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
