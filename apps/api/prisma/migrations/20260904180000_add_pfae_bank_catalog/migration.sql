-- CreateEnum
CREATE TYPE "PfaeFactorMode" AS ENUM ('MATRIX', 'FLAT', 'NONE');

-- CreateEnum
CREATE TYPE "TaxReturnPolicy" AS ENUM ('ACCEPTED', 'NOT_PREFERRED', 'REJECTED');

-- AlterTable
ALTER TABLE "Bank" ADD COLUMN "pfaeFactorMode" "PfaeFactorMode" NOT NULL DEFAULT 'MATRIX';
ALTER TABLE "Bank" ADD COLUMN "pfaeFlatFactor" DECIMAL(5,4);
ALTER TABLE "Bank" ADD COLUMN "taxReturnPolicy" "TaxReturnPolicy" NOT NULL DEFAULT 'ACCEPTED';

-- AlterTable
ALTER TABLE "BankPolicy" ADD COLUMN "minimumActivityTenureMonths" INTEGER;
ALTER TABLE "BankPolicy" ADD COLUMN "minimumIncomePfae" DECIMAL(12,2);
ALTER TABLE "BankPolicy" ADD COLUMN "minimumApplicantAgeMonthsPfae" INTEGER;

-- CreateTable
CREATE TABLE "BankActivityFactor" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "nativeLabel" TEXT NOT NULL,
    "satAliases" JSONB NOT NULL,
    "factor" DECIMAL(5,4) NOT NULL,
    "factorTaxReturn" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankActivityFactor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BankActivityFactor_bankId_nativeLabel_key" ON "BankActivityFactor"("bankId", "nativeLabel");

-- CreateIndex
CREATE INDEX "BankActivityFactor_bankId_idx" ON "BankActivityFactor"("bankId");

-- AddForeignKey
ALTER TABLE "BankActivityFactor" ADD CONSTRAINT "BankActivityFactor_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE CASCADE ON UPDATE CASCADE;
