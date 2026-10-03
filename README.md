# Fernleaf Kitchen

Full-stack corporate meal operations admin panel.

## Stack

- Next.js
- NestJS
- Prisma
- PostgreSQL
- TypeScript

## Architecture

The application uses a modular monolith architecture.

Frontend:
Next.js

Backend:
NestJS

Database:
PostgreSQL through Prisma

The domain data model lives in `apps/api/prisma/schema.prisma` and is explained in
`docs/explanation/step3.md`. Constraints that Prisma cannot express are kept in
`apps/api/prisma/sql/postgres_constraints.sql`.

## Project Structure

```text
apps/
  api/       NestJS backend
  web/       Next.js frontend

packages/
  shared/    Shared types/contracts

prisma/      Prisma configuration/schema


scripts/     Development and deployment scripts

docs/
  explanation/   Step-by-step design notes

## Dashboard Definitions

Timezone for every date bucket is the application timezone (`TIMEZONE`, Asia/Kolkata) via `KitchenTime`. `today` is that calendar date. Null sums count as `0`. Cancelled and rejected orders are excluded from operational counts and meal sums unless a metric says otherwise.

### Admin `GET /api/dashboard/admin` (`reports.view`)

| Metric | Calculation | Include | Exclude | Zero / null |
| --- | --- | --- | --- | --- |
| Today's orders | `count(Order)` where `deliveryDate = today` | All statuses except cancelled/rejected | `CANCELLED`, `REJECTED` | `0` |
| Today's meals | `sum(OrderLine.quantity)` for those orders | Same | Same | `0` if no lines |
| Kitchen progress | Prep units on today's operational orders (`CONFIRMED`…`DELIVERED`); `% = completed READY / total` | Operational pipeline | Draft/placed/cancelled/rejected | `% = 0` when total is 0 |
| Next cutoff | First `CutoffService.resolve(date)` in today…+10 days with `hasPassed = false` | Kitchen calendar/settings | Does not run processing | `null` if none |
| Pending cutoff processing | Dates in today−7…today whose cutoff has passed and no `CutoffRun` `COMPLETED` | Past due dates | Future cutoffs | `[]` |
| Next 7 days | Orders + meal qty grouped by delivery date today…+6 | Same as today's orders | Cancelled/rejected | `0` per day |
| Uninvoiced balance | `sum(Order.totalCents)` where `invoiceId` is null and status is billable (`CONFIRMED`…`DELIVERED`) | Integer cents | Draft/placed/cancelled/rejected/invoiced | `0` |
| Outstanding invoices | `count` + `sum(totalCents)` of invoices `ISSUED` | Unpaid issued | `VOID`, `PAID`, `DRAFT` | `0` |
| Setup gaps | Missing default tier, kitchen settings, company address/tier, active dishes not on a menu | Domain-required gaps only | Invented extras | `[]` |

Admin responses include money in integer cents.

### Kitchen `GET /api/dashboard/kitchen` (`kitchen.view`)

Uses the kitchen board for today/tomorrow. No money, invoices, or billing.

| Metric | Calculation |
| --- | --- |
| Units today | Prep units on today's confirmed-pipeline board |
| Units by station | Group by `PrepUnit.kitchenStationCode`; empty code → Unassigned |
| Late | `kitchenTimingState` = `LATE` (now after planned `kitchenReadyAt`) and unit not `READY` |
| At-risk | Planned ready within 15 minutes (`AT_RISK_WINDOW_MINUTES`) and not done |
| Next deadline | Earliest future `kitchenReadyAt` among unfinished units; `null` if none |
| Prep list | Today's board units by station/deadline |
| Tomorrow preview | Same board for tomorrow: unit count + station groups |

Cancelled/rejected orders never appear on the board.

### Dispatch `GET /api/dashboard/dispatch` (`dispatch.view`)

Today's drops only. No billing money.

| Metric | Calculation |
| --- | --- |
| Drops by status | Count today's drops per `Drop.status` |
| Needs driver | Open drops (`not DELIVERED/CANCELLED`) with no `driverStaffId` |
| Leaving soon | Not out/delivered, `dispatchReadyAt` in the next 30 minutes |
| Late | Not out/delivered, now after `dispatchReadyAt` |
| Driver load | Count by assigned driver; missing driver → Unassigned |
| On-time rate | `onTime === true` delivered / delivered today × 100, rounded. **`null` when no deliveries** (not 0%) |

### Driver `GET /api/dashboard/driver` (`driver.view`)

Scoped to the authenticated staff row (`Staff.userId`). No other drivers, no money, no invoices.

| Metric | Calculation |
| --- | --- |
| Next drop | Earliest today assigned drop not delivered/cancelled |
| Assigned / delivered / remaining | Today's drops for that driver |
| % delivered | delivered / assigned × 100; **0 if assigned is 0** |
| On-time count | Today's delivered drops with `onTime = true` |

## Demo Seed

Required accounts (password `Test@1234`): `admin@test.com`, `kitchen@test.com`, `dispatch@test.com`, `driver@test.com`.

Seed also upserts 5+ companies, 25+ dishes (SKU, description, temperature, integer cost, stations, allergens/tags, option groups, secret menu category), 3 price tiers, historical/today/future orders, prep units, today's driver drop, and ISSUED/PAID/VOID invoices.

- If the database has **no users**, startup and `pnpm db:seed` load the demo.
- If the database **already has users**, seed does nothing.
- `FORCE_SEED=true` upserts demo rows again. It does **not** delete reviewer-created rows. The API never sets `FORCE_SEED` by itself. A normal restart does not wipe data.

Demo-owned rows are keyed in `DemoOwnedRecord`.

## Demo Maintenance

`DemoMaintenanceService` runs on API startup (skipped in tests) and is scheduled for **00:15 Asia/Kolkata** using `KitchenTime`, not the host TZ.

It creates only missing demo keys (`demo:order:today:…`, tomorrow, today's driver drop) through `OrdersService` / existing drop identity. If cutoff has passed, today's order is created for a later legal date or skipped. Existing reviewer data is never deleted or overwritten. Duplicates are prevented by `DemoOwnedRecord.key`.
