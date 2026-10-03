# Step 16 — Driver

```
GET  /driver/drops/today
POST /driver/drops/:id/deliver
```

Today only, current driver's drops only, `deliveryTime ASC`. Responses omit
money and admin fields.

Deliver verifies `drop.driverStaffId` matches the authenticated staff row;
otherwise `403`. Optional `note` and image (`file`, JPEG/PNG/WebP, 2 MB via
`FilesService`). Repeated/concurrent deliver is `409` after a row lock.

On-time: `deliveredAt <= deliveryAt + KitchenSettings.deliveryGraceMinutes`
(default **15**). Persisted on the Drop with `deliveredAt`. Clock is
`KitchenTime` / Asia/Kolkata, never the host TZ.
