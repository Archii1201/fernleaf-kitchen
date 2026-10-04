# P0-4 — kitchen aggregate concurrency

Implementation is ready for manual verification. P0-3 is verified green according to the user. P0-4 is not declared PASS or COMPLETE until its focused regressions, API typecheck and relevant existing regressions pass. No commands, tests or typechecks were run by the agent. P0-5 was not started.

## Actual root cause

The controller routes start/done/force-complete directly to `KitchenBoardService`, which writes through Prisma interactive transactions. There is no separate PrepUnit repository on this path.

Normal start/done previously acquired `PrepUnit FOR UPDATE`, then read the unit and its order. This already protected duplicate transitions on the same unit. It did not consistently lock the parent order before mutating distinct units and counting aggregate readiness.

For an already-started order, two different final units could update in separate transactions and each count the other's uncommitted unit as unfinished. Both transactions could commit completed units without marking the order READY. The incidental order update on the very first kitchen start did not protect later completions.

Normal actions also used child-before-parent locks, while force-complete and the P0-3 order edit paths used parent-before-child locks. Competing normal/forced actions could deadlock, or force-complete could read stale unit timestamps before a normal completion and later replace them. Normal actions could also use stale parent state/start information after another aggregate mutation.

## Smallest production repair

Only `KitchenBoardService.mutateUnit` changed. It now:

1. Reads only the unit's parent ID to locate the order.
2. Acquires the existing PostgreSQL order row lock.
3. Acquires the existing prep-unit row lock.
4. Reloads unit and parent state after the locks.
5. Runs the unchanged state validation, mutation, timestamps, aggregate count, order update and event logic within that same transaction.

Every kitchen mutation for one order now shares the order lock through commit/rollback. Force-complete already locked the parent first, so its production implementation did not need changes. Other orders remain independent. The lock order matches P0-3 order edits: Order before PrepUnit.

No schema, state machine, controller, permissions, frontend, pricing, order combinations, billing, cutoff or order-version behavior changed. No new concurrency mechanism was introduced.

## Existing behavior preserved

- The existing persisted completion status is `READY`; no `DONE` enum was added.
- Start still requires a pending unit and fills its start timestamp once.
- Completion still supplies a start timestamp for an unstarted unit and retains an existing start timestamp.
- A normal request on a READY order still receives `KITCHEN_ORDER_NOT_WORKABLE`, because the existing contract checks order eligibility before duplicate unit state.
- A duplicate completion on a still-workable order still receives `PREP_UNIT_ALREADY_DONE`; a duplicate start receives `PREP_UNIT_ALREADY_STARTED`.
- Force-complete remains supported and idempotent for READY orders, preserving previously completed unit timestamps.
- Planned kitchen/dispatch times are untouched; actual start/completion timestamps and kitchen events remain handled by the existing logic.
- Same-unit transitions were already protected by their unit lock. The repair adds the missing aggregate boundary for distinct-unit and force-complete races.

## Files changed

Production:
- `apps/api/src/kitchen/board/kitchen-board.service.ts`

Tests:
- `apps/api/test/kitchen-concurrency.e2e-spec.ts` — 14 new focused cases against real HTTP handlers and PostgreSQL.
- `apps/api/src/kitchen/board/kitchen-board.service.spec.ts` — existing mock fixtures include the parent ID needed by the new reference lookup; existing assertions remain intact, with assertions for parent-before-child locks added.

Documentation:
- `P0-4-REVIEW.md`

## Focused regressions

The new cases cover:

1. Concurrent completion of the same non-final unit: exactly one success, one existing conflict, valid timestamps and no duplicate start event.
2. Concurrent start of the same unit: one success, one existing conflict and one valid start timestamp.
3. Completion of an unstarted unit: both timestamps supplied, with the order remaining unfinished while another unit is pending.
4. Two completions of the final unit: exactly one success, one existing conflict and exactly one aggregate-ready event.
5. Three different units completing concurrently on an already-started order: all complete, readiness is retained and no completion is lost.
6. Concurrent starts of distinct units: all start, with one order-start event.
7. Normal completion racing force-complete: no deadlock or duplicate aggregate event, and earlier completed timestamps retained.
8. Normal start racing force-complete: valid final state with the existing loser behavior.
9. Concurrent and repeated force-complete: idempotent events and timestamps.
10. Already-completed unit rejection: the complete persisted snapshot remains unchanged.
11. Completion after an earlier start: original start timestamp preserved and later completion timestamp recorded.
12. Start racing completion: completion survives and cannot be overwritten by the start request.
13. Real foreign-key failure during event insertion: earlier unit/order writes roll back; a later retry succeeds.
14. Deterministic aggregate-lock proof: a real completion pauses at the aggregate count on an already-started order. A second PostgreSQL connection attempts `Order FOR UPDATE NOWAIT` and must encounter the lock. Other unit completions then run concurrently and produce one READY aggregate. The previous implementation did not hold that parent lock at this point.

Competing actions use `Promise.all`, not sequential substitutes for concurrency. The deterministic probe pauses only a real transaction; its SQL writes and lock checks are not mocked. The rollback case injects an invalid event actor ID to cause a real database foreign-key failure.

Assertions also preserve monetary totals, line/combo snapshots, quantities, unit/station identities, order version and planned ready/dispatch times. Fixtures create valid distinct combinations through the existing HTTP order-creation flow and use fixture-only confirmation, without changing shared cutoff data. Cleanup removes only recorded owned IDs.

## Manual verification

From `C:\Users\DELL\Desktop\fernleaf-kitchen`, using the existing seeded test database, first run only the focused P0-4 suite:

```powershell
pnpm --filter api test:e2e test/kitchen-concurrency.e2e-spec.ts
```

If green, run the API typecheck:

```powershell
pnpm --filter api exec tsc --noEmit
```

Then run the relevant existing kitchen unit tests:

```powershell
pnpm --filter api test src/kitchen/board
```

Then run the relevant order/kitchen E2E regressions, including the verified P0-3 concurrency tests and Step-25 lifecycle:

```powershell
pnpm --filter api test:e2e test/kitchen-board.e2e-spec.ts test/orders.e2e-spec.ts test/order-concurrency.e2e-spec.ts test/order-lifecycle.e2e-spec.ts
```

No full project suite is requested before focused verification passes. Send results back for any necessary correction. P0-5 remains gated on verified green P0-4 results.
