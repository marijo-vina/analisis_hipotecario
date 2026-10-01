/**
 * Seed data for Catálogo Bancario CMA.
 *
 * Source: ANAQUEL_AGOSTO_2026 + captura-first PFAE (docs/bank-policies-matrix.md)
 * Extracted to a separate module for testability.
 */

export const SOURCE_VERSION = 'ANAQUEL_AGOSTO_2026';

// ─── Credit Types ─────────────────────────────────────────────────────────────

export const CREDIT_TYPES = [
  { code: 'COMPRA', name: 'Adquisición', isActive: true, destination: 'ACQUISITION' as const },
  { code: 'MEJORA_HIPOTECA', name: 'Sustitución', isActive: true, destination: 'MORTGAGE_REPLACEMENT' as const },
  { code: 'LIQUIDEZ', name: 'Liquidez', isActive: true, destination: 'LIQUIDITY' as const },
  { code: 'TERRENO', name: 'Terreno', isActive: true, destination: 'TERRENO' as const },
  { code: 'CONSTRUCCION', name: 'Construcción', isActive: true, destination: 'CONSTRUCCION' as const },
  { code: 'REMODELACION', name: 'Remodelación', isActive: true, destination: 'REMODELACION' as const },
];

// ─── Banks ────────────────────────────────────────────────────────────────────

type PfaeFactorModeSeed = 'MATRIX' | 'FLAT' | 'NONE';
type TaxReturnPolicySeed = 'ACCEPTED' | 'NOT_PREFERRED' | 'REJECTED';

export const BANKS = [
  { code: 'BANORTE', name: 'Banorte', debtCommitmentFactor: 0.6, incomeCriterion: 'NET' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'FLAT' as PfaeFactorModeSeed, pfaeFlatFactor: 0.6 as number | null, taxReturnPolicy: 'NOT_PREFERRED' as TaxReturnPolicySeed },
  { code: 'SCOTIABANK', name: 'Scotiabank', debtCommitmentFactor: 0.55, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'REJECTED' as TaxReturnPolicySeed },
  { code: 'SANTANDER', name: 'Santander', debtCommitmentFactor: 0.5, incomeCriterion: 'NET' as const, minimumBureauScore: 542, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'HSBC', name: 'HSBC', debtCommitmentFactor: 0.5, incomeCriterion: 'NET' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'NONE' as PfaeFactorModeSeed, pfaeFlatFactor: 1.0 as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'CITIBANAMEX', name: 'Citibanamex', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'BXPLUS', name: 'BX+', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'MIFEL', name: 'Mifel', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'BANREGIO', name: 'Banregio', debtCommitmentFactor: 0.5, incomeCriterion: 'GROSS' as const, minimumBureauScore: 629, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
  { code: 'AFIRME', name: 'Afirme', debtCommitmentFactor: 0.6, incomeCriterion: 'GROSS' as const, minimumBureauScore: null as number | null, pfaeFactorMode: 'MATRIX' as PfaeFactorModeSeed, pfaeFlatFactor: null as number | null, taxReturnPolicy: 'ACCEPTED' as TaxReturnPolicySeed },
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
  minimumActivityTenureMonths: number | null;
  minimumIncomePfae: number | null;
  minimumApplicantAgeMonthsPfae: number | null;
  isActive: boolean;
}

export const BANK_POLICIES: BankPolicySeed[] = [
  // ── BANORTE (NET, 0.60) — 6 active destinations ────────────────────────────
  { bankCode: 'BANORTE', code: 'BANORTE_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANORTE', code: 'BANORTE_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: 350000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },

  // ── SCOTIABANK (GROSS, 0.55) — 5 active (no TERRENO) ──────────────────────
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 10000, minimumPropertyValue: 400000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: 10000, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 888, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },

  // ── SANTANDER (NET, 0.50, minBureauScore=542) — 6 active ──────────────────
  { bankCode: 'SANTANDER', code: 'SANTANDER_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 15000, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 15000, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 15000, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: 7500, minimumPropertyValue: 250000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 15000, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: 20000, minimumPropertyValue: 700000, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 67000, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'SANTANDER', code: 'SANTANDER_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: 7500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 966, minimumActivityTenureMonths: 24, minimumIncomePfae: 15000, minimumApplicantAgeMonthsPfae: null, isActive: true },

  // ── HSBC (NET, 0.50) — only ACQUISITION active; LIQ inactive (PFAE knockout)
  { bankCode: 'HSBC', code: 'HSBC_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'HSBC', code: 'HSBC_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, minimumActivityTenureMonths: null, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },
  { bankCode: 'HSBC', code: 'HSBC_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: null, minimumApplicantAgeMonths: null, maximumApplicationAgeMonths: null, minimumActivityTenureMonths: null, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },

  // ── CITIBANAMEX (GROSS, 0.50) — 3 active; PFAE age 28y (336m); LIQ 35k salaried
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: 336, isActive: true },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 35000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: 336, isActive: true },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 15000, minimumPropertyValue: 750000, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 276, maximumApplicationAgeMonths: 899, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: 336, isActive: true },

  // ── MIFEL (GROSS, 0.50) — 3 active + 3 inactive; PFAE tenure 24 ────────────
  { bankCode: 'MIFEL', code: 'MIFEL_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'MIFEL', code: 'MIFEL_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },
  { bankCode: 'MIFEL', code: 'MIFEL_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },
  { bankCode: 'MIFEL', code: 'MIFEL_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 252, maximumApplicationAgeMonths: 960, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },

  // ── BANREGIO (GROSS, 0.50, minBureauScore=629) — 3 active + 3 inactive ────
  { bankCode: 'BANREGIO', code: 'BANREGIO_ADQ', name: 'Adquisición', destination: 'ACQUISITION', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_LIQ', name: 'Liquidez', destination: 'LIQUIDITY', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_SUST', name: 'Sustitución de Hipoteca', destination: 'MORTGAGE_REPLACEMENT', minimumIncome: 17500, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: true },
  { bankCode: 'BANREGIO', code: 'BANREGIO_TER', name: 'Terreno', destination: 'TERRENO', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },
  { bankCode: 'BANREGIO', code: 'BANREGIO_CNS', name: 'Construcción', destination: 'CONSTRUCCION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },
  { bankCode: 'BANREGIO', code: 'BANREGIO_REM', name: 'Remodelación', destination: 'REMODELACION', minimumIncome: null, minimumPropertyValue: null, minimumEmploymentTenureMonths: 24, minimumApplicantAgeMonths: 264, maximumApplicationAgeMonths: 912, minimumActivityTenureMonths: 24, minimumIncomePfae: null, minimumApplicantAgeMonthsPfae: null, isActive: false },

  // BXPLUS and AFIRME — bank-level only, NO destination policies
];

// ─── Bank Activity Factors (captura-first; factor MAY exceed 1) ───────────────

export interface BankActivityFactorSeed {
  bankCode: string;
  nativeLabel: string;
  satAliases: string[];
  factor: number;
  factorTaxReturn: number | null;
}

/** SAT wording for medical practices often uses médico/consultorio, not each bank's native plural. */
const MEDICAL_SAT_ALIASES = [
  'medico',
  'medicos',
  'consultorio',
  'consultorios',
  'doctores',
  'doctor',
  'medicina',
] as const;

function withMedicalAliases(aliases: string[]): string[] {
  return [...new Set([...aliases, ...MEDICAL_SAT_ALIASES])];
}

export const BANK_ACTIVITY_FACTORS: BankActivityFactorSeed[] = [
  // Mifel — captura "Ingresos no asalariados" (comercio 0.35, not Excel 0.20)
  { bankCode: 'MIFEL', nativeLabel: 'Establecimientos y PI de salud', satAliases: withMedicalAliases(['hospitales', 'consultorios', 'medicos', 'dentistas', 'terapeutas', 'enfermeros', 'psicologos', 'nutriologos', 'veterinarios']), factor: 1.5, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'PI otras — grupo A', satAliases: ['abogados', 'contadores', 'consultores'], factor: 0.8, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'PI otras — grupo B', satAliases: ['agentes de seguros', 'arquitectos', 'ingenieros', 'valuadores', 'brokers', 'computacion', 'biologos', 'quimicos'], factor: 0.75, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Esparcimiento cultural/deportivo', satAliases: ['actores', 'maestros', 'musicos', 'disenadores', 'comunicadores', 'fotografos', 'deportistas'], factor: 0.75, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Servicios financieros y de seguros', satAliases: ['utilidades', 'inversiones', 'intereses'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Agropecuarias, pesca, forestales', satAliases: ['agronegocios', 'ganaderia', 'pesca'], factor: 0.1, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Construcción y mantenimiento', satAliases: ['construccion', 'agua', 'gas', 'electricidad', 'mineria'], factor: 0.35, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Comercio, alojamiento, alimentos y bebidas', satAliases: ['comercio', 'hoteles', 'bares', 'restaurantes', 'alimentos y bebidas'], factor: 0.35, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Gasolina y diésel', satAliases: ['gasolinero'], factor: 0.1, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Arrendadoras / arrendadores', satAliases: ['arrendadores', 'arrendamiento'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Industria manufacturera', satAliases: ['muebles', 'calzado', 'papel', 'aluminio', 'computo'], factor: 0.25, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Servicios en general', satAliases: ['transporte', 'educacion', 'limpieza', 'mensajeria'], factor: 0.35, factorTaxReturn: null },
  { bankCode: 'MIFEL', nativeLabel: 'Otras actividades', satAliases: ['otros'], factor: 0.35, factorTaxReturn: null },

  // Citibanamex — columna Nuevo (taller mayo 2024)
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Médico, dentista', satAliases: withMedicalAliases(['medico', 'dentista']), factor: 1.0, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Resto servicios profesionales', satAliases: ['abogado', 'administrador', 'agente de seguros', 'comunicador', 'contador', 'enfermera', 'informatico', 'maestro', 'periodista', 'psicologo', 'terapeuta', 'arquitecto', 'consultor', 'disenador grafico', 'ingeniero', 'piloto'], factor: 1.0, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Comercio / servicios / manufactura', satAliases: ['comercio', 'alimentos y bebidas', 'restaurantero', 'servicios', 'representante de ventas', 'agencias de viajes', 'manufactura'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Comercio-comisionista', satAliases: ['comisionista'], factor: 1.0, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Actividades primarias', satAliases: ['pecuarios', 'pesqueros', 'cultivos', 'cultivo'], factor: 0.15, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Gasolinero', satAliases: ['comercio-gasolinero', 'gasolinero'], factor: 0.06, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Inversiones', satAliases: ['banca patrimonial', 'banca privada'], factor: 0.06, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Dividendos', satAliases: ['dividendo'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'CITIBANAMEX', nativeLabel: 'Arrendamiento', satAliases: ['arrendamiento'], factor: 0.8, factorTaxReturn: null },

  // Santander — factor de afectación (asesora sep-2026)
  { bankCode: 'SANTANDER', nativeLabel: 'PI', satAliases: ['profesionista independiente'], factor: 0.8, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'PI sector médico', satAliases: withMedicalAliases(['medico']), factor: 1.0, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'Consultorías TOP', satAliases: ['consultoria'], factor: 1.0, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'PFAE Servicio', satAliases: ['servicio'], factor: 0.6, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'PFAE Comercio', satAliases: ['comercio'], factor: 0.6, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'Arrendamiento', satAliases: ['arrendamiento'], factor: 0.8, factorTaxReturn: null },
  { bankCode: 'SANTANDER', nativeLabel: 'Inversiones', satAliases: ['inversiones'], factor: 0.9, factorTaxReturn: null },

  // Afirme — captura "Castigos x actividad"
  { bankCode: 'AFIRME', nativeLabel: 'Accionistas', satAliases: ['accionistas'], factor: 1.0, factorTaxReturn: null },
  { bankCode: 'AFIRME', nativeLabel: 'Honorarios', satAliases: ['honorarios'], factor: 1.0, factorTaxReturn: null },
  { bankCode: 'AFIRME', nativeLabel: 'Servicios', satAliases: withMedicalAliases(['abogados', 'doctores', 'contadores', 'asesores inmobiliarios']), factor: 0.8, factorTaxReturn: null },
  { bankCode: 'AFIRME', nativeLabel: 'Comercio', satAliases: ['comercio', 'restaurante'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'AFIRME', nativeLabel: 'Manufactura', satAliases: ['ganaderos', 'constructoras', 'industrias'], factor: 0.2, factorTaxReturn: null },
  { bankCode: 'AFIRME', nativeLabel: 'Gasolineros', satAliases: ['gasolineras', 'divisas'], factor: 0.1, factorTaxReturn: null },

  // Banregio — captura "Comprobación de ingresos"
  { bankCode: 'BANREGIO', nativeLabel: 'Servicios', satAliases: withMedicalAliases(['servicios']), factor: 0.7, factorTaxReturn: null },
  { bankCode: 'BANREGIO', nativeLabel: 'Otros', satAliases: ['otros'], factor: 0.6, factorTaxReturn: null },
  { bankCode: 'BANREGIO', nativeLabel: 'Informal', satAliases: ['informal'], factor: 0.15, factorTaxReturn: null },
  { bankCode: 'BANREGIO', nativeLabel: 'Accionistas', satAliases: ['accionistas'], factor: 1.0, factorTaxReturn: null },

  // BX+ — factor = estados, factorTaxReturn = declaración (dual diffs on PFAE rows)
  { bankCode: 'BXPLUS', nativeLabel: 'Socio o dueño (comprobación personal / dividendos)', satAliases: ['socio', 'dueno', 'dividendos'], factor: 0.9, factorTaxReturn: 0.9 },
  { bankCode: 'BXPLUS', nativeLabel: 'Arrendamiento', satAliases: ['arrendamiento'], factor: 0.8, factorTaxReturn: 0.8 },
  { bankCode: 'BXPLUS', nativeLabel: 'Servicios profesionales', satAliases: withMedicalAliases(['servicios profesionales']), factor: 0.8, factorTaxReturn: 0.8 },
  { bankCode: 'BXPLUS', nativeLabel: 'PFAE Servicios', satAliases: ['pfae servicios', 'servicios'], factor: 0.5, factorTaxReturn: 0.6 },
  { bankCode: 'BXPLUS', nativeLabel: 'PFAE Comercio', satAliases: ['pfae comercio', 'comercio'], factor: 0.4, factorTaxReturn: 0.5 },
  { bankCode: 'BXPLUS', nativeLabel: 'Pequeños contribuyentes', satAliases: ['pequenos contribuyentes', 'rif'], factor: 0.25, factorTaxReturn: 0.3 },
  { bankCode: 'BXPLUS', nativeLabel: 'Gasolinero', satAliases: ['gasolinero'], factor: 0.05, factorTaxReturn: 0.05 },

  // Scotiabank — captura "Ingresos por actividad"
  { bankCode: 'SCOTIABANK', nativeLabel: 'Comisionistas, abogados no litigantes, médicos, arquitectos e ingenieros no construcción', satAliases: withMedicalAliases(['comisionistas', 'abogados', 'medicos', 'arquitectos', 'ingenieros']), factor: 1.0, factorTaxReturn: null },
  { bankCode: 'SCOTIABANK', nativeLabel: 'Contadores, consultores, asesores, artistas, arrendadores, profesores', satAliases: ['contadores', 'consultores', 'agentes aduanales', 'asesores', 'artistas', 'musicos', 'valuadores', 'arrendadores', 'profesores'], factor: 0.8, factorTaxReturn: null },
  { bankCode: 'SCOTIABANK', nativeLabel: 'Dueños de negocio, comerciantes, constructores', satAliases: ['duenos de negocio', 'comerciantes', 'constructores'], factor: 0.5, factorTaxReturn: null },
  { bankCode: 'SCOTIABANK', nativeLabel: 'Gasolineros, agropecuario, ganadero', satAliases: ['gasolineros', 'agropecuario', 'ganadero'], factor: 0.1, factorTaxReturn: null },
];
