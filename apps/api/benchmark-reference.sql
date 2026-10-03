SELECT id, name
FROM "Company"
ORDER BY name;

SELECT id, "sku", name
FROM "Dish"
WHERE "active" = true
ORDER BY name;
