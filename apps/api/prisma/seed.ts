import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';
import { BANKS, BANK_POLICIES, CREDIT_TYPES, SOURCE_VERSION } from './seed-data';

const DOCUMENT_TYPES = [
  { code: 'PAYROLL_RECEIPT', name: 'Recibo de nómina', isActive: true },
  { code: 'BANK_STATEMENT', name: 'Estado de cuenta', isActive: true },
  { code: 'CREDIT_BUREAU_REPORT', name: 'Buró de crédito', isActive: true },
  { code: 'CREDIT_SCORE', name: 'Mi Score', isActive: true },
  { code: 'INE', name: 'INE', isActive: true },
  { code: 'PASSPORT', name: 'Pasaporte', isActive: true },
  { code: 'CSF', name: 'Constancia de Situación Fiscal', isActive: true },
  { code: 'TAX_RETURN', name: 'Declaración anual', isActive: true },
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
          minimumBureauScore: bank.minimumBureauScore,
          sourceVersion: SOURCE_VERSION,
        },
        create: {
          code: bank.code,
          name: bank.name,
          debtCommitmentFactor: bank.debtCommitmentFactor,
          incomeCriterion: bank.incomeCriterion,
          minimumBureauScore: bank.minimumBureauScore,
          sourceVersion: SOURCE_VERSION,
        },
      });
      bankMap[bank.code] = created.id;
    }

    // Seed bank policies (CMA data)
    for (const policy of BANK_POLICIES) {
      await prisma.bankPolicy.upsert({
        where: { code: policy.code },
        update: {
          bankId: bankMap[policy.bankCode],
          destination: policy.destination,
          minimumIncome: policy.minimumIncome,
          minimumPropertyValue: policy.minimumPropertyValue,
          minimumEmploymentTenureMonths: policy.minimumEmploymentTenureMonths,
          minimumApplicantAgeMonths: policy.minimumApplicantAgeMonths,
          maximumApplicationAgeMonths: policy.maximumApplicationAgeMonths,
          isActive: policy.isActive,
        },
        create: {
          bankId: bankMap[policy.bankCode],
          code: policy.code,
          destination: policy.destination,
          minimumIncome: policy.minimumIncome,
          minimumPropertyValue: policy.minimumPropertyValue,
          minimumEmploymentTenureMonths: policy.minimumEmploymentTenureMonths,
          minimumApplicantAgeMonths: policy.minimumApplicantAgeMonths,
          maximumApplicationAgeMonths: policy.maximumApplicationAgeMonths,
          isActive: policy.isActive,
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
    console.log('Seeded bank policies:', BANK_POLICIES.length);
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
