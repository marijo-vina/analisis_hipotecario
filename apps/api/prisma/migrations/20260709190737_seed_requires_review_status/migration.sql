-- Seed REQUIRES_REVIEW CaseStatus record
INSERT INTO "CaseStatus" (code, name, "order")
SELECT 'REQUIRES_REVIEW', 'Requiere revisión', COALESCE(MAX("order"), 0) + 1
FROM "CaseStatus"
WHERE NOT EXISTS (SELECT 1 FROM "CaseStatus" WHERE code = 'REQUIRES_REVIEW');
