SELECT
  ce.id,
  ce."companyId",
  ce."fullName",
  ce.email
FROM "CustomerEmployee" ce
WHERE ce."companyId" = 'ef82f1a9-7da3-453d-bff9-5b493724b4d8'
ORDER BY ce."fullName";
