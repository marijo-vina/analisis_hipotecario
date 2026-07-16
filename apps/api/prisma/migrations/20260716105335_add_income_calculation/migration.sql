-- CreateTable
CREATE TABLE "IncomeCalculation" (
    "id" TEXT NOT NULL,
    "mortgageCaseId" TEXT NOT NULL,
    "receiptResults" JSONB NOT NULL,
    "averageGrossIncome" DECIMAL(65,30) NOT NULL,
    "averageNetIncome" DECIMAL(65,30) NOT NULL,
    "confirmedGrossIncome" DECIMAL(65,30),
    "confirmedNetIncome" DECIMAL(65,30),
    "status" TEXT NOT NULL,
    "confirmedBy" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "observations" TEXT,
    "calculatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "IncomeCalculation_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "IncomeCalculation" ADD CONSTRAINT "IncomeCalculation_mortgageCaseId_fkey"
    FOREIGN KEY ("mortgageCaseId") REFERENCES "MortgageCase"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;