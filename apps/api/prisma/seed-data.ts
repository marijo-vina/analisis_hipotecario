/**
 * Seed data for Catálogo Bancario CMA.
 *
 * Source: ANAQUEL_AGOSTO_2026
 * Extracted to a separate module for testability.
 */

export const SOURCE_VERSION = 'ANAQUEL_AGOSTO_2026';

// ─── Credit Types ─────────────────────────────────────────────────────────────

export const CREDIT_TYPES = [
  { code: 'COMPRA', name: 'Compra', isActive: true, destination: 'ACQUISITION' as const },
  { code: 'MEJORA_HIPOTECA', name: 'Mejora Hipoteca', isActive: true, destination: 'MORTGAGE_REPLACEMENT' as const },
  { code: 'LIQUIDEZ', name: 'Liquidez', isActive: true, destination: 'LIQUIDITY' as const },
  { code: 'TERRENO', name: 'Terreno', isActive: true, destination: 'TERRENO' as const },
  { code: 'REMODELACION', name: 'Remodelación', isActive: true, destination: 'REMODELACION' as const },
  { code: 'CONSTRUCCION', name: 'Construcción', isActive: true, destination: 'CONSTRUCCION' as const },
];

// ─── Banks ────────────────────────────────────────────────────────────────────

export const BANKS = [
  { code: 'BANORTE', name: 'Banorte', debtCommitmentFactor: 0.6, incomeCriterion: 'NET' as const, minimumBureauScore: null as number | null },
  { code: 'SCOTIABANK', name: 'Scotiabank', debtCommitmentFactor: 0.55, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null },
  { code: 'SANTANDER', name: 'Santander', debtCommitmentFactor: 0.5, incomeCriterion: 'NET' as const, minimumBureauScore: 542 },
  { code: 'HSBC', name: 'HSBC', debtCommitmentFactor: 0.5, incomeCriterion: 'NET' as const, minimumBureauScore: null as number | null },
  { code: 'CITIBANAMEX', name: 'Citibanamex', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null },
  { code: 'BXPLUS', name: 'BX+', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null },
  { code: 'MIFEL', name: 'Mifel', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null },
  { code: 'BANREGIO', name: 'Banregio', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: 629 },
  { code: 'AFIRME', name: 'Afirme', debtCommitmentFactor: 0.6, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null },
];

// ─── Bank Policies ────────────────────────────────────────────────────────────

type ProductDestinationType =
  | 'ACQUISITION'
  | 'LIQUIDITY'
  | 'MORTGAGE_REPLACEMENT'
  | 'TERRENO'
  | 'CONSTRUCCION'
  | 'REMODELACION';

interface BankPolicySeed {
  bankCode: string;
  code: string;
  name: string;
  destination: ProductDestinationType;
  personType: 'SALARIED';
  minimumIncome: number | null;
  minimumPropertyValue: number | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  maximumMaturityAgeMonths: number | null;
  maximumLtv: number | null;
  isActive: boolean;
  sourceVersion: string;
}

export const BANK_POLICIES: BankPolicySeed[] = [
  // ── BANORTE (NET, 0.60) — 6 active destinations ────────────────────────────
  { bankCode: 'BANORTE', code: 'BANORTE_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANORTE', code: 'BANORTE_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANORTE', code: 'BANORTE_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANORTE', code: 'BANORTE_TER', name: 'Terreno', destination: 'TERRENO', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANORTE', code: 'BANORTE_CNS', name: 'Construcción', destination: 'CONSTRUCCION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANORTE', code: 'BANORTE_REM', name: 'Remodelación', destination: 'REMODELACION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },

  // ── SCOTIABANK (GROSS, 0.55) — 5 active (no TERRENO) ──────────────────────
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: 10000, minimumPropertyValue: 400000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_CNS', name: 'Construcción', destination: 'CONSTRUCCION', personType: 'SALARIED', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_REM', name: 'Remodelación', destination: 'REMODELACION', personType: 'SALARIED', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },

  // ── SANTANDER (NET, 0.50, minBureauScore=542) — 6 active ──────────────────
  { bankCode: 'SANTANDER', code: 'SANTANDER_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SANTANDER', code: 'SANTANDER_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SANTANDER', code: 'SANTANDER_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SANTANDER', code: 'SANTANDER_TER', name: 'Terreno', destination: 'TERRENO', personType: 'SALARIED', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SANTANDER', code: 'SANTANDER_CNS', name: 'Construcción', destination: 'CONSTRUCCION', personType: 'SALARIED', minimumIncome: 20000, minimumPropertyValue: 700000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'SANTANDER', code: 'SANTANDER_REM', name: 'Remodelación', destination: 'REMODELACION', personType: 'SALARIED', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },

  // ── HSBC (NET, 0.50) — only ACQUISITION active ────────────────────────────
  { bankCode: 'HSBC', code: 'HSBC_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'HSBC', code: 'HSBC_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },
  { bankCode: 'HSBC', code: 'HSBC_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },

  // ── CITIBANAMEX (GROSS, 0.50) — 3 active (no TERRENO/CONSTRUCCION/REMODELACION)
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: 35000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },

  // ── MIFEL (GROSS, 0.50) — 3 active + 3 inactive ───────────────────────────
  { bankCode: 'MIFEL', code: 'MIFEL_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'MIFEL', code: 'MIFEL_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'MIFEL', code: 'MIFEL_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'MIFEL', code: 'MIFEL_TER', name: 'Terreno', destination: 'TERRENO', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },
  { bankCode: 'MIFEL', code: 'MIFEL_CNS', name: 'Construcción', destination: 'CONSTRUCCION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },
  { bankCode: 'MIFEL', code: 'MIFEL_REM', name: 'Remodelación', destination: 'REMODELACION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },

  // ── BANREGIO (GROSS, 0.50, minBureauScore=629) — 3 active + 3 inactive ────
  { bankCode: 'BANREGIO', code: 'BANREGIO_ADQ', name: 'Adquisición', destination: 'ACQUISITION', personType: 'SALARIED', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANREGIO', code: 'BANREGIO_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', personType: 'SALARIED', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANREGIO', code: 'BANREGIO_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', personType: 'SALARIED', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: true, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANREGIO', code: 'BANREGIO_TER', name: 'Terreno', destination: 'TERRENO', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANREGIO', code: 'BANREGIO_CNS', name: 'Construcción', destination: 'CONSTRUCCION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },
  { bankCode: 'BANREGIO', code: 'BANREGIO_REM', name: 'Remodelación', destination: 'REMODELACION', personType: 'SALARIED', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, maximumMaturityAgeMonths: null, maximumLtv: null, isActive: false, sourceVersion: SOURCE_VERSION },

  // BXPLUS and AFIRME — bank-level only, NO destination policies
];
