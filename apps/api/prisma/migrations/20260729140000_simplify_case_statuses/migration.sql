-- Simplify case statuses from 8 to 4.
-- New flow: PENDING_DOCUMENTS → DOCUMENTS_UPLOADED → DOCUMENTS_PROCESSED → PRELIMINARY_RESULT
--
-- Follows the established INSERT → UPDATE → DELETE pattern from 20260611120000_migrate_case_statuses.

-- Step 1: Insert new status codes
INSERT INTO "CaseStatus" (code, name, "order") VALUES
  ('DOCUMENTS_PROCESSED', 'Documentos procesados', 3),
  ('PRELIMINARY_RESULT', 'Resultado preliminar', 4)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name, "order" = EXCLUDED."order";

-- Step 2: Remap existing cases
-- PROCESSING, DATA_EXTRACTED → DOCUMENTS_PROCESSED
UPDATE "MortgageCase" SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'DOCUMENTS_PROCESSED')
WHERE "statusId" IN (
  SELECT id FROM "CaseStatus" WHERE code IN ('PROCESSING', 'DATA_EXTRACTED')
);

-- IN_REVIEW, REPORT_GENERATED, OBSERVED, CLOSED, REQUIRES_REVIEW → PRELIMINARY_RESULT
UPDATE "MortgageCase" SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'PRELIMINARY_RESULT')
WHERE "statusId" IN (
  SELECT id FROM "CaseStatus" WHERE code IN ('IN_REVIEW', 'REPORT_GENERATED', 'OBSERVED', 'CLOSED', 'REQUIRES_REVIEW')
);

-- Step 3: Delete old status codes (7 removed)
DELETE FROM "CaseStatus"
WHERE code IN ('PROCESSING', 'DATA_EXTRACTED', 'IN_REVIEW', 'REPORT_GENERATED', 'OBSERVED', 'CLOSED', 'REQUIRES_REVIEW');

-- ============================================================================
-- ROLLBACK SQL (run manually if needed):
-- ============================================================================
--
-- -- Re-insert old statuses
-- INSERT INTO "CaseStatus" (code, name, "order") VALUES
--   ('PROCESSING', 'En procesamiento', 3),
--   ('DATA_EXTRACTED', 'Datos extraídos', 4),
--   ('IN_REVIEW', 'En revisión', 5),
--   ('REPORT_GENERATED', 'Reporte generado', 6),
--   ('OBSERVED', 'Observado', 7),
--   ('CLOSED', 'Cerrado', 8),
--   ('REQUIRES_REVIEW', 'Requiere revisión', 9)
-- ON CONFLICT (code) DO NOTHING;
--
-- -- Best-effort reverse mapping
-- UPDATE "MortgageCase" SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'IN_REVIEW')
-- WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'PRELIMINARY_RESULT');
--
-- UPDATE "MortgageCase" SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'PROCESSING')
-- WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'DOCUMENTS_PROCESSED');
--
-- -- Delete new statuses
-- DELETE FROM "CaseStatus" WHERE code IN ('DOCUMENTS_PROCESSED', 'PRELIMINARY_RESULT');
