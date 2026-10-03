SELECT
  ca.id AS address_id,
  ca."companyId",
  c.name AS company_name,
  ca.label,
  ca.line1,
  ca.city,
  ca."postalCode"
FROM "CompanyAddress" ca
JOIN "Company" c ON c.id = ca."companyId"
WHERE ca.active = true
ORDER BY c.name, ca.label;
