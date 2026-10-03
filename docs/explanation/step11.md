# Step 11 — Order Creation Architecture

Staff on the admin panel build an order the same way the kitchen will later
cook it: one employee, one delivery slot, dishes the MenuResolver already
said were available, combos the CombinationValidator accepted, prices the
PricingResolver already computed. Nothing in this step invents a second
copy of those rules.

```
Employee → DeliveryResolver → MenuResolver → CombinationValidator
        → OrderPricer → CutoffPolicy → OrderBuilder → OrderRepository
        → Order + lines + combos + options + prep units + event
```

## Why OrderBuilder exists

An order is an *aggregate* of six domains that already have owners. The
builder is the conductor: it loads context once, asks each owner a question,
and assembles a `BuiltOrder` in memory. Persistence is a separate step, so
`POST /orders/quote` and `POST /orders` share the same build.

Controllers authenticate, check `orders.*` permissions, and validate DTO
shape. They do not know what a secret category is.

## Reused services

| Owner | Question the builder asks |
| --- | --- |
| MenuResolver / MenuContextLoader | Is this dish on *this* company's menu, at a real price? |
| CombinationValidator | Are the option picks legal, and do quantities add up? |
| PricingResolver via OrderPricer | Integer cents for the dish and each option. |
| DeliveryResolver | Address, time, packaging, leave-kitchen minutes. |
| CutoffPolicy → CutoffService | Has the *kitchen* cutoff for that delivery date passed? |
| KitchenTime / Clock | Dates and "now". Never the company week for cutoff. |

A missing price is still `MISSING`, never `0`. Hidden/inactive/unpriced
dishes throw `DISH_NOT_ORDERABLE` — the same error preview uses.

## DeliveryResolver

Company calendar answers "can they *receive* today?"

- employee must be active and belong to that company
- address must be the company's (or the default, if they cannot choose)
- delivery time / packaging follow the same permission flags
- company holidays and non-working weekdays reject the date
- `leaveKitchenMinutes` is copied from the company *now* and stored on the
  order; later company edits do not rewrite history

Kitchen holidays are irrelevant here. They belong to CutoffPolicy.

## OrderPricer

```
combo unit  = dish cents + Σ option cents
combo total = unit × combo qty
line total  = Σ combo totals
order total = Σ line totals
```

All integers. The price tier id and name are snapshotted on the order.

## Snapshots and prep units

Catalogue rows will change. The order must not. Every write copies names,
SKU, station, address lines, packaging name, and every price.

Each `OrderCombination` creates exactly one `PrepUnit` in the same
transaction (`orderCombinationId` is unique, so a retry cannot double-cook).

## State machine

```
DRAFT  → PLACED | CANCELLED
PLACED → CONFIRMED | CANCELLED | REJECTED
CONFIRMED → DELIVERED
```

`assertTransition` throws `INVALID_ORDER_TRANSITION` for anything else,
including DRAFT→CONFIRMED and DELIVERED→CANCELLED. Kitchen statuses exist
on the enum but are not entered in this step.

## CutoffPolicy

Delegates to the existing cutoff calculator. Company working days are not
consulted. After cutoff, create / place / `PUT /orders/:id` fail with
`ORDER_CUTOFF_PASSED`. Quote still returns `cutoff.hasPassed` so the UI
can explain itself.

## Concurrency

Two different tools, two jobs:

1. **`SELECT … FOR UPDATE`** on the order row — serialize writers. Two
   staff cannot apply line diffs at once.
2. **`order.version`** — detect a stale browser. The client sends the
   version it loaded; if it does not match after the lock, we throw
   `ORDER_VERSION_CONFLICT` and do not write.

Version is not a lock. The lock is the row lock.

## Line diff (`PUT /orders/:id/lines`)

Combinations are keyed by `dishId::signature`.

| Diff | Prep PENDING | Prep started / done |
| --- | --- | --- |
| UNCHANGED | keep the row | keep the row |
| NEW | create combo + prep unit | — |
| CHANGED | update qty / totals | `PREP_UNIT_LOCKED` |
| REMOVED | delete combo + prep unit | `PREP_UNIT_LOCKED` |

We do not delete-and-recreate the kitchen's work.

## Transactions

Create is one interactive transaction: number → order → lines → combos →
options → prep units → `DRAFT` event. A failure anywhere rolls back.

Line apply is one transaction: lock → version check → diff writes →
recalculate → `version++`.

## Interview talking points

- Preview and orders cannot disagree because they share MenuResolver.
- Money is integer cents; a missing price aborts the order.
- Company calendar ≠ kitchen cutoff calendar.
- Snapshots exist so reprints survive catalogue edits.
- Prep units are 1:1 with combinations and unique.
- Pessimistic lock for races, optimistic version for stale tabs.

## Intentionally deferred

Admin cutoff overrides, kitchen status transitions, drops, invoices,
notifications, customer-facing checkout, tax and delivery fees.
