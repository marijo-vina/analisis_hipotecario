-- Step 1: Upsert all 8 new status codes
-- Ensures target status IDs exist before FK remapping
INSERT INTO "CaseStatus" (code, name, "order") VALUES
  ('PENDING_DOCUMENTS', 'Pendiente de documentos', 1),
  ('DOCUMENTS_UPLOADED', 'Documentos cargados', 2),
  ('PROCESSING', 'En procesamiento', 3),
  ('DATA_EXTRACTED', 'Datos extraídos', 4),
  ('IN_REVIEW', 'En revisión', 5),
  ('REPORT_GENERATED', 'Reporte generado', 6),
  ('OBSERVED', 'Observado', 7),
  ('CLOSED', 'Cerrado', 8)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  "order" = EXCLUDED."order";

-- Step 2: Remap old status codes to new ones (FK-safe: subqueries find correct IDs)
UPDATE "MortgageCase"
SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'DOCUMENTS_UPLOADED')
WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'INTEGRATION');

UPDATE "MortgageCase"
SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'IN_REVIEW')
WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'ANALYSIS');

UPDATE "MortgageCase"
SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'CLOSED')
WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'COMPLETED');

UPDATE "MortgageCase"
SET "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'OBSERVED')
WHERE "statusId" = (SELECT id FROM "CaseStatus" WHERE code = 'REJECTED');

-- Step 3: Delete old status codes no longer in the catalog
-- Safe because no MortgageCase rows reference them after Step 2
DELETE FROM "CaseStatus"
WHERE code IN ('INTEGRATION', 'ANALYSIS', 'COMPLETED', 'REJECTED');
