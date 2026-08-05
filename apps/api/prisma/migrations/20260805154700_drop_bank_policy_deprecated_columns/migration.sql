-- Drop deprecated columns from BankPolicy
-- These fields were removed as part of the catalogo-bancario-cma cleanup:
-- name, personType, maximumLtv, maximumMaturityAgeMonths, sourceVersion

ALTER TABLE "BankPolicy" DROP COLUMN "name";
ALTER TABLE "BankPolicy" DROP COLUMN "personType";
ALTER TABLE "BankPolicy" DROP COLUMN "maximumLtv";
ALTER TABLE "BankPolicy" DROP COLUMN "maximumMaturityAgeMonths";
ALTER TABLE "BankPolicy" DROP COLUMN "sourceVersion";
