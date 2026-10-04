# P0-3 — implementation complete, verification pending

P0-1 is green according to the user's verification. P0-3 cannot be marked PASS or COMPLETE until the new focused tests, API typecheck and relevant existing regressions pass. No terminal commands, tests or typechecks were executed for this repair. P0-4 was not started.

## Actual root causes

1. Full order replacement checked `dto.version` against a header read in `OrdersService.update`, before persistence. `replaceAllLines` acquired a PostgreSQL row lock, but did not compare the expected version. Two callers could both pass preflight and sequentially overwrite each other's lines. The service then wrote delivery/header snapshots and totals through a separate unconditional update, outside the lines transaction. Interleaving these operations could leave one request's lines paired with another request's totals or delivery data; a header failure could leave a partial replacement.
2. Placement, cancellation and rejection checked the state outside the write transaction, then performed an unconditional update by ID. Version increments alone did not reject a competing mutation. Their events were separate writes, so state could commit without its event, and duplicate concurrent requests could create duplicate transitions/events.
3. Line-diff persistence already locked the order and checked expected version inside its transaction. That protection against other versioned edits was atomic. However, eligibility and preparation checks depended on earlier service reads. State writers such as cutoff do not necessarily increment the edit version, so the lock also needs a current state check and a diff computed from current rows.
4. Cutoff processing serialized cutoff runs with an advisory lock but read candidate order states without order row locks. That advisory lock does not serialize manual edits/cancellations. A stale PLACED candidate could subsequently overwrite a cancellation with CONFIRMED, and the drop could use stale delivery data.

## Concurrency mechanism

The repair reuses the existing PostgreSQL `SELECT ... FOR UPDATE` order row lock. No second concurrency mechanism, schema change or persistence redesign was introduced.

- Full replacement acquires the lock, rechecks invoice/version/editable state/preparation status, and writes all lines, combinations, prep units, delivery/header fields and totals in the same transaction. Version increments once. When the existing optional HTTP version is omitted, the service passes the version captured at preflight rather than removing the DTO's optional behavior.
- Place/cancel/reject acquire the same lock, compare the captured version, revalidate the existing state transition, and write state/timestamps/version/event together. A competing request that captured the same version receives the existing `ORDER_VERSION_CONFLICT` error.
- Line-diff edits retain their lock/version/invoice checks and persisted-combination total reconciliation. They also recheck current eligibility and compute the domain diff from the rows loaded under the lock. Unchanged combinations retain their original money/snapshots.
- Cutoff processing acquires candidate order row locks in ID order before loading their current state/delivery data. Its subsequent read is restricted to those locked IDs. Cutoff schedules, confirmation/cancellation policy, existing version behavior and idempotency logic are unchanged.
- Admin overrides already used the order lock, version check and transaction. Their production implementation remains unchanged; a concurrency regression proves this existing path.
- SQL updates by ID are protected by the row lock retained through commit/rollback. They are not unprotected application checks followed by later writes.

Existing reads after commit can observe a later valid mutation. Such a response does not mean the earlier transaction lost its update. Requests that captured a newer version may validly run afterward according to the state machine.

## Files changed

Production:
- `apps/api/src/orders/order.repository.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/src/kitchen/cutoff/cutoff-processing.service.ts` — only the confirmation/cancellation locking boundary changed.

Tests:
- `apps/api/test/order-concurrency.e2e-spec.ts` — 18 new cases against the real PostgreSQL database and HTTP handlers.
- `apps/api/src/kitchen/cutoff/cutoff-processing.service.spec.ts` — existing mock extended for the locking query; existing assertions preserved and lock-before-read assertion added.

Documentation:
- `P0-3-REVIEW.md`

## Focused regressions

The new tests cover concurrent same-version monetary edits; stale rejection with complete persisted-state comparison; competing combination splits; concurrent full replacements including matching delivery data; optional-version full updates; full replacement racing a line diff; cancellation racing both edit paths; duplicate placement/cancellation/rejection; concurrent admin overrides; full-replacement rollback when the later header write fails; transition rollback when event insertion fails; state and preparation changes that do not increment version; and cutoff confirmation holding the actual order row lock against a second connection and a competing cancellation.

Competing requests use `Promise.all`. Tests requiring an identical preflight snapshot synchronize only the header reads; the actual HTTP handlers, database transactions, SQL locks and writes run concurrently. The cutoff test pauses a real transaction after candidate reads and probes its order lock from a second transaction with `FOR UPDATE NOWAIT` before sending cancellation. It would fail if candidate rows were not locked.

Assertions verify exactly one successful same-version mutation, the existing conflict code, one version increment, no rejected-request overwrite, snapshot stability, line/combo quantity sums, integer total reconciliation, option snapshots, prep-unit counts/quantities and state/event consistency. Failure cases compare all persisted order rows before and after.

Fixtures create uniquely named catalogue records and owned orders, and remove only recorded IDs. Shared seeded accounts/company/employee/settings/prices are not changed. The fixed clock is restored after the cutoff case.

## Manual verification

From `C:\Users\DELL\Desktop\fernleaf-kitchen`, with the existing seeded test database available, run this focused suite first:

```powershell
pnpm --filter api test:e2e test/order-concurrency.e2e-spec.ts
```

Only after it passes, run the API typecheck:

```powershell
pnpm --filter api exec tsc --noEmit
```

Then run the relevant existing regressions:

```powershell
pnpm --filter api test src/orders src/kitchen/cutoff/cutoff-processing.service.spec.ts
pnpm --filter api test:e2e test/orders.e2e-spec.ts test/order-combinations.e2e-spec.ts test/admin-overrides.e2e-spec.ts test/cutoff.e2e-spec.ts
```

Do not run the full suite until these focused checks are green. Send the results back for any required correction. No test/typecheck PASS is claimed here.

## Scope and remaining concerns

- P0-3 verification is pending; the implementation is not yet declared COMPLETE.
- P0-1 selection rules, P0-2 invoice/credit policy and total reconciliation, pricing, cutoff calculations, RBAC, frontend and schema are unchanged.
- `lockAndLoad` is unused by the audited mutation paths; it returns a transaction client after that transaction ends and must not be treated as a lasting lock by a future caller. This repair uses locks inside the transaction performing the writes.
- Kitchen aggregate completion concurrency belongs to P0-4 and remains unaudited for completion. It was not changed or claimed fixed.
- Concurrent creation/order-number allocation and broader billing/dispatch concurrency are outside this same-existing-order mutation repair.
