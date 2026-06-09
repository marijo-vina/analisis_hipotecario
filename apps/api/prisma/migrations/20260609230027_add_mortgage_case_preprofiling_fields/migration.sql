-- CreateEnum
CREATE TYPE "PersonType" AS ENUM ('SALARIED');

-- AlterTable
ALTER TABLE "MortgageCase" ADD COLUMN     "estimatedTermMonths" INTEGER,
ADD COLUMN     "personType" "PersonType" NOT NULL DEFAULT 'SALARIED',
ADD COLUMN     "propertyLocation" TEXT,
ALTER COLUMN "requestedAmount" DROP NOT NULL,
ALTER COLUMN "propertyValue" DROP NOT NULL;
