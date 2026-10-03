# Step 6–7 — Kitchen time, cutoff and settings + reference data & catalogue

Step 6 adds the time/cutoff core of the kitchen: a single injected clock, one
timezone-aware time helper, a pure cutoff calculator, and the admin-managed
settings that feed it. Step 7 adds the catalogue the kitchen actually sells —
dishes, options, option groups and reference data — plus the pure
`CombinationValidator` that the Orders step will call before persisting a line.

Neither step touches orders, pricing or menus.

## Architecture

```
src/kitchen/
  time/clock.ts                  Clock interface + SystemClock + FixedClock (CLOCK token)
  time/weekday.ts                Local Weekday tuple (no Prisma dependency)
  time/kitchen-time.ts           Timezone-aware date/time facade
  calendar/kitchen-calendar.service.ts  Kitchen working days + holidays
  cutoff/cutoff-calculator.ts    Pure function: inputs -> cutoff instant
  cutoff/cutoff.service.ts       Wires settings + calendar + clock to the calculator
  settings/                      Admin settings API (controller, service, DTOs)
  kitchen.errors.ts              Domain errors for this module
  kitchen.module.ts              @Global: time and cutoff are needed everywhere

src/catalogue/
  dishes/                        Dish CRUD + deactivation + option-group linking
  options/                       Option CRUD + deactivation
  option-groups/                 Option group CRUD + membership replacement
  reference/                     Read-only lookups for the admin UI
  combinations/                  Pure combination types, errors and validator
  catalogue.errors.ts
  catalogue.module.ts
```

`KitchenModule` is global because cutoff awareness is cross-cutting: orders,
dispatch and reporting all need the same `KitchenTime` and `CutoffService`
instances rather than their own copies. `CatalogueModule` exports
`CombinationValidator` and `DishService` so the future Orders module can reuse
them without duplicating catalogue reads.

## Time handling

Three rules drive `KitchenTime`:

1. **Business dates are evaluated in the application timezone** (`TIMEZONE`,
   `Asia/Kolkata`). The server's own timezone is never trusted, and the browser
   is never allowed to decide whether a cutoff has passed — the frontend only
   renders what the API computed.
2. **"Now" always comes from the injected `Clock`.** `SystemClock` is bound to
   the `CLOCK` token in production; tests bind `FixedClock`, which is what makes
   cutoff behaviour deterministic instead of calendar-dependent.
3. **Prisma `@db.Date` and `@db.Time(0)` values are UTC-anchored wrappers.**
   A date column stores `2026-10-07T00:00:00Z` to mean "the 7th", and a time
   column stores `1970-01-01T16:00:00Z` to mean "16:00 local". They are read and
   written only through `toDateString`/`fromDateString` and
   `toTimeString`/`fromTimeString`, so no code elsewhere has to remember this.

`combineDateAndTime('2026-10-05', '16:00')` is the bridge between the two
worlds: it returns the real instant (`2026-10-05T10:30:00Z` for IST) that can be
compared with `Clock.now()`.

## Cutoff algorithm

`calculateCutoff` is a pure function — no Prisma, no clock, no HTTP:

```
input: deliveryDate, cutoffWorkingDays, cutoffTime,
       kitchenWorkingDays, kitchenHolidays, timeZone

cursor := start of deliveryDate in timeZone
counted := 0
while counted < cutoffWorkingDays:
    cursor := cursor - 1 day
    if weekday(cursor) is a kitchen working day and cursor is not a kitchen holiday:
        counted := counted + 1
cutoffAt := cursor at cutoffTime, in timeZone
```

Decisions worth calling out:

- **Only kitchen working days are counted.** Company working days describe when
  a customer can *receive* food; they say nothing about when the kitchen must
  lock an order, so they are deliberately not consulted here.
- **Weekends and holidays are skipped, not counted.** Wednesday delivery with
  2 working days and a Mon–Fri kitchen gives Monday; if that Monday is a
  holiday, the walk continues to the previous Friday.
- **The cutoff time is set after the date walk**, in the application timezone,
  so a DST transition shifts the UTC instant but keeps the local wall-clock
  reading at (for example) 16:00.
- **A bounded loop.** A misconfigured calendar with no working days would
  otherwise loop forever, so after 400 scanned days the calculator raises
  `UnresolvableCutoffError` rather than hanging the request.

`CutoffService.resolve()` loads the stored config and the calendar, calls the
calculator, and adds `evaluatedAt` and `hasPassed` from the injected clock. That
is the only place the system decides whether a cutoff has lapsed.

## Settings API

A single `KitchenSettings` row holds the configuration. Its primary key is
pinned to `'singleton'` by a CHECK constraint, so a second configuration row
cannot exist even if something bypasses the service.

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/settings` | `settings.read` |
| PUT | `/api/settings` | `settings.manage` |
| GET | `/api/settings/cutoff-preview?deliveryDate=` | `settings.read` |
| GET | `/api/settings/holidays` | `settings.read` |
| POST | `/api/settings/holidays` | `settings.manage` |
| DELETE | `/api/settings/holidays/:id` | `settings.manage` |

Authorization uses the existing permission catalogue; there are no role-name
checks anywhere. Only cutoff time, cutoff working days, the kitchen working week
and kitchen holidays are configurable — no unrelated settings were invented.

Server-side validation (independent of the DTO decorators, because the service
is also callable from seeds and future jobs): at least one working day, no
duplicated weekday, `cutoffWorkingDays` within 0–14, and a real `HH:mm` time.
Updating settings replaces the configuration row and the working week inside one
`$transaction`, because a half-applied calendar would silently move every cutoff
in the system.

## Catalogue

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/dishes` (paginated, `active`, `search`) | `catalogue.view` |
| POST | `/api/dishes` | `catalogue.manage` |
| GET | `/api/dishes/:id` | `catalogue.view` |
| PATCH | `/api/dishes/:id` | `catalogue.manage` |
| PATCH | `/api/dishes/:id/active` | `catalogue.manage` |
| PUT | `/api/dishes/:id/option-groups` | `catalogue.manage` |
| GET/POST | `/api/options` | `catalogue.view` / `catalogue.manage` |
| GET/PATCH | `/api/options/:id`, `PATCH /api/options/:id/active` | `catalogue.view` / `catalogue.manage` |
| GET/POST | `/api/option-groups` | `catalogue.view` / `catalogue.manage` |
| GET/PATCH | `/api/option-groups/:id` | `catalogue.view` / `catalogue.manage` |
| PUT | `/api/option-groups/:id/options` | `catalogue.manage` |
| GET | `/api/reference/{allergens,dietary-tags,kitchen-stations,portion-sizes,packaging-types}` | `catalogue.view` |

Rules:

- **Nothing is hard-deleted.** Dishes and options are deactivated, because
  historical order lines keep foreign keys to them for traceability. There is no
  `DELETE` route in the catalogue.
- **Money stays in integer cents** (`costCents`) everywhere; no float arithmetic
  is performed on money in this step.
- **Multi-row writes are transactional.** Creating a dish with allergen and
  dietary-tag memberships, replacing a dish's option groups, and replacing a
  group's options each run inside one `$transaction` with a delete-then-insert
  so ordering stays coherent.
- **Reference data is read-only** over HTTP. Those rows are seeded; exposing
  writes would add a management surface the assignment does not ask for.
- A dish can override an option group's requiredness through
  `DishOptionGroup.required`; the API responses and the validator both resolve
  the override before the group default.

## CombinationValidator

`CombinationValidator` is a pure domain service. It takes plain shapes
(`CombinationDishDefinition`, `SelectedCombination`), not Prisma models, so it
can be unit-tested without a database and reused by the Orders step with data
loaded however that module prefers. `DishService.loadForValidation()` produces
those shapes from Prisma.

Checks, in order:

1. the dish is active;
2. every combination quantity is a positive integer;
3. the line quantity meets the dish's minimum order quantity (`Dish.moq`);
4. every selected group is actually offered by the dish;
5. every selected option belongs to that group, is not selected twice, and is
   still active;
6. the group's `maxSelections` is respected (null means unlimited);
7. every required group is satisfied in every combination;
8. no two combinations on the line share a signature;
9. the combination quantities sum **exactly** to the line quantity.

The signature is the selected option ids sorted and joined with `|`
(`no-options` when nothing is selected), so it is order-independent and stable —
that is what gets stored as `OrderCombination.signature` and what lets the
duplicate check be a simple set lookup.

Errors are actionable `ValidationDomainError` subclasses carrying a stable code
and structured details (for example `MAX_SELECTIONS_EXCEEDED` with the limit and
the number selected), so the frontend can point at the offending group rather
than showing a generic failure.

## Schema changes

- New `KitchenSettings` model (singleton cutoff configuration).
- New `OptionGroup.maxSelections Int?` (null = unlimited).
- New CHECK constraints in `prisma/sql/postgres_constraints.sql` section 2b:
  the settings singleton pin, the 0–14 range on `cutoffWorkingDays`, and
  `maxSelections > 0`.

A migration must be generated for these, and the raw-SQL constraints file
re-applied afterwards.

## Seed additions

`seedKitchenSettings` creates the singleton (16:00, 2 working days) and a Mon–Fri
working week; `seedReferenceData` upserts allergens, dietary tags, kitchen
stations, portion sizes and packaging types. Both are idempotent, and the
settings upsert uses an empty `update`, so re-seeding never overwrites a change
an admin made through the API.

The two new permission keys (`settings.read`, `settings.manage`) are granted to
Admin through the existing `ALL_PERMISSIONS` list, so re-running the seed is what
makes them effective.

## Tests

- `cutoff-calculator.spec.ts` — Wednesday → Monday, weekend walk, holiday chains,
  a Friday holiday, zero working days, a year boundary, a DST transition, and
  the timezone anchoring (16:00 IST = 10:30 UTC regardless of the server zone).
- `kitchen-time.spec.ts` — `today()` in the application timezone, `@db.Date` and
  `@db.Time` round-trips, `combineDateAndTime`, clock comparison, bad input.
- `settings.service.spec.ts` — validation failures, transactional update,
  duplicate holiday conflict, missing holiday, uninitialised settings.
- `combination-validator.spec.ts` — all ten mandated cases plus signature
  order-independence and unlimited `maxSelections`.
- `test/settings.e2e-spec.ts` and `test/catalogue.e2e-spec.ts` — the HTTP
  surface, including 401 for anonymous callers and 403 for a user who lacks the
  permission.
