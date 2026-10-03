EXPLAIN (ANALYZE, BUFFERS)
SELECT id, "orderNumber", status, "deliveryDate", "deliveryTime",
       "companyId", "leaveKitchenMinutes", "kitchenReadyAt", "dispatchReadyAt"
FROM "Order"
WHERE "deliveryDate" = CURRENT_DATE
  AND status IN ('CONFIRMED', 'IN_KITCHEN', 'READY')
ORDER BY "deliveryTime" ASC;
