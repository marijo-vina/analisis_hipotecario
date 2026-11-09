-- PersonType currently has SALARIED and PFAE. Prisma schema now includes PM.
ALTER TYPE "PersonType" ADD VALUE 'PM';

-- CreateEnum
CREATE TYPE "DocumentOwner" AS ENUM ('SHAREHOLDER', 'COMPANY');

-- AlterTable
ALTER TABLE "Document" ADD COLUMN "owner" "DocumentOwner" NOT NULL DEFAULT 'SHAREHOLDER';

-- AlterTable
ALTER TABLE "MortgageCase" ADD COLUMN "sharePercentage" DECIMAL(5,2),
ADD COLUMN "incorporationDate" DATE,
ADD COLUMN "shareTenureMonths" INTEGER,
ADD COLUMN "legalName" TEXT,
ADD COLUMN "companyRfc" TEXT;
