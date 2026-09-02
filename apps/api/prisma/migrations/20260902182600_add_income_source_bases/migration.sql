-- Additive HU-18 columns on IncomeCalculation.
-- source TEXT NOT NULL DEFAULT 'PAYROLL' backfills every existing row.
-- bases JSONB stays NULL for pre-HU-18 snapshots.

ALTER TABLE "IncomeCalculation" ADD COLUMN "source" TEXT NOT NULL DEFAULT 'PAYROLL';
ALTER TABLE "IncomeCalculation" ADD COLUMN "bases" JSONB;
