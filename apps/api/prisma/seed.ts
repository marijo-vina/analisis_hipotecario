import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import 'dotenv/config';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });
  
  const passwordHash = await bcrypt.hash('admin123', 10);
  
  try {
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
