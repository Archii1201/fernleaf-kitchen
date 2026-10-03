SELECT
  d.id AS dish_id,
  d.name AS dish_name,
  d."kitchenStationId",
  ks.code AS station_code,
  ks.name AS station_name
FROM "Dish" d
LEFT JOIN "KitchenStation" ks
  ON ks.id = d."kitchenStationId"
WHERE d.active = true
ORDER BY d.name;
