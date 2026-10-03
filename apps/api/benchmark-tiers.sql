SELECT id, code, name, "isDefault", strategy, active
FROM "PriceTier"
WHERE active = true
ORDER BY name;
