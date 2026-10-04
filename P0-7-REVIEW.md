# P0-7 — Seed setup repair and focused verification

P0-7 STATUS: PASS for the focused verification gate. All nine focused tests executed and passed. API typecheck and billing/dashboard regressions have not been run in this turn, as requested. P0-8 has not been started.

## Root cause of DEMO-HIST-001

A read-only database trace found this existing row:

- Order ID: eedb1f3f-99da-463e-9b37-279a19c16d94
- Order number/status: DEMO-HIST-001 / DELIVERED
- Header subtotal/total: 2,099 cents
- Persisted line: quantity 2, unit price 2,099, line total 4,198 cents
- Persisted combination: quantity 2, unit price 2,099, total 4,198 cents
- Demo ownership marker: demo:order:history:delivered

This matches the earlier seed's defect: header money represented one meal while its persisted line/combination represented two. It is stale invalid demo data from the previous seed version, rather than a newly generated Order from the repaired helper.

The focused suite called seedAll against the shared database's canonical lookup keys. It therefore reused that old, already-invoiced row during beforeAll, rather than creating independent normal demo fixtures. The correct immutable-history guard stopped setup, so all nine assertions were skipped.

## Why it was invoiced

The persisted Order is linked to invoice f61dd8b7-1147-43c9-a035-e1e8c8427695, numbered INV-20261004083750531-eedb1f3f, status ISSUED.

Its ORDER invoice line references DEMO-HIST-001 and bills 2,099 cents. The same invoice also links DEMO-TODAY-001, whose header is 2,099 cents; the invoice subtotal/total is 4,198 cents. This invoice is outside the generator's DEMO-INV-* records. Its ledger agrees with the Order headers that were billed, while those legacy headers disagree with their financial lines.

There is no evidence of a new production pricing/billing mutation causing the Order mismatch. The prior seed supplied the inconsistent header; the existing invoice persisted billing history based on those headers. The database trace does not identify which human or caller initiated invoicing.

## Why automatic repair is unsafe

Demo ownership of an Order does not establish ownership of its ordinary, shared invoice. The invoice has no seed ownership marker. Changing Order money, invoice lines, invoice totals, or clearing invoice links here would rewrite existing billing history. No such changes were made. Running the normal seed against this invalid invoiced row still fails explicitly, which is the required policy.

## Fix

1. The focused fixture reserves existing canonical Order/invoice numbers and the Northwind domain/Alice email only within its rollback-only PostgreSQL transaction. Existing rows retain IDs, all monetary values, financial lines, invoice associations, and credits. The actual seed generators then create independent fresh demo records. Original names and references remain visible outside the transaction and are restored on rollback.
2. Teardown verifies preserved historical Order/invoice/credit snapshots were not rewritten. A separate read-only query after the green run confirmed the original DEMO-HIST-001 still has its original money and invoice link, with zero P07-preserved-* Order aliases remaining.
3. The ninth test intentionally corrupts only its freshly generated paid fixture. It asserts that seedDemoOperations rejects the invoiced mismatch and leaves both Order and invoice unchanged. It then constructs a separate uninvoiced legacy-repair fixture. The normal seed no longer depends on deliberate corrupt invoiced fixtures.
4. New Order headers are provisional zeros inside the existing transaction until real lines/combinations have been persisted. Header totals are then derived from the persisted line aggregate; invoicing happens afterward. Nothing provisional commits.
5. The run exposed another seed setup bug: basic and rich generators both create a category named Salads using different slugs, although names are unique. The rich generator now upserts by the existing unique name and reuses that category. Both the TypeScript generator and its tracked JavaScript counterpart were updated.

The invoiceId guard remains intact. Existing valid invoiced snapshots are verified and left unchanged. No production billing, credit, pricing, authorization, state-machine, frontend, or schema implementation changed. Existing assertions were retained and history-preservation assertions were added.

## Files changed in this repair

- apps/api/prisma/seed-financials.ts
- apps/api/prisma/seed-demo.ts
- apps/api/prisma/seed-demo.js
- apps/api/test/seed-financial-consistency.e2e-spec.ts
- P0-7-REVIEW.md

## Focused verification

Command executed:

```powershell
pnpm --filter api test:e2e test/seed-financial-consistency.e2e-spec.ts
```

Final result: 1 test file passed; 9 tests passed / 0 failed / 0 skipped. Duration: 10.09 seconds.

All nine tests verify persisted Order/line/combination totals, invoice links and ledgers, paid status without payment fields, credit application exactly once, company outstanding balances, dashboard/API balances, stable reruns, production derived/missing pricing, and safe legacy repair/rejection.

The first repaired run exposed the category-name collision and skipped all tests; that blocker was fixed before the final green run. The sandbox's Corepack download failed, so the same focused command was rerun with approved escalation. No broader test suite was run.

## Remaining verification / preserved historical concern

API typecheck and billing/dashboard regressions are deferred under the latest instruction to run only focused verification and report back. This focused PASS does not claim those remaining checks are green.

The old invalid, invoice-linked live demo history remains unchanged and cannot be automatically repaired by this seed without rewriting unowned billing history. It is now separate from the fresh normal-generator test fixture, with explicit immutable-history rejection covered by the focused suite. P0-8 remains untouched.
