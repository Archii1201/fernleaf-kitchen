# P0-5 — Delivery override / Drop synchronization

P0-5 STATUS: FAIL — verification pending. Implementation and regression source are ready; no test failure has been observed because tests have not been executed. The user will run verification manually. P0-7 and P0-8 have not been started.

## Actual root cause

OrdersController delegates delivery-time, address, and packaging admin overrides to OrderAdminService. That service already uses a Prisma transaction and OrderRepository.lockAndRead, but previously updated only Order. It never updated the associated Drop. DispatchService.list and DriverService.listToday read delivery time and address from Drop, so a successful time/address override could leave dispatch and driver showing old delivery information.

There was a real Order/Drop synchronization bug: YES.

## Authoritative data and approved scope

- Order deliveryDate, deliveryTime, deliveryAddressId, and companyId supply the existing Drop grouping key. The existing admin endpoints change time and address; they do not reassign company or delivery date.
- Address ownership/activity validation and Order address snapshots stay in the existing override flow.
- Packaging exists on Order, with no equivalent Drop field. Packaging remains an Order-only override.
- Drop.driverStaffId is the dispatch/driver assignment. Preserve it, including null. Order creation snapshots a company default driver on Order; existing normal Drop creation does not copy that default to Drop. This repair does not introduce default-driver propagation.
- Preserve Drop identity, membership, status, notes, photo, actual dispatch/delivery timestamps, and onTime. Existing late admin overrides remain allowed.
- The user approved synchronization only for single-order Drops with an unused destination key. Changed delivery keys for shared Drops return 409 DROP_DELIVERY_OVERRIDE_SHARED. Existing destination Drops return 409 DROP_DELIVERY_OVERRIDE_COLLISION. Both roll back the entire override; splitting, merging, or regrouping remains pending review.
- If no Drop exists, retain existing Order-only behavior and do not create one. If the grouping key already agrees, no Drop write is needed.

## Transaction / concurrency mechanism

Within the existing Prisma transaction, capture membership and lock an existing Drop FOR UPDATE before taking the existing Order FOR UPDATE lock. OrderRepository.lockAndRead remains authoritative for expected-version rejection. Recheck membership after acquiring locks and reject a changed association with 409 DROP_ORDER_MEMBERSHIP_CHANGED.

Patch Order and increment its version, then synchronize the existing Drop inside the same transaction. A shared/colliding destination or a failed Drop update rolls back Order, version, and planned-time writes together. The existing database unique grouping constraint arbitrates two different Drops racing for one destination; Prisma P2002 is translated into the same collision conflict after rollback.

Dispatch departure and delivery already acquire Drop before writing Order. Dispatch markOrderReady now takes that same lock order when membership exists, rather than taking Order then writing Drop. This avoids introducing an opposing lock order. It also rechecks membership. Eligibility, state transitions, events, readiness, and assignment behavior remain unchanged.

No schema, frontend, RBAC, billing, cutoff, pricing, money, or kitchen implementation changes.

## Production files changed

- apps/api/src/orders/order-admin.service.ts
- apps/api/src/dispatch/dispatch.service.ts

## Test files changed

- apps/api/test/order-drop-overrides.e2e-spec.ts — 21 expanded real-PostgreSQL cases.
- apps/api/src/orders/order-admin.service.spec.ts — add absent-Drop membership lookup to existing mocks; retain assertions.
- apps/api/src/dispatch/dispatch.service.spec.ts — add existing membership lookup and assert Drop-before-Order lock calls; retain assertions.

Focused cases cover time/address overrides; dispatch and driver reads; packaging and unchanged monetary/planned data; assigned and unassigned drivers; foreign-company rejection; absent Drop; rollback after a real Drop foreign-key failure; same-version time/time and time/address races; stale version rejection; shared/colliding destinations; OUT_FOR_DELIVERY and DELIVERED override preservation; dispatch-ready/departure/driver-delivery races; unpaid and paid invoice non-monetary overrides; and different Drops racing for one destination.

The rollback case wraps only the Drop update call to induce a real foreign-key error inside the real PostgreSQL transaction, after the real Order update. HTTP handlers and database persistence are used for normal overrides and concurrency cases.

## Manual verification — run in this order

From the repository root, first run only focused P0-5 tests:

```powershell
pnpm --filter api test:e2e test/order-drop-overrides.e2e-spec.ts
```

Only after those are green:

```powershell
pnpm --filter api exec tsc --noEmit
```

Then the relevant existing unit regressions:

```powershell
pnpm --filter api test src/orders src/dispatch src/driver
```

Then the existing Order, admin override, concurrency, dispatch/Drop, and driver database regressions:

```powershell
pnpm --filter api test:e2e test/admin-overrides.e2e-spec.ts test/orders.e2e-spec.ts test/order-concurrency.e2e-spec.ts test/dispatch.e2e-spec.ts test/driver.e2e-spec.ts
```

Use the existing seeded test database. No terminal commands, test runs, or typechecks were executed by the agent.

## Verification results

- Focused P0-5 tests: NOT RUN; pending manual verification.
- API typecheck: NOT RUN; PASS/FAIL cannot yet be determined.
- Order regressions: NOT RUN.
- Dispatch/driver regressions: NOT RUN.

## Remaining concerns

P0-5 is not verified GREEN or complete until the commands above pass. Shared/colliding regrouping remains pending domain review, as explicitly requested; those overrides fail atomically. Existing company-default-driver propagation into newly created Drops remains unchanged. This repair does not backfill historical mismatches. P0-1 through P0-4 are user-verified green and their business behavior is preserved.
