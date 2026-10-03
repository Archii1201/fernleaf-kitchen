# Step 3 — Complete Prisma Database Model

## 1. Why the database is designed before business workflows

Every later step — pricing, cutoff, kitchen routing, dispatch, billing — reads and writes the same rows. The shape of those rows decides what the services can and cannot do:

- **Mistakes are expensive later.** Renaming a service method is a refactor; changing a column that already holds six months of orders is a migration, a backfill and a correctness risk. Modelling first means the expensive decisions are made while they are still cheap.
- **The database is the last line of defence.** Service code is one path to the data; migrations, scripts, admin fixes and future bugs are others. A foreign key or a `CHECK` constraint holds for all of them, so invariants that live in the schema cannot be bypassed.
- **It forces the domain to be understood.** Writing the schema surfaces the real questions early: is a combination a row or a computed thing? Is a company employee the same as a staff login? Does an order keep its own copy of the dish name? Answering those now means the service layer is mostly mechanical.
- **It makes the workflows obvious.** Once `Order → OrderLine → OrderCombination → PrepUnit` exists, the kitchen service has an obvious job. If the model were wrong, the service would spend its code compensating.

Step 3 deliberately contains **no business logic**: no services, no calculators, no validators. Only tables, relationships, constraints and indexes.

## 2. Architecture overview

```
Next.js (apps/web)
  |  HTTP (/api)
  v
NestJS controllers (apps/api)
  |
  v
Services (business logic - later steps)
  |
  v
PrismaService  (injectable PrismaClient, Step 1/2)
  |
  v
PrismaPg driver adapter -> pg
  |
  v
PostgreSQL (database: fernleaf)
```

Step 2 built the HTTP foundation (configuration, validation, errors, request ids, logging, pagination, Swagger). Step 3 builds the **persistence foundation** underneath it: the complete set of tables the services in Steps 4+ will use. Nothing in the API surface changes in this step.

## 3. Domain areas

| Area | Models | What it covers |
| --- | --- | --- |
| Authentication | `User`, `Role`, `Permission`, `RolePermission` | Internal login identity and data-driven permissions. |
| Staff | `Staff` | Operational identity of internal people (chefs, drivers, admins). |
| Reference data | `Allergen`, `DietaryTag`, `KitchenStation`, `PackagingType`, `PortionSize` | Admin-managed lists reused across the catalogue. |
| Catalogue | `Dish`, `Option`, `OptionGroup`, `OptionGroupOption`, `DishOptionGroup`, and the allergen/dietary join tables | What can be sold and how it can be customised. |
| Pricing | `PriceTier`, `DishTierPrice`, `OptionTierPrice` | Named price lists per company, in integer cents. |
| Companies | `Company`, `CompanyDomain`, `CompanyAddress`, `CompanyHoliday`, `CompanyWorkingDay` | Customer organisations, their email domains, addresses and receiving calendar. |
| Kitchen calendar | `KitchenWorkingDay`, `KitchenHoliday` | When the kitchen itself operates — separate from the company calendar. |
| Customer employees | `CustomerEmployee`, `CustomerEmployeeAllergen`, `CustomerEmployeeDietaryTag` | People inside a customer company who order food. |
| Menu | `MenuCategory`, `MenuCategoryDish`, `CompanyHiddenCategory`, `CompanyHiddenDish` | Ordered menu structure plus per-company hiding. |
| Orders | `Order`, `OrderLine`, `OrderCombination`, `CombinationOption`, `OrderEvent` | What was ordered, at what price, with which options, and its timeline. |
| Kitchen | `PrepUnit` | The physical units the kitchen prepares, with a station snapshot. |
| Delivery | `Drop`, `DropOrder` | Grouping of orders into delivery drops. |
| Billing | `Invoice`, `InvoiceLine`, `OrderCredit` | What a company owes and the credits offset against it. |
| Files | `DbFile` | Dish images and delivery photos. |
| Cutoff | `CutoffRun` | One idempotent execution of cutoff processing. |

## 4. Entity-by-entity explanation

### Authentication and staff

| Entity | Purpose and key points |
| --- | --- |
| `User` | Internal login: `email` (unique), `passwordHash`, `roleId`, `active`, timestamps. Exactly one role per user (`roleId` is a required scalar). `onDelete: Restrict` on the role so a role in use cannot be deleted. |
| `Staff` | Operational identity: `staffCode` (unique), `fullName`, `phone`, `jobTitle`, `active`. `userId` is optional and unique, so a driver can exist without a login and a login maps to at most one staff profile. Drivers on `Order` and `Drop` reference `Staff`, not `User`. |
| `Role` | `name` unique, description, timestamps. Roles are rows, so new roles need no deployment. |
| `Permission` | `key` unique (for example `order.confirm`). Code checks a key; the key's existence is data. |
| `RolePermission` | Join table with `@@unique([roleId, permissionId])` so a pair cannot be granted twice. Cascades from both sides — it carries no history. |

### Reference data

`Allergen`, `DietaryTag`, `KitchenStation`, `PackagingType`, `PortionSize` all follow the same shape: `id`, `code` (unique, stable machine identifier), `name` (unique, human label), `active`, timestamps; `KitchenStation` and `PortionSize` also carry `sortOrder` for display. They are tables rather than enums because the assignment treats them as admin-managed data — adding "Sesame" as an allergen must not require a migration and a deploy.

### Catalogue

| Entity | Purpose and key points |
| --- | --- |
| `Dish` | `sku` unique, `name`, `description`, `temperature` (enum), `costCents`, `kitchenStationId`, optional `portionSizeId`, optional `imageFileId`, optional `moq`, `active`. `active` is the lifecycle: a dish is deactivated, never deleted, so historical order lines keep a valid foreign key. Indexes on `active`, `kitchenStationId` and `name`. |
| `DishAllergen` / `DishDietaryTag` | Many-to-many membership with a unique pair and an index on the reference side (so "which dishes contain peanuts" is cheap). |
| `Option` | Reusable add-on: `code` unique, `name`, `costCents`, optional portion size, `active`. |
| `OptionAllergen` / `OptionDietaryTag` | Same pattern as dishes — an add-on can introduce an allergen the dish does not have. |
| `OptionGroup` | Reusable group ("Spice level"): `code`/`name` unique, `required`, `displayOrder`, `active`. |
| `OptionGroupOption` | Which options belong to a group, with `displayOrder` and `@@unique([optionGroupId, optionId])` to prevent duplicate membership. |
| `DishOptionGroup` | Which groups apply to **which dish**, with `displayOrder` and an optional `required` override. Option groups are reusable but not globally applicable, so this link is explicit rather than assumed. |

### Pricing, companies, employees, menu, orders, kitchen, delivery, billing, files, cutoff

These are covered in detail in sections 8–17 below, so they are not duplicated here.

## 5. Authentication model

```
User ──> Role ──> RolePermission ──> Permission
```

A user has exactly one role; a role has many permissions through `RolePermission`; a permission is identified by a stable `key`.

**Why data-driven rather than an enum of roles?** The assignment expects roles and permissions to be administered, and a hardcoded `enum Role { ADMIN, CHEF, DRIVER }` has three problems: adding a role requires a code change and a deploy; the mapping from role to capability ends up as `if (role === ADMIN)` scattered through services; and a customer-specific tweak ("drivers may also confirm orders") cannot be expressed at all. With rows, the service layer in a later step asks one question — "does this user's role grant `order.confirm`?" — and the answer is configuration.

Step 3 only models these tables. No JWT, no hashing, no guards.

## 6. Staff vs customer employees

They are different kinds of people and merging them would be a real design bug.

| | `User` + `Staff` | `CustomerEmployee` |
| --- | --- | --- |
| Who | Internal Fernleaf people | People employed by a customer company |
| Belongs to | The kitchen (no company) | Exactly one `Company` (required FK) |
| Authenticates | Yes, via `User` (role + permissions) | Not in this step; has no password or role |
| Capabilities | Driven by `Role`/`Permission` | Three per-person flags: `canChooseAddress`, `canChooseDeliveryTime`, `canChoosePackaging` |
| Appears on an order as | `driverStaffId` | `customerEmployeeId` (the orderer) |
| Dietary data | Not relevant | `allergyNotes`/`dietaryNotes` plus structured allergen/dietary links |

If they shared one table, every row would need a nullable `companyId`, a nullable `roleId` and a discriminator, every query would need to remember which kind it is dealing with, and a bug could give a customer a staff permission. Two tables make the difference structural: a `CustomerEmployee` simply has no way to hold a role.

## 7. Catalogue model

```
KitchenStation ──< Dish >── PortionSize
                    │ │
        DishAllergen│ │DishDietaryTag
                    v v
               Allergen / DietaryTag

Dish ──< DishOptionGroup >── OptionGroup ──< OptionGroupOption >── Option
```

- **`Dish`** is the sellable item. Its `kitchenStation` says where it is prepared *today*; orders keep their own copy (section 12).
- **`Option`** is a reusable choice, priced on its own (`costCents` internally, `OptionTierPrice` for customers).
- **`OptionGroup`** groups options and decides whether a choice is mandatory.
- **`OptionGroupOption`** is group membership with ordering; the unique pair stops an option appearing twice in one group.
- **`DishOptionGroup`** attaches groups to dishes. This is what makes options reusable *and* targeted: "Spice level" can apply to twelve dishes without being copied, but it does not silently apply to dessert.
- **`Allergen` / `DietaryTag`** attach to both dishes and options, because an option can change the allergen profile of a dish.
- **`KitchenStation`** is a row, not an enum, because stations are operational configuration.

## 8. Pricing model

| Entity | Purpose |
| --- | --- |
| `PriceTier` | A named price list (`code`, `name`), `isDefault`, `active`, plus `strategy` and `markupBasisPoints` for prices that are not listed explicitly. A `Company` points at exactly one tier. |
| `DishTierPrice` | `@@unique([dishId, priceTierId])`, `priceCents`. One explicit price per dish per tier. |
| `OptionTierPrice` | The same for options. |

**Absent prices are meaningful.** There is no "price = null" row: the absence of a `DishTierPrice` row for a tier means that tier has no explicit price, and a later `PricingService` decides what happens (fall back to the default tier, or derive from `cost` using the tier strategy). Modelling absence as a missing row keeps the table honest and lets a unique constraint do the work.

**Integer cents.** All money columns end in `Cents` and are `Int`. `$12.99` is stored as `1299`. Floating point cannot represent `0.1` exactly, so repeated addition of float money drifts: a thousand-line invoice can be off by a cent, and a cent of drift in a financial document is a support ticket. Integers add exactly.

**Basis points.** Percentages are integers where 10000 = 100%: `1500` is 15%, `24000` is 240%. That covers both future strategies the assignment mentions, without floats:

- `cost × 2.4` → `strategy = COST_MULTIPLIER`, `markupBasisPoints = 24000`, computed later as `cost * 24000 / 10000`.
- `base + 15%` → `strategy = BASE_MARKUP`, `markupBasisPoints = 1500`, computed later as `base + base * 1500 / 10000`.

Both expressions are integer multiplication followed by one integer division, so rounding happens once, in a place the service layer controls. Step 3 stores the intent only; no calculation exists yet.

**Exactly one default tier.** See section 23 — this needs a PostgreSQL partial unique index.

## 9. Company model

| Entity | Purpose and key points |
| --- | --- |
| `Company` | `name`, `legalName`, required `priceTierId` (`Restrict`), billing contact fields, optional `ownerEmployeeId` (unique, relation `CompanyOwner`), delivery defaults (`defaultAddressId` unique, `defaultDeliveryTime` as `@db.Time(0)`, `defaultPackagingTypeId`), `active`. |
| `CompanyDomain` | `domain` is **globally unique**: an email domain maps to exactly one company, which is how a person is later matched to their employer. Cascades with the company. |
| `CompanyAddress` | Delivery destinations: `label`, `line1`/`line2`, `city`, `state`, `postalCode`, `country`, `deliveryNotes`, `active`. Indexed by `[companyId, active]`. |
| `CompanyHoliday` | `date` as `@db.Date` with `@@unique([companyId, date])`: a company cannot have the same holiday twice. |
| `CompanyWorkingDay` | `weekday` enum with `@@unique([companyId, weekday])`: the weekdays this company can receive deliveries. |

**Company receiving calendar vs kitchen working calendar.** These are two different things and the schema keeps them apart:

- `CompanyWorkingDay` + `CompanyHoliday` describe **whether a company can receive a delivery on a given day** — their office is open.
- `KitchenWorkingDay` + `KitchenHoliday` describe **whether the kitchen operates on a given day**, which is what cutoff processing needs in order to decide when orders for a delivery date must be locked.

They are not the same question and must not be collapsed: the kitchen can be closed on a day the customer is open, and vice versa. Note what is *not* encoded anywhere: there is no rule that a delivery date must be a company working day. That interpretation would be an invention; the calendars are stored as data and a later `CutoffCalculator` will decide how to read them.

Date-only concepts (`CompanyHoliday.date`, `KitchenHoliday.date`, `Order.deliveryDate`, invoice period/issue/due dates) use `@db.Date` so there is no time component to misinterpret. Clock-only concepts (`Order.deliveryTime`, `Company.defaultDeliveryTime`) use `@db.Time(0)`.

## 10. Menu model

```
MenuCategory ──< MenuCategoryDish >── Dish
     ^                                  ^
     │ CompanyHiddenCategory            │ CompanyHiddenDish
     └────────── Company ───────────────┘
```

- **`MenuCategory`** has `slug` and `name` (both unique), `displayOrder`, `active`, and `isSecret`. A secret category is excluded from the normal listing but stays reachable by its slug — so a special menu can be shared with one customer without publishing it.
- **`MenuCategoryDish`** places a dish in a category with its own `displayOrder`, with `@@unique([menuCategoryId, dishId])` so a dish cannot appear twice in the same category (it may appear in several different categories).
- **`CompanyHiddenCategory` / `CompanyHiddenDish`** are per-company exclusions, each with a unique pair. The menu is therefore global data plus a small per-company subtraction, rather than a copy of the menu per company: one dish price change does not have to be applied in fifty places.

Three independent levers exist: global `active` flags, `isSecret` on a category, and company-specific hiding. The `MenuResolver` that combines them belongs to a later step.

## 11. Order model

```
Order
 ├── OrderEvent          (timeline)
 ├── PrepUnit            (kitchen units)
 └── OrderLine           (one ordered dish)
       └── OrderCombination   (distinct option combination, qty)
             └── CombinationOption  (one selected option)
```

| Entity | Purpose and key points |
| --- | --- |
| `Order` | `orderNumber` unique, `companyId`, `customerEmployeeId`, `status`, `deliveryDate` (`@db.Date`), `deliveryTime` (`@db.Time(0)`), `deliveryAddressId` **plus address snapshot columns**, packaging id + name snapshot, price tier id + name snapshot, `subtotalCents`/`totalCents`, optional `driverStaffId` and `deliveryPhotoFileId`, cutoff state (`cutoffRunId`, `cutoffProcessedAt`), lifecycle timestamps (`placedAt`, `confirmedAt`, `rejectedAt`, `cancelledAt`, `deliveredAt`), and `version` for optimistic concurrency. |
| `OrderLine` | One ordered dish with its full snapshot (name, SKU, description, temperature, station code/name), `quantity`, `unitPriceCents`, `lineTotalCents`, `displayOrder`. `dishId` is nullable and `Restrict` — traceability, not truth. |
| `OrderCombination` | A distinct set of selected options within a line, with its own `quantity` and money (`unitPriceCents`, `optionsPriceCents`, `totalCents`) and a `signature` fingerprint of the chosen options. `@@unique([orderLineId, signature])` keeps combinations genuinely distinct. |
| `CombinationOption` | One selected option inside a combination, with `optionGroupName`, `optionName` and `optionPriceCents` snapshots. `@@unique([orderCombinationId, optionId])`. |
| `OrderEvent` | The progress timeline: `type`, `actorType` (`STAFF`/`CUSTOMER_EMPLOYEE`/`SYSTEM`), optional actor ids, `note`, `occurredAt`. |

**Why combinations are modelled separately.** "5 × Paneer Wrap" is not one thing in a kitchen if three are mild and two are spicy. The assignment states that a combination is the preparation unit, so it needs to be a row that can carry its own quantity, its own option set and its own price. Keeping options directly on the line would force either one line per variation (losing "5 wraps" as a concept and breaking MOQ checks) or a JSON blob (unqueryable, unconstrainable). With combinations as rows, the kitchen view is a straightforward query and the per-variation price is stored, not recomputed.

The rule that **combination quantities must sum to the line quantity** is deliberately *not* a database `CHECK`: a `CHECK` can only see one row, and expressing a cross-row aggregate would need a trigger whose behaviour during a multi-statement draft edit would be hostile (an intermediate state is legitimately invalid). It belongs to a `CombinationValidator` in a later step, at the point where the order is submitted.

`version` supports optimistic concurrency: two kitchen tablets updating the same order will both read `version = 4`, and only the first `UPDATE ... WHERE version = 4` wins.

## 12. Historical snapshots

This is the most important idea in the schema.

An order is a record of what was agreed at a point in time. The catalogue, by contrast, is a living thing: prices rise, dishes are renamed, stations are reorganised. If an order read its display data through foreign keys, editing the catalogue would silently rewrite history — last month's invoice would change totals, and a delivered order would claim it was cooked at a station that did not exist then.

### Example

**Today** — the catalogue says:

```
Dish  : "Paneer Wrap"   SKU WRAP-PNR-01
Price : 250 cents
Station: Grill
```

An order is placed, and `OrderLine` stores:

```
dishId             = <paneer wrap uuid>     (traceability only)
dishName           = "Paneer Wrap"
dishSku            = "WRAP-PNR-01"
dishTemperature    = HOT
kitchenStationCode = "GRILL"
kitchenStationName = "Grill"
unitPriceCents     = 250
quantity           = 2
lineTotalCents     = 500
```

**Three months later** the catalogue changes: the dish is renamed "Paneer Kathi Roll", the price becomes 320 cents, and it is moved to the Tandoor station.

**The old order still reads:**

```
Paneer Wrap   WRAP-PNR-01   250 cents   Grill
```

because every one of those values is a column on the order row, not a join. The same is true at every level:

- `OrderLine` — dish name, SKU, description, temperature, station code and name, unit price.
- `OrderCombination` — the combination's own unit, options and total amounts.
- `CombinationOption` — the option group name, the option name and the option price as selected.
- `Order` — the delivery address text, the packaging type name and the price tier name.
- `PrepUnit` — the station code and name it was routed to, plus the dish name.

Foreign keys (`dishId`, `optionId`, `kitchenStationId`, `deliveryAddressId`) are kept for traceability — "show me every order that ever contained this dish" — and are all `Restrict`/nullable so catalogue edits can never delete history. The rule to remember: **foreign keys answer "which catalogue row was this?", snapshots answer "what did the customer actually order?"** Only the snapshot is authoritative for the past.

This is also why `Dish` is deactivated rather than deleted: `active = false` removes it from the menu while leaving the traceability link intact.

## 13. Kitchen model

`PrepUnit` is the physical unit the kitchen works on, generated from an `OrderCombination`:

- `orderId` (for order-level views) and `orderCombinationId`, which is **unique** — one prep unit per combination, so regenerating prep units for an order is idempotent and cannot silently double the work list.
- `kitchenStationCode` / `kitchenStationName` / `dishName` snapshots, plus a nullable `kitchenStationId` for traceability.
- `quantity`, `status` (`PENDING` → `IN_PROGRESS` → `READY`, or `CANCELLED`), `startedAt`, `completedAt`.
- Indexes on `[status]`, `[kitchenStationId, status]` and `[orderId]` — the station screen's query is "everything PENDING or IN_PROGRESS at my station".

**Why the station snapshot matters.** Routing happened at a moment in time. If a dish is later moved from Grill to Tandoor, a historical prep unit that was cooked on the grill must still say Grill — otherwise yesterday's production report changes retroactively and the station workload history becomes fiction. Reading the station through `Dish → KitchenStation` would do exactly that.

State transitions are a later step; Step 3 only stores the state.

## 14. Delivery model

```
Drop (company + address + delivery date + exact delivery time)
 └── DropOrder ──> Order
```

- **`Drop`** represents one physical delivery run to one place at one time: `companyId`, `companyAddressId`, `deliveryDate`, `deliveryTime`, `status`, optional `driverStaffId`, optional `deliveryPhotoFileId`, `dispatchedAt`, `deliveredAt`.
- **`DropOrder`** links orders to the drop. `orderId` is unique, so an order can belong to at most one drop — a single parcel cannot be in two vans.

**The grouping key.** The assignment's rule is that a drop groups orders for the same company, delivery address and exact delivery time. All four grouping columns are non-nullable, so this is expressible directly:

```prisma
@@unique([companyId, companyAddressId, deliveryDate, deliveryTime])
```

That gives a real guarantee: two concurrent dispatch requests cannot create two drops for the same company/address/time — the second insert fails and the service retries by loading the existing drop. The constraint is honest about its scope: it guarantees *drop identity is unique*, not that every order inside it is eligible. Deciding which orders may join (status, cutoff state, capacity) is dispatch logic for a later step.

## 15. Billing model

| Entity | Purpose |
| --- | --- |
| `Invoice` | `companyId`, `invoiceNumber` unique, `status`, optional `periodStart`/`periodEnd`/`issueDate`/`dueDate` (all `@db.Date`), `subtotalCents`, `creditCents`, `totalCents`. |
| `InvoiceLine` | `invoiceId`, `type` (`ORDER` / `CREDIT` / `ADJUSTMENT`), nullable `orderId`, nullable `orderCreditId`, `description`, `amountCents`. |
| `OrderCredit` | `companyId`, optional `orderId`, `amountCents` (> 0), `reason`, optional `createdByUserId`. |

Confirmed orders become amounts owed by the company; an invoice collects them as `ORDER` lines, and credits appear as `CREDIT` lines that offset the total.

### Why `@@unique([invoiceId, orderId])` is wrong

That constraint says: "within one invoice, an order may appear once." It fails in both directions.

- **It is too weak where it matters.** It permits order `X` on invoice `A` *and* on invoice `B` — the same order billed twice. That is the error that actually hurts, and this constraint does not prevent it.
- **It is too strong where it does not matter.** An order and its credit often belong on the same invoice as two separate lines. Forcing the order/credit relationship through one composite key pushes you towards keeping `orderId` on the credit line too, which then collides with the order's own line.

The correct rules are two independent "at most once, globally" statements:

```prisma
orderId       String? @unique   // an order is invoiced at most once, on any invoice
orderCreditId String? @unique   // a credit is invoiced at most once, on any invoice
```

These are single-column unique indexes on **nullable** columns, and PostgreSQL treats `NULL`s as distinct. So many rows may have `orderId IS NULL` (every credit line and every adjustment line), while at most one row in the whole table may carry a given non-null `orderId`. That is precisely a partial unique index — which is why no extra SQL is needed here, and why I did not write `@@unique([invoiceId, orderId])`.

One more invariant *does* need raw SQL, because Prisma cannot express a cross-column `CHECK`: a line's `type` must match its target (`ORDER` ⇒ `orderId` set and `orderCreditId` null, `CREDIT` ⇒ the reverse, `ADJUSTMENT` ⇒ neither). It lives in `prisma/sql/postgres_constraints.sql`.

### Credit policy

Credits are intentionally simple and this is a conscious scope decision: a credit is **all-or-nothing**. One `OrderCredit` is consumed in full by at most one `InvoiceLine` (enforced by the unique `orderCreditId`), so there is no partial consumption, no running balance and no allocation table. A credit is either not yet invoiced (no invoice line references it) or fully applied (exactly one does). If the business later needs partial consumption, the migration is additive — an allocation table — and nothing already recorded becomes wrong. `amountCents` is constrained to be strictly positive so the sign convention is unambiguous: credits are stored positive and subtracted at the invoice level (`Invoice.creditCents`).

## 16. Files

`DbFile` holds file metadata in PostgreSQL: `storageKey` (unique), `filename`, `mimeType`, `sizeBytes`, optional `checksum`, optional `uploadedByUserId`, `createdAt`, and an optional `data Bytes?` column for the database-backed storage mode indicated by `FILE_STORAGE=db`. An external-storage mode would leave `data` null and resolve the bytes from `storageKey`, so the choice of backend never changes the referencing tables.

It is referenced by `Dish.imageFileId` (dish image), `Order.deliveryPhotoFileId` and `Drop.deliveryPhotoFileId` (delivery photos). All three use `onDelete: SetNull`: deleting a file must not delete an order. No upload service and no cloud integration exists yet.

## 17. Cutoff

`CutoffRun` records one execution of cutoff processing: `processingDate` (`@db.Date`), `targetDeliveryDate` (`@db.Date`), `cutoffAt`, `status`, the counters `ordersProcessed`/`ordersConfirmed`/`ordersRejected`, `failureReason`, `startedAt`, `completedAt`. `Order.cutoffRunId` links the orders a run touched.

**Idempotency** comes from `@@unique([processingDate, targetDeliveryDate])`. Cutoff will be triggered by a scheduler, and schedulers fire twice: retries, restarts, two instances of the API. With this key, the second attempt to create the same run fails at the database level, so the service can treat "already exists" as "already done" instead of confirming every order a second time. The per-order `cutoffRunId` and `cutoffProcessedAt` make it possible to see exactly what a run did and to resume safely.

The cutoff algorithm — including how it reads the kitchen calendar versus the company receiving calendar — is a later step. No working-day rule is encoded here.

## 18. Money correctness

**Integer cents.** Every monetary column is an `Int` named `...Cents`:

| Amount | Stored |
| --- | --- |
| $12.99 | `1299` |
| ₹250.00 | `25000` |
| $0.01 | `1` |

Floats are not used because binary floating point cannot represent most decimal fractions exactly: `0.1 + 0.2` is `0.30000000000000004`. Summing a hundred float line amounts can land a cent away from the right answer, and an invoice that disagrees with the sum of its lines by a cent is a credibility problem. Integers are exact under addition and multiplication; division is the only lossy operation, so rounding happens exactly where the service layer chooses.

**Basis points.** Ratios are integers with 10000 = 100%:

| Meaning | Stored |
| --- | --- |
| 15% | `1500` |
| 100% | `10000` |
| 240% (× 2.4) | `24000` |

With `markupBasisPoints` and `strategy` on `PriceTier`, both assignment examples are integer arithmetic:

```
cost x 2.4   ->  costCents * 24000 / 10000
base + 15%   ->  baseCents + baseCents * 1500 / 10000
```

`Dish.costCents`/`Option.costCents` are internal cost; `DishTierPrice.priceCents`/`OptionTierPrice.priceCents` are customer prices; `OrderLine.unitPriceCents` and the combination/option amounts are the prices that were actually charged. Database `CHECK` constraints keep all of them non-negative, and credits strictly positive.

## 19. Constraints

**Primary keys.** Every table uses a UUID string (`@id @default(uuid())`). One strategy everywhere means no "is this id a number or a string?" ambiguity, ids can be generated by the application before an insert (useful for building an order graph in one transaction), and ids are safe to expose in URLs without leaking row counts.

**Single-column unique.** `User.email`, `Role.name`, `Permission.key`, `Staff.staffCode`, `Dish.sku`, `Option.code`, `OptionGroup.code`/`name`, reference-data `code`/`name`, `PriceTier.code`/`name`, `CompanyDomain.domain`, `CustomerEmployee.email`, `MenuCategory.slug`/`name`, `Order.orderNumber`, `Invoice.invoiceNumber`, `DbFile.storageKey`, `KitchenHoliday.date`, `KitchenWorkingDay.weekday`.

**Unique on nullable columns** (PostgreSQL treats NULLs as distinct, giving partial-unique behaviour for free): `Staff.userId`, `Company.ownerEmployeeId`, `Company.defaultAddressId`, `PrepUnit.orderCombinationId`, `DropOrder.orderId`, `InvoiceLine.orderId`, `InvoiceLine.orderCreditId`.

**Composite unique.** Membership pairs (`RolePermission`, `DishAllergen`, `DishDietaryTag`, `OptionAllergen`, `OptionDietaryTag`, `OptionGroupOption`, `DishOptionGroup`, `MenuCategoryDish`, `CompanyHiddenCategory`, `CompanyHiddenDish`, `CustomerEmployeeAllergen`, `CustomerEmployeeDietaryTag`), per-company calendars (`[companyId, date]`, `[companyId, weekday]`), tier prices (`[dishId, priceTierId]`, `[optionId, priceTierId]`), combination identity (`[orderLineId, signature]`, `[orderCombinationId, optionId]`), the drop grouping key (`[companyId, companyAddressId, deliveryDate, deliveryTime]`) and the cutoff key (`[processingDate, targetDeliveryDate]`).

Note what is *not* over-constrained: `Company.name` and `CompanyAddress.label` are not unique (two companies may share a name; every company may have an address labelled "Head Office"), and a dish may appear in several menu categories.

**Partial unique index** (raw SQL — Prisma has no syntax for it): one default `PriceTier`. `@@unique([isDefault])` would wrongly allow only a single non-default tier as well, so the index is restricted with `WHERE "isDefault"`.

**CHECK constraints** (raw SQL — Prisma has no syntax for them): non-negative money across dishes, options, tier prices, orders, lines, combinations, options, invoices and file sizes; positive quantities on `OrderLine`, `OrderCombination` and `PrepUnit`; positive `OrderCredit.amountCents`; positive `Dish.moq` when set; non-negative `markupBasisPoints`; and the `InvoiceLine` type/target coherence rule.

**Foreign keys** are declared on every relationship, with explicit relation names wherever two models are joined more than once or a cycle exists: `StaffAccount` (`User` ↔ `Staff`), `CompanyOwner` and `CompanyEmployees` (`Company` ↔ `CustomerEmployee`), `CompanyDefaultAddress` vs `CompanyAddresses`, `CompanyDefaultPackaging`, `OrderDriver` and `DropDriver` (`Staff`), `DishImage`, `OrderDeliveryPhoto`, `DropDeliveryPhoto` (`DbFile`), `OrderEventActorUser` / `OrderEventActorEmployee`, `InvoiceLineOrder` / `InvoiceLineCredit`, `OrderCredits`, `OrderCreditCreatedBy`.

**What is deliberately not a constraint.** The sum of combination quantities equalling the line quantity is cross-row and legitimately violated mid-edit, so it is service-layer validation. Likewise, which orders may join a drop, and every calendar rule.

## 20. Index strategy

Indexes were added for queries the later steps will certainly run, not for every column (each index costs write time and storage).

| Index | The query it serves |
| --- | --- |
| `Order [companyId, deliveryDate]` | A company's orders for a day — the customer's own view and the billing period scan. |
| `Order [deliveryDate, status]` | Kitchen and dispatch planning: "everything confirmed for tomorrow". |
| `Order [status]`, `Order [createdAt]` | Admin queues and recent-order listings. |
| `Order [customerEmployeeId]` | "My orders" for one employee. |
| `Order [driverStaffId]`, `Order [cutoffRunId]` | A driver's workload; what one cutoff run touched. |
| `PrepUnit [kitchenStationId, status]`, `[status]`, `[orderId]` | The station screen (the kitchen's hottest query) and the per-order kitchen view. |
| `Drop [companyId, deliveryDate]`, `[deliveryDate, status]`, `[status]`, `[driverStaffId]` | Dispatch board by day, by state, and per driver. |
| `Invoice [companyId, status]`, `[status]`, `[issueDate]`, `[companyId, periodStart, periodEnd]` | Outstanding invoices per company, invoice runs, and billing-period lookups. |
| `MenuCategoryDish [menuCategoryId, displayOrder]`, `[dishId]` | Rendering an ordered menu; "which categories contain this dish". |
| `CompanyHiddenCategory [menuCategoryId]`, `CompanyHiddenDish [dishId]` | Menu resolution joins from the hide tables. |
| `CompanyDomain.domain` (unique), `CompanyDomain [companyId]` | Domain → company lookup at sign-up; a company's domains. |
| `CutoffRun [targetDeliveryDate]`, `[status]` | Finding the run for a delivery date and monitoring failures. |
| Reference side of each join table (`[allergenId]`, `[dietaryTagId]`, `[optionId]`, …) | Reverse lookups such as "all dishes containing peanuts". PostgreSQL indexes the composite unique pair left-to-right only, so the second column needs its own index. |
| `Dish [active]`, `[kitchenStationId]`, `[name]` | Menu listing of active dishes, station grouping, admin search. |

Foreign key columns that are only ever read through their unique index (for example `InvoiceLine.orderId`) are not indexed twice.

## 21. Delete strategy

The guiding rule: **history is never deleted as a side effect**.

| Relationship | Behaviour | Why |
| --- | --- | --- |
| Catalogue → order history (`Dish` → `OrderLine`, `Option` → `CombinationOption`, `KitchenStation` → `OrderLine`/`PrepUnit`, `PackagingType`/`PriceTier` → `Order`) | `Restrict` | Deleting a dish must never delete the orders that contained it. The catalogue lifecycle is `active = false`, and `Restrict` is what makes that the only option. |
| `Company`/`CustomerEmployee`/`CompanyAddress` → `Order` | `Restrict` | A customer cannot be erased out from under their delivered and invoiced orders. |
| `Order` → `DropOrder`, `Order` → `InvoiceLine`, `OrderCredit` → `InvoiceLine` | `Restrict` | An order that is already dispatched or invoiced cannot be deleted at all. |
| `Order` → `OrderLine` → `OrderCombination` → `CombinationOption`, and `Order` → `OrderEvent`/`PrepUnit` | `Cascade` | These are one aggregate owned by the order, not independent history. Editing a draft replaces its lines, and if an order row is ever removed its children must not be orphaned. The order itself is still protected from above by the `Restrict` links in the row above. |
| `Company` → domains/addresses/holidays/working days/hidden rows | `Cascade` | Pure configuration belonging to the company; it has no meaning without it. |
| `Role`/`Permission` → `RolePermission`, `Dish`/`Option` → membership and tier-price rows, `MenuCategory` → `MenuCategoryDish` | `Cascade` | Membership tables carry no history of their own. |
| `DbFile` → `Dish.imageFile`, `Order.deliveryPhoto`, `Drop.deliveryPhoto`; `User` → `Staff.user`, `OrderEvent` actors, `OrderCredit.createdBy`; `Company.owner`/`defaultAddress` | `SetNull` | The reference is decoration or attribution. Losing a photo or a departed user's link must weaken the record, not destroy it. |

In practice almost nothing in the order/billing area is ever deleted: orders are `CANCELLED`, invoices are `VOID`, catalogue rows are deactivated.

## 22. Relationship diagram

```
Role ──< RolePermission >── Permission
  │
  └──< User ──1:1── Staff ──< Order (driver)
                      └────< Drop  (driver)

PriceTier ──< DishTierPrice >── Dish
    │       ──< OptionTierPrice >── Option
    │
Company (priceTier)
 ├── CompanyDomain          (domain globally unique)
 ├── CompanyAddress ────────────────┐
 ├── CompanyHoliday                 │  (receiving calendar)
 ├── CompanyWorkingDay              │
 ├── CustomerEmployee  ──(owner)──> Company
 ├── CompanyHiddenCategory ──> MenuCategory
 ├── CompanyHiddenDish     ──> Dish
 ├── Invoice                        │
 │     └── InvoiceLine ──> Order / OrderCredit
 ├── OrderCredit                    │
 ├── Drop <──────── DropOrder ──> Order
 └── Order (company, customerEmployee, deliveryAddress, packaging, priceTier)
       ├── OrderEvent               (timeline)
       ├── PrepUnit ──> OrderCombination, KitchenStation (+ snapshots)
       └── OrderLine                (+ dish/station snapshots)
             └── OrderCombination   (+ quantity, price)
                   └── CombinationOption  (+ option/group snapshots)

MenuCategory ──< MenuCategoryDish >── Dish
Dish ──< DishOptionGroup >── OptionGroup ──< OptionGroupOption >── Option
Dish ──< DishAllergen >── Allergen ──< OptionAllergen >── Option
Dish ──< DishDietaryTag >── DietaryTag ──< OptionDietaryTag >── Option
Dish ──> KitchenStation, PortionSize, DbFile (image)

KitchenWorkingDay / KitchenHoliday      (kitchen calendar - separate)
CutoffRun ──< Order                      (idempotent cutoff processing)
DbFile <── Order.deliveryPhoto, Drop.deliveryPhoto, Dish.imageFile
```

## 23. Migration notes

`apps/api/prisma/sql/postgres_constraints.sql` contains everything PostgreSQL can enforce but `schema.prisma` cannot express. Each statement is written as `DROP ... IF EXISTS` followed by `ADD`, so the file is safe to replay.

1. **One default price tier.**

   ```sql
   CREATE UNIQUE INDEX "PriceTier_one_default_key"
     ON "PriceTier" ("isDefault")
     WHERE "isDefault";
   ```

   A plain `@@unique([isDefault])` would index *all* rows, allowing only one `true` **and** only one `false` — so the kitchen could never have two non-default tiers. The `WHERE` clause restricts the index to the rows that matter, giving "at most one default tier" and unlimited non-default tiers. Prisma has no schema syntax for a partial index, so faking it with an ordinary composite unique would have been wrong.

2. **Positive quantities and non-negative money.** `CHECK` constraints on `Dish.costCents`, `Dish.moq`, `Option.costCents`, `PriceTier.markupBasisPoints`, `DishTierPrice.priceCents`, `OptionTierPrice.priceCents`, `Order.subtotalCents`/`totalCents`, `OrderLine.quantity`/`unitPriceCents`/`lineTotalCents`, `OrderCombination.quantity` and its money columns, `CombinationOption.optionPriceCents`, `PrepUnit.quantity`, `Invoice.subtotalCents`/`creditCents`/`totalCents`, and `DbFile.sizeBytes`. These are properties of the data itself: a negative quantity or a negative dish price is meaningless no matter which code path wrote it, and a constraint protects against future services, scripts and manual fixes alike.

3. **Positive credits.** `OrderCredit.amountCents > 0` fixes the sign convention: credits are always stored positive and subtracted at the invoice level, so there is no ambiguity about whether a credit adds or removes money.

4. **Invoice line coherence.** `InvoiceLine` must match its own `type`: an `ORDER` line references an order and no credit, a `CREDIT` line references a credit and no order, an `ADJUSTMENT` references neither. Cross-column `CHECK`s have no Prisma syntax.

5. **Invoice/credit uniqueness needs no SQL.** As explained in section 15, Prisma's `@unique` on the nullable `InvoiceLine.orderId` and `InvoiceLine.orderCreditId` already behaves as a partial unique index in PostgreSQL, so adding raw SQL for it would be duplicated, divergent definitions.

No migration has been generated or applied — the exact commands to do that are in the final response (the SQL file is appended to the generated migration before it is applied, so the schema and its constraints arrive in one atomic migration).

## 24. Interview explanation

"The database is the foundation, so I modelled the whole domain before writing any workflow.

Everything uses UUID primary keys and `createdAt`/`updatedAt`. Money is integer cents everywhere and percentages are basis points, because binary floats can't represent decimal money exactly and an invoice that's a cent off is a credibility problem. Date-only concepts like holidays and delivery dates use PostgreSQL `date`, delivery times use `time`, and I deliberately didn't bake the Asia/Kolkata business timezone into the columns — that's an application concern.

The schema has fourteen areas. Authentication is `User → Role → RolePermission → Permission`, so permissions are data, not an enum of roles. Internal staff and customer employees are separate models on purpose: a `CustomerEmployee` always belongs to a company and has per-person flags for choosing address, time and packaging, while staff have logins and roles. Allergens, dietary tags, kitchen stations, packaging types and portion sizes are tables, not enums, because they're admin-managed. The catalogue is dishes plus reusable options and option groups, linked to dishes explicitly so a group isn't globally applicable. Pricing is named tiers with explicit per-dish and per-option prices, where a missing row means no explicit price and the tier strategy decides later.

The two most important design decisions are snapshots and combinations.

Orders snapshot everything they display: the dish name, SKU, temperature, the kitchen station code and name, the unit price, the selected option names and prices, the delivery address text, the packaging and tier names. Foreign keys to the catalogue stay for traceability, but they're nullable and `Restrict`, never the source of truth. So if a dish is renamed, repriced and moved to another station next quarter, last month's order still shows 'Paneer Wrap, 250 cents, Grill'. Without that, editing the menu would silently rewrite finished invoices.

Combinations exist because five wraps where three are mild and two are spicy aren't one preparation unit. `OrderCombination` carries its own quantity, option set and price, and each one becomes a `PrepUnit` — one per combination, enforced by a unique constraint so generation is idempotent. The prep unit snapshots its station too, so historical routing stays correct.

For constraints I used the database where the database is the right place: unique keys on emails, SKUs, domains and order numbers, composite uniques on every membership table, a composite unique on the drop grouping key of company plus address plus date plus exact time so two concurrent dispatches can't create duplicate drops, and a unique cutoff key of processing date plus target delivery date so a cutoff retry is idempotent. Two things needed raw SQL because Prisma can't express them: a partial unique index for 'exactly one default price tier' — an ordinary unique on `isDefault` would also forbid a second non-default tier — and `CHECK` constraints for positive quantities and non-negative money.

On billing I specifically avoided `@@unique([invoiceId, orderId])`. That's wrong in both directions: it still allows the same order on two different invoices, which is the error that actually costs money, and it blocks an order and its credit being separate lines. Instead each of `orderId` and `orderCreditId` has its own unique index on a nullable column, which in PostgreSQL means 'at most once across all invoices' while allowing many nulls.

Finally, deletes. Catalogue and customer rows are `Restrict` against orders, so you can't delete your way into losing history — dishes get deactivated instead. Only the order aggregate itself cascades internally, and file and user references `SetNull` so a lost photo doesn't take the order with it.

And what's intentionally *not* in the database: the rule that combination quantities must sum to the line quantity, and anything about working-day eligibility. The first is cross-row and legitimately invalid mid-edit; both belong to service-layer validation."

## 25. Decisions and tradeoffs

- **UUID keys everywhere.** Slightly larger and less cache-friendly than `bigserial`, but one consistent strategy, ids generatable client-side (so a whole order graph can be built in one transaction), and no row-count leakage in URLs.
- **Integer cents instead of `Decimal`.** PostgreSQL `numeric` would also be exact, but it arrives in JavaScript as a string or a `Decimal` object and invites accidental `Number()` conversions. Integers are exact *and* native to JavaScript, as long as every value is cents — which the `...Cents` naming makes visible at every call site.
- **Basis points rather than a percentage float.** Integer multiply-then-divide keeps rounding at one controlled point and makes the stored value exactly reproducible.
- **Reference data as tables, not enums.** Adding an allergen must not require a deploy. The cost is a join and the need to seed the rows; the enums kept are genuine application states (`OrderStatus`, `InvoiceStatus`, `PrepUnitStatus`, `DropStatus`, `InvoiceLineType`, `DishTemperature`, `Weekday`, `CutoffRunStatus`, `PricingStrategy`) where a new value means new code anyway.
- **Snapshots duplicate data on purpose.** This is denormalisation, and it is the right call: an order is an immutable historical document, so the duplication is the feature, not a maintenance burden. The alternative — versioning the whole catalogue and joining orders to a version — is far more machinery for the same outcome.
- **`dishId` and other catalogue FKs on history are nullable and `Restrict`.** Nullable because the snapshot, not the link, is authoritative; `Restrict` because accidental catalogue deletion must fail loudly rather than quietly reshape history.
- **The order aggregate cascades internally, everything else restricts.** Draft editing needs to replace lines, combinations and options cheaply. The order row itself is protected from deletion by `Restrict` from `DropOrder` and `InvoiceLine` once it has been dispatched or invoiced.
- **One `PrepUnit` per `OrderCombination` (unique FK), with a `quantity`.** This makes prep-unit generation idempotent, which matters because it will be triggered by cutoff and by retries. The tradeoff is that the kitchen cannot tick off individual portions within a combination; if that is ever needed, adding a `sequence` column and relaxing the unique key to `[orderCombinationId, sequence]` is a small, additive migration.
- **`signature` on `OrderCombination`.** A deterministic fingerprint of the selected option ids lets the database enforce "combinations within a line are distinct" with `@@unique([orderLineId, signature])`. Computing it from a set of child rows is awkward, so the service layer will own the format — the tradeoff accepted in exchange for a real uniqueness guarantee.
- **The drop grouping key as a composite unique rather than a hashed `groupingKey` column.** All four columns are non-nullable, so the composite key is honest, readable and index-usable for the dispatch board queries. A hash column would need the same four values anyway, plus a format to maintain.
- **A `KitchenWorkingDay`/`KitchenHoliday` pair alongside the company calendar.** The assignment insists these two calendars are different; if only the company calendar existed, the distinction would live in prose and the first cutoff implementation would be tempted to reuse the wrong table. Two tables make the separation structural. No eligibility rule is encoded in either — they are plain data.
- **Credits are all-or-nothing.** No balance ledger, no partial allocation, per the instruction to keep credits simple. The unique `orderCreditId` on `InvoiceLine` makes "invoiced at most once" a database guarantee, and partial consumption remains an additive change later.
- **`DbFile.data` as an optional `Bytes` column.** It matches the project's `FILE_STORAGE=db` setting without committing to it: switching to object storage means writing `storageKey` and leaving `data` null, and no referencing table changes.
- **Address, packaging and tier snapshots on `Order`, not just ids.** Companies edit addresses and rename things. Reprinting a delivery note six months later must show where the food actually went.
- **The sum-of-combinations invariant left out of the database.** A `CHECK` cannot see sibling rows, and a trigger would reject legitimate intermediate states while a draft is being edited. It is a submit-time service validation instead — a deliberate choice to keep the database's guarantees ones it can actually keep.
- **`version` on `Order` only.** Orders are the one entity several actors (customer, kitchen, dispatch) touch concurrently. Adding optimistic concurrency columns everywhere would be premature.
