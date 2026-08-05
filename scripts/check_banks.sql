SELECT
  b.code,
  COUNT(bp.id) AS active_policies
FROM "Bank" b
LEFT JOIN "BankPolicy" bp
  ON bp."bankId" = b.id AND bp."isActive" = true
GROUP BY b.id, b.code
ORDER BY b.code;
