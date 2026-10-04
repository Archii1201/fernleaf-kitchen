# P0-8 verification report — incomplete

Verification stopped at the first failing focused database run, as requested. No repair was made after that failure. P0-8 is not complete; no P1 work started.

## Seed/bootstrap audit and implementation

The repository-root command is `pnpm --filter api db:seed`, which executes `apps/api/prisma/seed.ts` through tsx. Prisma's configured migrations seed uses the same entry point. `main` calls `seedIfNeeded`, which calls `seedAll` for an empty database or an explicitly forced seed.

Previously `seedAll` omitted the exported rich generator, startup's empty-database seed call was commented out, maintenance used permanent ownership keys that did not roll over, and demo Drops were manually created with times that could differ from their Orders.

The staged implementation invokes basic, rich and daily demo stages from one transactional `seedAll`; restores empty-database startup seeding without automatic forcing; and shares a date-owned daily helper between seed and maintenance. Relative dates use KitchenTime and the application timezone. Maintenance appends a today/future pair, preserves one historical example and existing reviewer workflow, and uses distinct delivery slots to avoid joining departed Drops after rollover.

New order scenarios use production OrderBuilder, pricing/menu/delivery/cutoff validation, kitchen start/done, and dispatch ready/assign/out/deliver services. Historical scenarios use a local booking clock before cutoff. Confirmation applies only to a newly created seed-owned Order after its resolved cutoff, rather than processing all reviewer orders on that date. Newly created sample companies receive seven days a week; existing company calendars and the production kitchen calendar remain unchanged. The P0-7 invoiced financial repair guard remains unchanged.

## Changed files

- `README.md`
- `apps/api/prisma/seed.ts`, tracked `seed.js` and `seed.d.ts`
- `apps/api/prisma/seed-demo.ts`, tracked `seed-demo.js` and `seed-demo.d.ts`
- New `apps/api/prisma/seed-runtime.ts`
- `apps/api/src/demo/demo-scheduler.ts`
- `apps/api/src/demo/demo-maintenance.service.ts` and its unit spec
- New `apps/api/test/demo-seed.fixture.ts`
- New `apps/api/test/demo-seed-rollover.e2e-spec.ts`
- `apps/api/test/seed-financial-consistency.e2e-spec.ts`: isolated rich/review natural keys in its existing rollback-only fixture; retained financial assertions

## Verification results, in requested order

1. `pnpm --filter api exec tsc --noEmit` — PASS.
2. `pnpm --filter api test src/demo src/billing src/dashboard` — PASS, 17 tests across 6 files.
3. `pnpm --filter api test:e2e test/seed.e2e-spec.ts test/billing.e2e-spec.ts test/dashboard.e2e-spec.ts` — PASS, 8 tests across 3 files. Existing account seed checks passed for the required `admin@test.com`, `kitchen@test.com`, `dispatch@test.com`, and `driver@test.com` accounts, with password `Test@1234`.
4. `pnpm --filter api test:e2e test/demo-seed-rollover.e2e-spec.ts test/seed-financial-consistency.e2e-spec.ts` — FAIL during `beforeAll` setup in both suites; 16 assertions/tests skipped.

Failing suites:

- `P0-8 normal seed and date rollover (real PostgreSQL)`
- `P0-7 seeded financial consistency (real PostgreSQL)`

Exact error: `Failed to deserialize column of type 'void'` from `prisma.$queryRaw()` at `apps/api/prisma/seed.js:718`, corresponding to the new advisory-lock statement in `seed.ts`.

Root cause: PostgreSQL `pg_advisory_xact_lock` returns `void`; `$queryRaw` attempts to deserialize that returned column. The new lock calls in `seed-runtime.ts` use the same incompatible API and would also need correction.

Smallest proposed fix: replace these three advisory-lock `$queryRaw` calls with `$executeRaw`, preserving the SQL and transaction boundaries, then regenerate/synchronize the tracked `seed.js` counterpart. No schema or business-policy change is needed. This fix has NOT been applied because verification was required to stop on failure.

The focused fixtures use isolated rollback-only PostgreSQL transactions. Setup failure rolls them back. A forced seed was not run against live reviewer history.

## Completion status

The existing reviewer account regressions passed. The new full-seed account creation checks, rich-data invocation, today's authenticated driver visibility, seed idempotency, rollover, and financial consistency remain unverified because setup failed before those assertions. No production business rule, schema, RBAC, frontend or invoiced-order editing policy was changed. P0-8 is INCOMPLETE pending the minimal query API correction and green verification.
