SELECT "deliveryDate", status, COUNT(*) AS orders
FROM "Order"
GROUP BY "deliveryDate", status
ORDER BY "deliveryDate", status;
