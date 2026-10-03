# Step 10 — Menu Resolver

One service decides whether a dish is on a company's menu. Preview and (later)
order validation both call it, so the kitchen can never see an item in the
preview that the order API then rejects.

There is no Orders module yet. The integration seam is
`MenuService.assertOrderable` / `POST /api/menu/availability`. When Orders
lands it must import `MenuModule` and call that method — it must not
re-implement active / hidden / pricing checks.

## Why MenuResolver exists

Menu availability is a *conjunction* of catalogue state, company visibility
and Step 8 pricing. Those rules used to have nowhere to live: catalogue CRUD
does not know about companies, and company hidden-rows do not know about
prices. Putting the conjunction in one function means changing a rule
changes every caller.

```
Client
  ↓
MenuController          (auth, permissions, DTO)
  ↓
MenuService             (preview shaping, 404/400 for categories)
  ↓
MenuResolver            (shared availability)
  ↓
evaluateMenuItem()      (pure; no Prisma)
  + PricingResolver     (Step 8; never reimplemented)
  ↓
MenuContextLoader       (fixed query count)
  ↓
Prisma + PricingContextLoader
```

## Resolution flow

`MenuContextLoader.load({ companyId, employeeId })` runs a bounded set of
queries: company (and optional employee), hidden category ids, hidden dish
ids, the category→dish graph, then one `PricingContext` for the company's
tier (`PriceTierService.resolveEffectiveTierId`).

`evaluateMenuItem` then, in order:

1. category is active
2. dish is active
3. the category↔dish membership is active
4. the company has not hidden the category
5. the company has not hidden the dish
6. if the view is the normal listing, the category is not secret
7. `PricingResolver` returns `PRICED` (never treat `MISSING` as 0)

First failure wins. The result is `AVAILABLE` with integer cents, or
`UNAVAILABLE` with a reason (`CATEGORY_INACTIVE`, `DISH_HIDDEN`,
`MISSING_PRICE`, …).

## Secret categories

`MenuCategory.isSecret` is a *listing* flag, not a lock.

| Call | Secret category |
| --- | --- |
| `GET /api/menu` (listing) | omitted (`CATEGORY_SECRET`) |
| `GET /api/menu/categories/:slug` | returned if the slug is known |
| `POST /api/menu/availability` (order seam) | allowed — the caller already picked the dish |

Secret does **not** bypass inactive state, company hides, or missing prices.
An inactive or hidden secret category fails the same way a public one does.

## Company visibility

`CompanyHiddenCategory` and `CompanyHiddenDish` from Step 9 are the only
visibility store. Nothing is copied. A hide is company-scoped: hiding
"Salads" for Northwind does not hide it for Contoso, and does not deactivate
the catalogue row.

## Pricing integration

The company's `priceTierId` is resolved with the existing helper (company
tier, else the default). `PricingResolver.resolve` is called in memory
against the loaded `PricingContext`. A `MISSING` result becomes
`MISSING_PRICE` and the dish is left out of the preview and rejected by the
order seam. There is no `$0` fallback and no second pricing implementation.

## Employee preview

`GET /api/menu?companyId=&employeeId=` loads that employee's company (and
rejects a mismatch). The payload is the menu that employee would actually
receive: same resolver, same hidden sets, same tier. There is no preview-only
rule set.

## Order validation reuse

`MenuResolver.assertDishOrderable(context, dishId, categoryId?)` is the
order seam:

- with a `categoryId`, that path is evaluated in `direct` mode
- without one, the dish is orderable if **any** membership (including a
  secret category) evaluates `AVAILABLE`

`DishNotOrderableError` (`DISH_NOT_ORDERABLE`) is thrown on failure so an
order write cannot persist a hidden or unpriced line.

`POST /api/menu/availability` exposes the same method over HTTP for tests
and for the future Orders controller. **Do not invent a parallel check
inside Orders.**

```
// later, in OrdersService.create / update:
const menu = await this.menuService.assertOrderable(
  { companyId: order.companyId, employeeId: order.customerEmployeeId },
  lines.map((line) => ({ dishId: line.dishId })),
);
```

## Tradeoffs

- Preview HTTP responses only include `AVAILABLE` dishes. Reasons stay on
  the resolver so tests and the order seam can still see `MISSING_PRICE`.
- Direct lookup of a hidden/inactive category is a 400
  (`MENU_CATEGORY_UNAVAILABLE`), not a silent empty list — the slug was
  explicit, so the caller deserves a reason.
- Membership `active` is its own rule: a dish can stay in the catalogue but
  be withdrawn from one section.
- No new tables. Menu sections reuse `MenuCategory` / `MenuCategoryDish`.

## Intentionally deferred

- Order creation / draft lines (Step 11+)
- Option pricing on the menu (dishes only; options stay on the combination
  validator)
- Employee-facing storefront UI
- CSV / published menu snapshots
- Cutoff / delivery-day filtering (company calendar is Step 9; applying it
  to "can I order for Wednesday?" is an order concern)

## API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/menu?companyId=&employeeId=` | `menu.view` |
| GET | `/api/menu/categories/:slug?companyId=&employeeId=` | `menu.view` |
| POST | `/api/menu/availability` | `menu.view` |

`menu.view` is new; Kitchen receives it (they already see the catalogue and
price grid). `menu.manage` remains Admin-only. No role-name checks.
