# Step 15 — Dispatch

Dispatch owns the post-kitchen movement of a Drop. Identity is still
`company + address + exact delivery time` (the existing unique key).

```
READY (kitchen)
    → POST /dispatch/orders/:id/ready   → DISPATCH_READY
    → POST /dispatch/drops/:id/out      → OUT_FOR_DELIVERY
    → POST /dispatch/drops/:id/deliver  → DELIVERED
```

No skips. Repeating a transition is `409`. `out` requires an assigned,
active driver who holds `delivery.update` (capability check, not a role name).
Assign via `POST /dispatch/drops/:id/assign-driver`.

List: `GET /dispatch/drops?date=` (`dispatch.view`). Writes: `dispatch.manage`.

Each mutate locks the Drop/Order row (`SELECT … FOR UPDATE`) inside a
transaction and writes the matching `OrderEvent`.
