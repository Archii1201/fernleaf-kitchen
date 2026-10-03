# Step 14 — Kitchen board

Each `OrderCombination` already has one `PrepUnit`. The station code/name on
that row is a snapshot from order creation. Changing `Dish.kitchenStationId`
later does not move in-flight work.

Statuses (schema names): PENDING → IN_PROGRESS (start) → READY (done).
PENDING → READY is allowed and writes `startedAt` as well as `completedAt`.
Repeating start or done is `409`.

An order is kitchen-workable only in CONFIRMED / IN_KITCHEN. The first start
sets `Order.kitchenStartedAt` and CONFIRMED → IN_KITCHEN. The order becomes
READY only when every prep unit is READY.

Force-complete (`kitchen.force_complete`, Admin only) finishes remaining
units and leaves already-READY rows untouched.

Planned times (recomputed if delivery time changes; actuals are never overwritten):

```
dispatchReadyAt = deliveryAt − leaveKitchenMinutes
kitchenReadyAt  = dispatchReadyAt − 30 minutes
```

Board timing vs `now` and planned `kitchenReadyAt`: LATE / AT_RISK (15 min window) / ON_TRACK.

Start/done take `SELECT … FOR UPDATE` on the prep unit inside a transaction.
