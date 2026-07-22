-- CreateEnum
CREATE TYPE "IncomeCriterion" AS ENUM ('GROSS', 'NET');

-- CreateEnum
CREATE TYPE "ProductDestination" AS ENUM ('ACQUISITION', 'LIQUIDITY', 'MORTGAGE_REPLACEMENT');

-- AlterTable
ALTER TABLE "CreditType" ADD COLUMN     "destination" "ProductDestination";

-- CreateTable
CREATE TABLE "Bank" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "debtCommitmentFactor" DECIMAL(5,4) NOT NULL,
    "incomeCriterion" "IncomeCriterion" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Bank_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankProductPolicy" (
    "id" TEXT NOT NULL,
    "bankId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "destination" "ProductDestination" NOT NULL,
    "personType" "PersonType" NOT NULL,
    "minimumEmploymentTenureMonths" INTEGER,
    "minimumApplicantAgeMonths" INTEGER,
    "maximumApplicationAgeMonths" INTEGER,
    "maximumMaturityAgeMonths" INTEGER,
    "maximumLtv" DECIMAL(5,4),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sourceVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankProductPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Bank_code_key" ON "Bank"("code");

-- CreateIndex
CREATE UNIQUE INDEX "BankProductPolicy_code_key" ON "BankProductPolicy"("code");

-- CreateIndex
CREATE INDEX "BankProductPolicy_destination_personType_isActive_idx" ON "BankProductPolicy"("destination", "personType", "isActive");

-- CreateIndex
CREATE INDEX "BankProductPolicy_bankId_idx" ON "BankProductPolicy"("bankId");

-- AddForeignKey
ALTER TABLE "BankProductPolicy" ADD CONSTRAINT "BankProductPolicy_bankId_fkey" FOREIGN KEY ("bankId") REFERENCES "Bank"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
