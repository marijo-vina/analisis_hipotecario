-- Rename table: BankProductPolicy -> BankPolicy
ALTER TABLE "BankProductPolicy" RENAME TO "BankPolicy";

-- Rename the relation constraint (if exists)
-- The foreign key constraint name follows Prisma convention
DO $$
BEGIN
  -- Rename FK constraint from BankProductPolicy_bankId_fkey to BankPolicy_bankId_fkey
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'BankPolicy' AND constraint_name = 'BankProductPolicy_bankId_fkey'
  ) THEN
    ALTER TABLE "BankPolicy" RENAME CONSTRAINT "BankProductPolicy_bankId_fkey" TO "BankPolicy_bankId_fkey";
  END IF;
END $$;

-- Add CMA columns to BankPolicy (nullable, additive)
ALTER TABLE "BankPolicy" ADD COLUMN "minimumIncome" DECIMAL(12, 2);
ALTER TABLE "BankPolicy" ADD COLUMN "minimumPropertyValue" DECIMAL(12, 2);

-- Add minimumBureauScore to Bank (nullable, additive)
ALTER TABLE "Bank" ADD COLUMN "minimumBureauScore" INTEGER;

-- Expand ProductDestination enum with new values
ALTER TYPE "ProductDestination" ADD VALUE 'TERRENO';
ALTER TYPE "ProductDestination" ADD VALUE 'CONSTRUCCION';
ALTER TYPE "ProductDestination" ADD VALUE 'REMODELACION';

-- Add unique constraint: one policy per bank per destination
ALTER TABLE "BankPolicy" ADD CONSTRAINT "BankPolicy_bankId_destination_key" UNIQUE ("bankId", "destination");

-- Replace old index [destination, personType, isActive] with [destination, isActive]
DROP INDEX IF EXISTS "BankProductPolicy_destination_personType_isActive_idx";
CREATE INDEX "BankPolicy_destination_isActive_idx" ON "BankPolicy"("destination", "isActive");

-- Drop old index [bankId] — subsumed by the new unique constraint
DROP INDEX IF EXISTS "BankProductPolicy_bankId_idx";
