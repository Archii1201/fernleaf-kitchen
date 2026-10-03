# Step 17 — Admin overrides

Confirmed-pipeline orders can have delivery time, address and packaging
changed without re-pricing. Permission: `orders.override` (Admin only).

```
PUT /orders/:id/admin/delivery-time  { deliveryTime, version }
PUT /orders/:id/admin/address        { addressId, version }
PUT /orders/:id/admin/packaging      { packagingTypeId, version }
```

Each write: lock the order row, re-read, compare `version`, 409 if stale,
apply the snapshot fields, increment `version` once. Money and actual
timestamps are never in the patch. Delivery-time only recalculates
planned kitchen/dispatch times.

Address must belong to the same company and be active. Packaging must
exist and be active. Invoiced orders still accept these non-monetary
overrides. Line-edit and kitchen force-complete stay on their existing
services.
