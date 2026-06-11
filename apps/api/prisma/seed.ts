import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

const CREDIT_TYPES = [
  { code: 'COMPRA', name: 'Compra', isActive: true },
  { code: 'MEJORA_HIPOTECA', name: 'Mejora Hipoteca', isActive: true },
  { code: 'LIQUIDEZ', name: 'Liquidez', isActive: true },
  { code: 'TERRENO', name: 'Terreno', isActive: true },
  { code: 'REMODELACION', name: 'Remodelación', isActive: true },
  { code: 'CONSTRUCCION', name: 'Construcción', isActive: true },
];

const CASE_STATUSES = [
  { code: 'PENDING_DOCUMENTS',  name: 'Pendiente de documentos', order: 1 },
  { code: 'DOCUMENTS_UPLOADED', name: 'Documentos cargados',     order: 2 },
  { code: 'PROCESSING',         name: 'En procesamiento',        order: 3 },
  { code: 'DATA_EXTRACTED',     name: 'Datos extraídos',         order: 4 },
  { code: 'IN_REVIEW',          name: 'En revisión',             order: 5 },
  { code: 'REPORT_GENERATED',   name: 'Reporte generado',        order: 6 },
  { code: 'OBSERVED',           name: 'Observado',               order: 7 },
  { code: 'CLOSED',             name: 'Cerrado',                 order: 8 },
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
        },
        create: creditType,
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
