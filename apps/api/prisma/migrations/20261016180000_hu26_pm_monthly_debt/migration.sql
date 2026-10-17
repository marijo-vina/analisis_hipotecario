-- Persona Moral company-bureau debt, prorated by share percentage.
-- Null on snapshots that only carry the shareholder (or salaried / PFAE) bag.
ALTER TABLE "LiabilitySnapshot" ADD COLUMN "pmMonthlyDebt" DECIMAL;
