# Step 8 — Pricing engine

Step 8 answers one question for every dish and option: *what does this cost the
customer on this tier?* The answer is either a whole number of cents or
`MISSING`. There is no third case, and in particular there is no zero.

Companies, menus, orders and invoices are explicitly out of scope; the resolver
is shaped so those steps can consume it without change.

## Domain

```
src/pricing/
  domain/
    money.ts                     Money value object + the one rounding routine
    pricing.types.ts             Plain shapes: tiers, items, resolutions
    pricing-context.ts           PricingContext: the loaded-once world
    pricing-resolver.ts          PricingResolver: context + item -> price
    tier-chain.ts                Chain validation (self, cycle, depth)
    tier-selection.ts            Company tier vs default tier
    strategies/
      price-derivation-strategy.ts   The interface
      explicit-price.strategy.ts     Manual prices
      cost-multiplier.strategy.ts    cost x 2.4
      base-tier-percentage.strategy.ts  Standard + 15%
  pricing-context.loader.ts      Prisma -> PricingContext (fixed query count)
  price-tier.service.ts          Tier CRUD, rules, make-default
  tier-price-grid.service.ts     Grid read + bulk override write
  price-tier.controller.ts       HTTP only; no pricing logic
  pricing.errors.ts
  pricing.module.ts
```

The flow is the one the brief asks for:

```
PricingContext  ->  PricingResolver  ->  effective price | MISSING
```

Controllers contain no arithmetic. They validate a DTO, call a service, and
return what it produced.

## Strategy pattern

`PriceDerivationStrategy` has a single method, `derive(input)`, and three
implementations:

| Strategy | Rule | Inputs |
| --- | --- | --- |
| `ExplicitPriceStrategy` | manual prices only | none |
| `CostMultiplierStrategy` | `cost x multiplier` | `markupBasisPoints` (24000 = x2.4) |
| `BaseTierPercentageStrategy` | `base tier price + percentage` | `markupBasisPoints` (1500 = +15%) and `baseTierId` |

A strategy never queries anything. The resolver hands it the tier, the item and
(for derived tiers) the price already resolved on the base tier. Adding a
fourth pricing rule is a new class plus one line in the module, not a new
branch in a service — which is the reason for the pattern here rather than a
`switch`.

`ExplicitPriceStrategy.derive()` returning `MISSING` rather than throwing is
deliberate: "this tier prices manually and nobody typed a number" is an
ordinary business state, not an error.

## PricingContext and the resolver

`PricingContext` holds every tier definition, the chain for the target tier,
and every explicit price row on that chain, all in maps. `PricingResolver`
reads nothing else. For one item on one tier it:

1. returns the explicit price row for that tier if there is one — **an
   override always wins over a derived price**;
2. otherwise asks the tier's strategy to derive one, recursing into the base
   tier first when the strategy needs a base price;
3. otherwise reports `MISSING`.

Because the context is already in memory, resolving the 300th row of a grid
costs the same as resolving the first.

## Tier resolution

`selectEffectiveTierId(companyTierId, defaultTierId)` is the whole rule: the
company's tier when it has one, the default tier otherwise, and a loud
`DEFAULT_PRICE_TIER_MISSING` error when neither exists. It is a pure function
so the future Menu and Orders modules apply identical precedence rather than
re-deriving it.

## Integer arithmetic and the 5-cent rounding

Money is never a float. Prices are integer cents; multipliers and percentages
are basis points (`10000` = 100%). `Money` refuses fractional, negative and
unsafe-integer amounts at construction, so an invalid price cannot travel.

There is exactly one rounding routine, `roundUpRational(numerator,
denominator)` in `money.ts`:

```
steps  = trunc(numerator / (denominator * 5)) + (numerator % (denominator * 5) == 0 ? 0 : 1)
result = steps * 5
```

The point is that the unrounded value is never materialised. `$0.88 x 2.4` is
computed as `88 * 24000 = 2_112_000` over a denominator of `10000`, and the
ceiling is taken with an integer remainder — so `211.2` never exists as a
float, and the result is `215` cents. Likewise `Standard + 15%` on `$8.99`
scales `899` by `11500/10000` and yields `1035`. A value that is already a
multiple of 5 passes through untouched.

Rounding is applied once, at the point a price is derived. A chained tier
rounds at each hop, which is intentional: each tier's published price must
itself be a round number, and the next tier derives from that published price,
not from a hidden unrounded one.

## Tier chains, cycles and depth

A tier may derive from another (`Partner -> Standard`). `validateTierChain()`
runs before every tier write and rejects:

- **self-reference** — `TIER_SELF_REFERENCE`;
- **cycles** — `TIER_DERIVATION_CYCLE`, with the offending chain in `details`;
- **chains deeper than 5 hops** — `TIER_DERIVATION_TOO_DEEP`;
- **a base tier that does not exist** — `BASE_TIER_NOT_FOUND`.

Validating on write means read-time resolution never has to defend against a
malformed chain. The resolver still carries a depth guard that degrades to
`MISSING` rather than recursing forever, because a chain edited concurrently
with a long-running read is cheap to defend against and expensive to debug.

Two of these rules are also enforced in PostgreSQL (`PriceTier_baseTier_not_self`
and `PriceTier_strategy_inputs`, in `prisma/sql/postgres_constraints.sql`). A
CHECK constraint cannot walk a chain, so cycles and depth stay in the domain.

## Missing prices

A missing price is a typed result, not a null or a zero:

```ts
{ status: 'MISSING', reason: 'NO_EXPLICIT_PRICE' | 'MISSING_BASE_PRICE' | 'DERIVATION_TOO_DEEP',
  missingAtTierId: '...' }
```

`MISSING` propagates: a derived tier whose base has no price for an item has no
price either. The grid surfaces this as `effectivePriceCents: null`,
`missing: true` and a reason — never `0`, never a blank that a client might
coerce.

The consumer rule, which the Menu step will implement on top of this: **a dish
with no effective price on the employee's tier must not appear in the menu**,
and an option with no effective price is unavailable. The resolver deliberately
exposes enough (`status`, `reason`, `resolvedFromTierId`) for a `MenuResolver`
to filter without re-deriving anything.

## API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/price-tiers` | `pricing.view` |
| POST | `/api/price-tiers` | `pricing.manage` |
| GET | `/api/price-tiers/:id` | `pricing.view` |
| PATCH | `/api/price-tiers/:id` | `pricing.manage` |
| POST | `/api/price-tiers/:id/make-default` | `pricing.manage` |
| GET | `/api/price-tiers/:id/prices?type=&missingOnly=&q=&page=&limit=` | `pricing.view` |
| PUT | `/api/price-tiers/:id/prices` | `pricing.manage` |

Authorization is permission-based as everywhere else; there are no role-name
checks. `pricing.view` is new and is granted to Kitchen as well as Admin, so
kitchen staff can read the grid they cook against without being able to change
a price.

### The grid

Each row carries everything the operator needs to understand the number:

```json
{
  "itemType": "dish", "itemId": "...", "reference": "FK-CURRY-001",
  "name": "Paneer Butter Curry", "costCents": 880,
  "derivedPriceCents": 2115, "overrideCents": null,
  "effectivePriceCents": 2115, "source": "DERIVED",
  "missing": false, "missingReason": null, "resolvedFromTierId": "..."
}
```

`derivedPriceCents` is what the tier rule produces *ignoring* any override, so
the UI can show what "reset" would restore.

### Bulk editing

`PUT /price-tiers/:id/prices` takes a list of `{ itemType, itemId, priceCents }`.
`priceCents: null` **deletes** the override row, returning the item to its
derived price — clearing is a delete, not a zero, which is the same distinction
the resolver makes.

## Performance

The grid performs a fixed three queries regardless of row count: the tier table
(a handful of rows, walked in memory), the explicit prices on the tier chain,
and the catalogue items matching the search. No query happens per dish or per
option.

`missingOnly` is applied after resolution and the page is sliced in memory,
because "missing" is a property of the derivation chain and has no SQL
equivalent. That is a conscious trade: the catalogue is hundreds of rows, and
the alternative — materialising derived prices into a table and keeping it in
sync with every cost, tier and override change — is a cache-invalidation
problem this assignment does not need. If the catalogue grew by an order of
magnitude, that materialised table (refreshed on tier/cost writes) is the
intended next step.

## Concurrency and transactions

- **`make-default`** clears the current default and sets the new one inside one
  `$transaction`. The partial unique index `PriceTier_one_default_key` permits
  only one `isDefault = true` row, so doing it in two statements outside a
  transaction could either fail outright or leave a window with zero defaults —
  during which every company without its own tier would be unpriced.
- **Bulk price saves** are one transaction for the whole batch. A half-applied
  grid is worse than a rejected save, because the operator cannot tell which
  half landed.
- **Tier edits** validate the chain against a snapshot of the tier table before
  writing. Two admins restructuring tiers simultaneously is rare enough that
  optimistic validation plus the database's own self-reference CHECK is the
  right weight here; the resolver's depth guard covers the residue.

## Schema and constraints

- `PriceTier.baseTierId` (self-relation, `onDelete: Restrict`) plus an index.
- `PriceTier_baseTier_not_self` and `PriceTier_strategy_inputs` CHECKs.
- All pre-existing constraints, including the non-negative money CHECKs on
  `DishTierPrice` and `OptionTierPrice` and the one-default partial unique
  index, are untouched.

## Seed

`seedCatalogueSamples` adds four dishes and two options; `seedPricing` adds the
three tiers — Standard (default, manual), Enterprise (`cost x 2.4`) and Partner
(`Standard + 15%`) — with explicit Standard prices, one Partner override, and
`FK-SPECIAL-001` deliberately left unpriced on Standard so the missing-price
path is real in every environment. Both are idempotent: tiers upsert on `code`
and prices on their composite unique key, and the Standard upsert never rewrites
`isDefault` or the strategy, so re-seeding cannot undo an admin's change.

## Tests

Unit (`src/pricing/**/*.spec.ts`):

- `money.spec.ts` — fractional/negative rejection, round-up-to-5, exact
  multiples, `$0.88 x 2.4 = $2.15`, `+15% on $8.99 = $10.35`.
- `pricing-resolver.spec.ts` — company tier used when present, default used
  when absent, override beats derived, clearing an override restores derived,
  cost multiplier, base + percentage, chained tiers, option pricing, MISSING on
  an unpriced explicit tier, MISSING propagated from a base tier, missing never
  rendered as zero, over-deep chain degrades to MISSING, 500 rows resolved from
  one context, and chain validation (self-reference, cycle, depth).
- `price-tier.service.spec.ts` — rule descriptions, duplicate code, invalid
  strategy inputs, cycle rejection on edit, default tier protected from
  deactivation, make-default transactional, exactly one default, tier selection.
- `tier-price-grid.service.spec.ts` — fixed query count for 300 rows, row
  shape, `missingOnly`, transactional bulk set/clear, unknown item rejected.

E2E (`test/pricing.e2e-spec.ts`): 401 anonymous, 403 for a user with no pricing
permission, a catalogue viewer who can read but not manage, tier CRUD,
make-default keeping exactly one default, the grid, `missingOnly`, search and
pagination, bulk overrides, clearing back to derived, and the validation
failures (negative, fractional, unknown item, cycle, self-reference, missing
base).

## Trade-offs

- **Rounding at every hop of a chain** rather than once at the end. Each tier's
  price is a real published price, so compounding rounded values is the
  faithful behaviour; it does mean `Standard + 15% + 10%` is not identical to
  `Standard + 26.5%`.
- **In-memory `missingOnly` and paging** (see Performance) instead of a
  materialised price table.
- **No `DELETE /price-tiers/:id`.** Tiers are referenced by companies and by
  historical orders, so removal would break traceability; the default tier is
  additionally protected from deactivation. Tiers are retired with
  `active: false` instead.
- **`isDefault` is not settable through create or update.** Routing every
  change through `make-default` means the "exactly one default" switch has
  exactly one implementation, which is the transactional one.
