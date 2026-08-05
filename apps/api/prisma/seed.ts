import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const CREDIT_TYPES = [
  { code: 'COMPRA', name: 'Compra', isActive: true, destination: 'ACQUISITION' as const },
  { code: 'MEJORA_HIPOTECA', name: 'Mejora Hipoteca', isActive: true, destination: 'MORTGAGE_REPLACEMENT' as const },
  { code: 'LIQUIDEZ', name: 'Liquidez', isActive: true, destination: 'LIQUIDITY' as const },
  { code: 'TERRENO', name: 'Terreno', isActive: true, destination: null },
  { code: 'REMODELACION', name: 'Remodelación', isActive: true, destination: null },
  { code: 'CONSTRUCCION', name: 'Construcción', isActive: true, destination: null },
];

const DOCUMENT_TYPES = [
  { code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina', isActive: true },
  { code: 'BANK_STATEMENT', name: 'Estado de cuenta', isActive: true },
  { code: 'CREDIT_BUREAU_REPORT', name: 'Buró de crédito', isActive: true },
  { code: 'CREDIT_SCORE', name: 'Mi Score', isActive: true },
  { code: 'INE', name: 'INE', isActive: true },
  { code: 'PASSPORT', name: 'Pasaporte', isActive: true },
  { code: 'PROOF_OF_ADDRESS', name: 'Comprobante de domicilio', isActive: false },
];

const DOCUMENT_STATUSES = [
  { code: 'UPLOADED', name: 'Cargado', order: 1 },
  { code: 'PENDING_REVIEW', name: 'Pendiente de revisión', order: 2 },
  { code: 'PROCESSING', name: 'En procesamiento', order: 3 },
  { code: 'PROCESSED', name: 'Procesado', order: 4 },
  { code: 'ERROR', name: 'Error', order: 5 },
  { code: 'EXTRACTION_READY', name: 'Extracción pendiente', order: 6 },
  { code: 'EXTRACTION_ERROR', name: 'Error de extracción', order: 7 },
  { code: 'OCR_ERROR', name: 'Error de OCR', order: 8 },
];

const CASE_STATUSES = [
  { code: 'PENDING_DOCUMENTS',   name: 'Pendiente de documentos',  order: 1 },
  { code: 'DOCUMENTS_UPLOADED',  name: 'Documentación completa',   order: 2 },
  { code: 'DOCUMENTS_PROCESSED', name: 'Documentos procesados',    order: 3 },
  { code: 'PRELIMINARY_RESULT',  name: 'Resultado preliminar',     order: 4 },
];

const SOURCE_VERSION = 'ANAQUEL_MAYO_2026';

const BANKS = [
  { code: 'BANORTE', name: 'Banorte', debtCommitmentFactor: 0.60, incomeCriterion: 'NET' as const },
  { code: 'SCOTIABANK', name: 'Scotiabank', debtCommitmentFactor: 0.55, incomeCriterion: 'GROSS' as const },
  { code: 'SANTANDER', name: 'Santander', debtCommitmentFactor: 0.50, incomeCriterion: 'NET' as const },
  { code: 'HSBC', name: 'HSBC', debtCommitmentFactor: 0.50, incomeCriterion: 'NET' as const },
  { code: 'CITIBANAMEX', name: 'Citibanamex', debtCommitmentFactor: 0.50, incomeCriterion: 'GROSS' as const },
];

interface BankProductSeed {
  bankCode: string;
  code: string;
  name: string;
  destination: 'ACQUISITION' | 'LIQUIDITY' | 'MORTGAGE_REPLACEMENT';
  minimumEmploymentTenureMonths: number | null;
  minimumApplicantAgeMonths: number | null;
  maximumApplicationAgeMonths: number | null;
  maximumMaturityAgeMonths: number | null;
  maximumLtv: number | null;
}

const BANK_PRODUCTS: BankProductSeed[] = [
  // BANORTE
  { bankCode: 'BANORTE', code: 'BANORTE_ADQ_HF', name: 'Adquisición Hipoteca Fija', destination: 'ACQUISITION', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.90 },
  { bankCode: 'BANORTE', code: 'BANORTE_LIQ_HF', name: 'Liquidez Hipoteca Fija', destination: 'LIQUIDITY', minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.70 },
  { bankCode: 'BANORTE', code: 'BANORTE_SUST_HF', name: 'Sustitución Hipoteca Fija', destination: 'MORTGAGE_REPLACEMENT', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.80 },
  // SCOTIABANK
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_ADQ_HF', name: 'Adquisición Hipoteca Fija', destination: 'ACQUISITION', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.90 },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_LIQ_HF', name: 'Liquidez Hipoteca Fija', destination: 'LIQUIDITY', minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.70 },
  { bankCode: 'SCOTIABANK', code: 'SCOTIABANK_SUST_HF', name: 'Sustitución Hipoteca Fija', destination: 'MORTGAGE_REPLACEMENT', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.80 },
  // SANTANDER
  { bankCode: 'SANTANDER', code: 'SANTANDER_ADQ_HF', name: 'Adquisición Hipoteca Fija', destination: 'ACQUISITION', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.90 },
  { bankCode: 'SANTANDER', code: 'SANTANDER_LIQ_HF', name: 'Liquidez Hipoteca Fija', destination: 'LIQUIDITY', minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.70 },
  { bankCode: 'SANTANDER', code: 'SANTANDER_SUST_HF', name: 'Sustitución Hipoteca Fija', destination: 'MORTGAGE_REPLACEMENT', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.80 },
  // HSBC
  { bankCode: 'HSBC', code: 'HSBC_ADQ_HF', name: 'Adquisición Hipoteca Fija', destination: 'ACQUISITION', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.90 },
  { bankCode: 'HSBC', code: 'HSBC_LIQ_HF', name: 'Liquidez Hipoteca Fija', destination: 'LIQUIDITY', minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.70 },
  { bankCode: 'HSBC', code: 'HSBC_SUST_HF', name: 'Sustitución Hipoteca Fija', destination: 'MORTGAGE_REPLACEMENT', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.80 },
  // CITIBANAMEX
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_ADQ_HF', name: 'Adquisición Hipoteca Fija', destination: 'ACQUISITION', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.90 },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_LIQ_HF', name: 'Liquidez Hipoteca Fija', destination: 'LIQUIDITY', minimumEmploymentTenureMonths: 12, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.70 },
  { bankCode: 'CITIBANAMEX', code: 'CITIBANAMEX_SUST_HF', name: 'Sustitución Hipoteca Fija', destination: 'MORTGAGE_REPLACEMENT', minimumEmploymentTenureMonths: 6, minimumApplicantAgeMonths: 300, maximumApplicationAgeMonths: 839, maximumMaturityAgeMonths: 960, maximumLtv: 0.80 },
];

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  const passwordHash = await bcrypt.hash('admin123', 10);
  
  try {
    for (const creditType of CREDIT_TYPES) {
      await prisma.creditType.upsert({
        where: { code: creditType.code },
        update: {
          name: creditType.name,
          isActive: creditType.isActive,
          destination: creditType.destination,
        },
        create: {
          code: creditType.code,
          name: creditType.name,
          isActive: creditType.isActive,
          destination: creditType.destination,
        },
      });
    }

    for (const caseStatus of CASE_STATUSES) {
      await prisma.caseStatus.upsert({
        where: { code: caseStatus.code },
        update: {
          name: caseStatus.name,
          order: caseStatus.order,
        },
        create: caseStatus,
      });
    }

    for (const documentType of DOCUMENT_TYPES) {
      await prisma.documentType.upsert({
        where: { code: documentType.code },
        update: {
          name: documentType.name,
          isActive: documentType.isActive,
        },
        create: documentType,
      });
    }

    for (const documentStatus of DOCUMENT_STATUSES) {
      await prisma.documentStatus.upsert({
        where: { code: documentStatus.code },
        update: {
          name: documentStatus.name,
          order: documentStatus.order,
        },
        create: documentStatus,
      });
    }

    // Seed banks
    const bankMap: Record<string, string> = {};
    for (const bank of BANKS) {
      const created = await prisma.bank.upsert({
        where: { code: bank.code },
        update: {
          name: bank.name,
          debtCommitmentFactor: bank.debtCommitmentFactor,
          incomeCriterion: bank.incomeCriterion,
          sourceVersion: SOURCE_VERSION,
        },
        create: {
          code: bank.code,
          name: bank.name,
          debtCommitmentFactor: bank.debtCommitmentFactor,
          incomeCriterion: bank.incomeCriterion,
          sourceVersion: SOURCE_VERSION,
        },
      });
      bankMap[bank.code] = created.id;
    }

    // Seed bank product policies
    for (const product of BANK_PRODUCTS) {
      await prisma.bankPolicy.upsert({
        where: { code: product.code },
        update: {
          name: product.name,
          destination: product.destination,
          personType: 'SALARIED',
          minimumEmploymentTenureMonths: product.minimumEmploymentTenureMonths,
          minimumApplicantAgeMonths: product.minimumApplicantAgeMonths,
          maximumApplicationAgeMonths: product.maximumApplicationAgeMonths,
          maximumMaturityAgeMonths: product.maximumMaturityAgeMonths,
          maximumLtv: product.maximumLtv,
          sourceVersion: SOURCE_VERSION,
        },
        create: {
          bankId: bankMap[product.bankCode],
          code: product.code,
          name: product.name,
          destination: product.destination,
          personType: 'SALARIED',
          minimumEmploymentTenureMonths: product.minimumEmploymentTenureMonths,
          minimumApplicantAgeMonths: product.minimumApplicantAgeMonths,
          maximumApplicationAgeMonths: product.maximumApplicationAgeMonths,
          maximumMaturityAgeMonths: product.maximumMaturityAgeMonths,
          maximumLtv: product.maximumLtv,
          sourceVersion: SOURCE_VERSION,
        },
      });
    }

    const admin = await prisma.user.upsert({
      where: { email: 'admin@gestion.com' },
      update: {
        name: 'Admin Sistema',
        passwordHash: passwordHash,
        role: 'ADMIN',
      },
      create: {
        email: 'admin@gestion.com',
        name: 'Admin Sistema',
        passwordHash: passwordHash,
        role: 'ADMIN',
      },
    });

    console.log('Seeded credit types:', CREDIT_TYPES.length);
    console.log('Seeded case statuses:', CASE_STATUSES.length);
    console.log('Seeded document types:', DOCUMENT_TYPES.length);
    console.log('Seeded document statuses:', DOCUMENT_STATUSES.length);
    console.log('Seeded banks:', BANKS.length);
    console.log('Seeded bank products:', BANK_PRODUCTS.length);
    console.log('Seeded admin user:', admin.email);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
