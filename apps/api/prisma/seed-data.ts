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
  minimumIncome: number | null;
  minimumPropertyValue: number | null;
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  isActive: boolean;
}

export const BANK_POLICIES: BankPolicySeed[] = [
  // ── BANORTE (NET, 0.60) — 6 active destinations ────────────────────────────
  { bankCode: 'BANORTE', code: 'BANORTE_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },

  // ── SCOTIABANK (GROSS, 0.55) — 5 active (no TERRENO) ──────────────────────
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 10000, minimumPropertyValue: 400000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, isActive: true },

  // ── SANTANDER (NET, 0.50, minBureauScore=542) — 6 active ──────────────────
  { bankCode: 'SANTANDER', code: 'SANTANDER_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: 20000, minimumPropertyValue: 700000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },

  // ── HSBC (NET, 0.50) — only ACQUISITION active ────────────────────────────
  { bankCode: 'HSBC', code: 'HSBC_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, isActive: true },
  { bankCode: 'HSBC', code: 'HSBC_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, isActive: false },
  { bankCode: 'HSBC', code: 'HSBC_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, isActive: false },

  // ── CITIBANAMEX (GROSS, 0.50) — 3 active (no TERRENO/CONSTRUCCION/REMODELACION)
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, isActive: true },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 35000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, isActive: true },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, isActive: true },

  // ── MIFEL (GROSS, 0.50) — 3 active + 3 inactive ───────────────────────────
  { bankCode: 'MIFEL', code: 'MIFEL_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: false },
  { bankCode: 'MIFEL', code: 'MIFEL_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: false },
  { bankCode: 'MIFEL', code: 'MIFEL_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, isActive: false },

  // ── BANREGIO (GROSS, 0.50, minBureauScore=629) — 3 active + 3 inactive ────
  { bankCode: 'BANREGIO', code: 'BANREGIO_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: false },
  { bankCode: 'BANREGIO', code: 'BANREGIO_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: false },
  { bankCode: 'BANREGIO', code: 'BANREGIO_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, isActive: false },

  // BXPLUS and AFIRME — bank-level only, NO destination policies
];
