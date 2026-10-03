# Step 13 — Cutoff processing

`CutoffProcessingService.ensureProcessed(date)` is the only writer. The
HTTP trigger, the startup hook and the interval job all call it.

```
POST /cutoff/process/:date
CutoffScheduler.tick
        ↓
ensureProcessed(date)
        ↓
CutoffService.resolve (kitchen calendar, never company week)
        ↓
if cutoffAt is still in the future → skip
        ↓
BEGIN
  pg_advisory_xact_lock(8713, hashtext(date))
  re-read CutoffRun
  DRAFT → CANCELLED + SYSTEM event
  PLACED → CONFIRMED + SYSTEM event + Drop upsert
  upsert CutoffRun COMPLETED
COMMIT
```

Idempotency: a completed `CutoffRun` for that target delivery date short-circuits
after the lock. Orders already CONFIRMED/CANCELLED are not selected.
`Drop` uses the existing composite unique key; `DropOrder.orderId` is unique.

The advisory lock is PostgreSQL, not a process flag. Two workers serialize;
the second sees the completed run.

Manual calls accept any past delivery date. Future cutoffs are not processed.

Scheduler: `OnModuleInit` plus a 3-minute interval. Disabled under Vitest.
Permission: `kitchen.update`.
