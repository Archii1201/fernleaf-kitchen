SELECT
  (SELECT COUNT(*) FROM "Company") AS companies,
  (SELECT COUNT(*) FROM "Dish") AS dishes,
  (SELECT COUNT(*) FROM "CustomerEmployee") AS employees,
  (SELECT COUNT(*) FROM "PrepUnit") AS prep_units;
