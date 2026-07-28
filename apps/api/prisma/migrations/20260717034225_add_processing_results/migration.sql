-- DropForeignKey
ALTER TABLE "IncomeCalculation" DROP CONSTRAINT "IncomeCalculation_mortgageCaseId_fkey";

-- AlterTable
ALTER TABLE "Document" ADD COLUMN     "processingResults" JSONB;

-- CreateTable
CREATE TABLE "LiabilitySnapshot" (
    "id" TEXT NOT NULL,
    "mortgageCaseId" TEXT NOT NULL,
    "factorUsed" DECIMAL(65,30) NOT NULL,
    "rulesVersion" TEXT NOT NULL,
    "credits" JSONB NOT NULL,
    "globalStatus" TEXT NOT NULL,
    "grossCurrentMonthlyDebt" DECIMAL(65,30) NOT NULL,
    "totalCurrentBalance" DECIMAL(65,30) NOT NULL,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiabilitySnapshot_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LiabilitySnapshot" ADD CONSTRAINT "LiabilitySnapshot_mortgageCaseId_fkey" FOREIGN KEY ("mortgageCaseId") REFERENCES "MortgageCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IncomeCalculation" ADD CONSTRAINT "IncomeCalculation_mortgageCaseId_fkey" FOREIGN KEY ("mortgageCaseId") REFERENCES "MortgageCase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
