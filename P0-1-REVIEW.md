# P0-1 repair — awaiting manual verification

P0-1 is not yet complete. No tests or typechecks were run for this repair because the user requested manual command execution. P0-3 and subsequent repairs remain gated on green P0-1 results.

## Concrete root causes

- The new-order form displayed option-group labels but had no working option-selection inputs. Its payload always contained one combination with empty selections. Required groups therefore failed validation and independent combinations could not be submitted.
- `CombinationValidator` reset its duplicate-selection set for each group entry and applied the maximum to that entry alone. Splitting a group's selections across multiple entries bypassed duplicate and maximum checks.
- `OrderBuilder` loaded inactive option memberships along with active ones, allowing an active option to be selected through an inactive membership.

## Production repair

- Creation and editing share an option/combination editor. Each combination owns its quantity and option selections. The form sends selections to the existing quote/create/replace-lines endpoints; prices remain server calculated.
- Group duplicates and maximums are checked cumulatively within each combination. Independent combinations retain separate selection sets.
- The builder loads active memberships only. Existing domain validation still rejects inactive options and options outside their selected group.
- The order detail response exposes existing persisted line notes so editing combinations preserves kitchen instructions.
- Required groups retain their existing minimum of one selection; optional groups retain zero. No new minimum field or schema change was introduced.
- Existing invoice, cutoff, state, pricing, locking and role policies remain in force. No Dispatch API changes, commits or schema changes were made.

## Regression coverage added

- 10 validator cases: independent splits, exact/low/high sums, zero/negative/fractional quantities, duplicates within/across group entries, cumulative maximum, and required minimum with optional omission.
- 3 frontend state cases: independent selections, replacing/clearing a group, and restoring snapshots without submitting prices.
- 19 HTTP cases: company-tier pricing despite conflicting prices on a different tier; optional omission/selection; split quote/create/edit totals; prep-unit count, uniqueness and quantities; missing/empty required selections; wrong/unknown/inactive options; inactive membership; duplicate selections and cumulative maximum; quantity mismatch and invalid quantities; invalid edits leaving persisted data unchanged; historical snapshots after catalogue and pricing changes.
- HTTP fixtures use unique owned records and clean up only their own IDs. Existing seeded company/employee/settings are not mutated.

## Files changed for this repair

- `apps/api/src/catalogue/combinations/combination-validator.ts`
- `apps/api/src/catalogue/combinations/combination-validator.spec.ts`
- `apps/api/src/orders/domain/order-builder.ts`
- `apps/api/src/orders/orders.service.ts`
- `apps/api/test/order-combinations.e2e-spec.ts`
- `apps/web/app/orders/new/page.tsx`
- `apps/web/app/orders/[id]/page.tsx`
- `apps/web/components/orders/OrderCombinationEditor.tsx`
- `apps/web/lib/api/orders.ts`
- `apps/web/lib/order-combinations.ts`
- `apps/web/lib/order-combinations.test.mjs`
- `P0-1-REVIEW.md`

## Commands for the user

Run from `C:\Users\DELL\Desktop\fernleaf-kitchen`, with the existing test database and seeded accounts available. Run focused regressions first, then typecheck. These commands have not been executed by the agent.

```powershell
pnpm --filter api test src/catalogue/combinations/combination-validator.spec.ts src/orders/domain/order-builder.spec.ts src/orders/domain/order-pricer.spec.ts
pnpm --filter api exec tsx --test ../web/lib/order-combinations.test.mjs
pnpm --filter api test:e2e test/order-combinations.e2e-spec.ts test/orders.e2e-spec.ts
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
```

For preservation of P0-2, also run its existing regression:

```powershell
pnpm --filter api test src/orders/order-money.integration.spec.ts
```

Send the results back before proceeding to P0-3. Full-suite, Step-24 and Step-25 verification remains due after all P0 repairs.
