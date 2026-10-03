# Step 9 — Companies and employees

Step 9 models the customers Fernleaf cooks for. A **company** is the contract
and delivery configuration. An **employee** is a person who places orders for
that company. They are separate because they change independently: a person can
move companies, a company can change its calendar, and yesterday's order must
still describe the company that actually ordered the food.

```
Client
  ↓
CompaniesController / EmployeesController
  ↓
CompaniesService / EmployeesService
  ↓
Domain helpers (email-domain, DriverEligibilityService, KitchenTime)
  ↓
PrismaService
  ↓
PostgreSQL
```

Controllers validate DTOs and enforce permissions. Services own the business
rules. Domain helpers stay Prisma-light so they can be unit-tested without a
database.

## 1. Why two concepts

A company owns domains, addresses, a receiving calendar, delivery defaults, a
price tier and menu-visibility overrides. An employee owns a name, an email, a
default address *reference*, order-time permission flags, and allergen/dietary
links.

If those lived on one record, moving Alice from Northwind to Contoso would
either take Northwind's calendar with her or force every historical order to
follow her. Splitting them lets `CustomerEmployee.companyId` change while
`Order.companyId` stays put.

## 2. Company data model

Reused as-is from the Step 3 schema, with three delivery-default columns that
the original migration did not yet have:

- `Company` — name, billing contact, owner, price tier, delivery defaults
  (`defaultAddressId`, `defaultDeliveryTime`, `defaultPackagingTypeId`,
  `leaveKitchenMinutes` default **30**, `driverInstructions`,
  `defaultDriverStaffId`)
- `CompanyDomain` — globally unique, lowercase hostname
- `CompanyAddress` — labelled delivery location; deactivated, not deleted
- `CompanyWorkingDay` / `CompanyHoliday` — receiving calendar
- `CompanyHiddenCategory` / `CompanyHiddenDish` — visibility configuration

Historical tables (`Order`, `Drop`, `Invoice`) point at `Company` and
`CompanyAddress` with `Restrict`, so a company or an address that has been
used cannot be hard-deleted.

## 3. Employee data model

`CustomerEmployee` belongs to exactly one `Company` (`companyId` is required,
`onDelete: Restrict`). Email is unique. Delivery permissions are three
booleans on the employee row. Allergies and dietary preferences reuse the
catalogue reference tables through join models; free-text notes sit beside
them for things the catalogue does not enumerate.

The employee default address is a foreign key to `CompanyAddress`, not a copy
of the street fields. Edits to the live address show up for future orders.
Historical orders already snapshot the address text.

## 4. Company-domain validation

`normalizeCompanyDomain()` is the only writer of domain strings:

1. trim and lowercase
2. drop a leading `@` or a pasted `user@` prefix
3. reject values that are not a hostname
4. reject public consumer providers

Uniqueness is checked twice: the service distinguishes "already on this
company" (`DUPLICATE_COMPANY_DOMAIN`) from "owned by someone else"
(`COMPANY_DOMAIN_ALREADY_USED`), and `CompanyDomain.domain` is `@unique` so a
concurrent insert cannot sneak a second owner through.

A company must keep at least one domain. Removing the last one is
`COMPANY_MUST_KEEP_ONE_DOMAIN`.

## 5. Why public email domains are rejected

A company is identified by the domain its people mail from. Accepting
`gmail.com` would let anyone with a free mailbox claim to be that company's
employee, and later self-service signup would have no trustworthy match.

The blocked list lives in one set, `PUBLIC_EMAIL_DOMAINS`, so it can later
move into configuration without touching callers. It is intentionally short
(the obvious consumer providers) rather than an encyclopaedia.

## 6. Company calendar vs kitchen calendar

Two calendars, two jobs:

| Calendar | Question it answers |
| --- | --- |
| Kitchen working days + kitchen holidays | When does the *cutoff* fall? |
| Company working days + company holidays | Can this company *receive* a delivery that day? |

`CompaniesService` never calls `calculateCutoff`. It reuses `KitchenTime` only
to read and write `@db.Date` / `@db.Time` as UTC-anchored wrappers, the same
way settings does. A company holiday on 25 December does not move anyone's
cutoff.

## 7. Delivery defaults

`PATCH /companies/:id/delivery-defaults` stores the values an order will
inherit when the employee does not override them:

- default address (must belong to this company)
- default delivery time (`HH:mm`, stored as `@db.Time`)
- leave-kitchen minutes (0–1440, schema default 30, CHECK in SQL)
- packaging type
- driver instructions
- default driver

The default driver is a `Staff` id. Eligibility is a capability check, not a
role-name check: the staff row and its login must be active, and the role
must grant `delivery.update`. `DriverEligibilityService` is the single
implementation; the picker (`GET /companies/eligible-drivers`) and the write
path both use it.

## 8. PriceTier relationship

`Company.priceTierId` is required and `onDelete: Restrict`. Create and
`PATCH /companies/:id/price-tier` verify the tier exists via the Step 8
`PriceTier` table. No price is calculated here — Menu and Orders will call
`PriceTierService.resolveEffectiveTierId(company.priceTierId)`.

## 9. Hidden menu configuration

`PUT /companies/:id/menu-visibility` replaces `CompanyHiddenCategory` and
`CompanyHiddenDish` in one transaction after checking that every id exists.
Nothing in the catalogue is deleted. Resolution ("what does Alice actually
see?") is Step 10; this step only stores the company's overrides.

## 10. Employee permissions vs staff RBAC

| Kind | Lives on | Controls |
| --- | --- | --- |
| Staff RBAC (`companies.manage`, …) | `User → Role → Permission` | Which *admin routes* a staff member may call |
| Employee delivery flags | `CustomerEmployee` booleans | What that person may choose on an *order* |

`canChooseAddress` / `canChooseDeliveryTime` / `canChoosePackaging` never
grant access to `/api/companies`. Staff permissions never decide what an
employee can pick on an order. The Orders step will read the flags; this
step only stores them.

## 11. Moving an employee

`PATCH /employees/:id` with a new `companyId`:

1. the target company must exist
2. the (possibly new) email must sit on an approved domain of the *target*
3. the employee must not be the owner of their current company
4. the old default address is cleared unless the new company owns it
5. **only `CustomerEmployee` is updated**

There is no `UPDATE "Order" SET "companyId"` anywhere in the service. A unit
test spies on `prisma.order.update` / `updateMany` to keep it that way. An
e2e test inserts a real order, moves Alice, and asserts the order's
`companyId`, `customerEmployeeId` and address snapshot are unchanged.

## 12. Historical orders stay put

```
Order #100
  companyId           = Company A
  customerEmployeeId  = Alice
  deliveryAddressId   = A's Head office
  deliveryAddressLine1 = "1 Residency Road"   ← snapshot

Admin moves Alice to Company B.

Order #100 is still Company A.
Alice.companyId is now Company B.
Alice's next order may use Company B.
```

The schema already had this: `Order.companyId` is its own column, and the
address text is copied onto the order when it is placed. Step 9 does not
introduce a back-pointer that would tempt anyone to cascade.

## 13. API

| Method | Path | Permission |
| --- | --- | --- |
| GET | `/api/companies` | `companies.view` |
| POST | `/api/companies` | `companies.manage` |
| GET | `/api/companies/eligible-drivers` | `companies.view` |
| GET/PATCH | `/api/companies/:id` | view / manage |
| GET/POST/DELETE | `/api/companies/:id/domains[/:domainId]` | view / manage |
| GET/POST/PATCH/DELETE | `/api/companies/:id/addresses[/:addressId]` | view / manage |
| GET/PUT | `/api/companies/:id/calendar` | view / manage |
| POST/DELETE | `/api/companies/:id/holidays[/:holidayId]` | manage |
| PATCH | `/api/companies/:id/delivery-defaults` | manage |
| PATCH | `/api/companies/:id/price-tier` | manage |
| GET/PUT | `/api/companies/:id/menu-visibility` | view / manage |
| GET/POST | `/api/employees` | `employees.view` / `employees.manage` |
| GET/PATCH | `/api/employees/:id` | view / manage |

List endpoints are paginated and filterable (`search`, `active`,
`companyId` on employees). Addresses are retired (`DELETE` deactivates) so
`Order.deliveryAddressId` stays valid.

## 14. DTO validation

class-validator on every write: required strings, emails, UUIDs, weekday
enums, `HH:mm`, non-negative leave-kitchen minutes capped at 1440, boolean
flags, domain length. The global `ValidationPipe` (`whitelist`,
`forbidNonWhitelisted`, `transform`) is the first line; services repeat the
rules that span rows (domain ownership, owner membership, driver capability).

## 15. Domain errors

Typed subclasses of the existing hierarchy. Services never throw raw
`HttpException`s.

| Code | Kind |
| --- | --- |
| `COMPANY_NOT_FOUND`, `EMPLOYEE_NOT_FOUND`, `ADDRESS_NOT_FOUND`, `DRIVER_NOT_FOUND`, `PRICE_TIER_NOT_FOUND` | 404 |
| `COMPANY_DOMAIN_ALREADY_USED`, `DUPLICATE_COMPANY_DOMAIN`, `COMPANY_OWNER_INVALID`, `EMPLOYEE_EMAIL_CONFLICT`, `COMPANY_ADDRESS_CONFLICT` | 409 |
| `PUBLIC_EMAIL_DOMAIN`, `INVALID_COMPANY_DOMAIN`, `INVALID_WORKING_DAY`, `EMPLOYEE_DOMAIN_NOT_APPROVED`, `DRIVER_NOT_ELIGIBLE` | 400 |

## 16. Transactions

Used when a half-applied write would be unusable:

- create company (row + domains + addresses + working week)
- retire an address (deactivate + clear defaults that pointed at it)
- replace the working week
- replace hidden-menu configuration
- create/update employee with allergen/dietary links

Simple reads and single-column patches are not wrapped.

## 17. Database constraints

Kept from Step 3 and extended in `postgres_constraints.sql` §2d:

- `CompanyDomain.domain` unique (one owner worldwide)
- `CompanyHoliday (companyId, date)` unique
- `CompanyWorkingDay (companyId, weekday)` unique
- `Company_leaveKitchenMinutes_range` (0–1440)
- owner and default address are 1:1 optional FKs; "must belong to this
  company" cannot be a CHECK and is enforced in the service

A migration adds `leaveKitchenMinutes`, `driverInstructions` and
`defaultDriverStaffId` for databases created from the original init
migration.

## 18. Authorization

Existing keys, already on Admin via `ALL_PERMISSIONS`:

- `companies.view` / `companies.manage`
- `employees.view` / `employees.manage`

Kitchen, Dispatch and Driver do not receive them. Every handler is pinned by
`companies.authorization.spec.ts`; the AppModule walk in
`route-permission-coverage.spec.ts` still requires every new route to be
either `@Public()` or `@RequirePermissions(...)`.

No `user.role === 'Admin'` / `'Driver'` check exists in this module.

## 19. Tests

Unit:

- `email-domain.spec.ts` — normalize, public-domain rejection, email helpers
- `driver-eligibility.service.spec.ts` — capability check, listing
- `companies.service.spec.ts` — create, domains, owner, calendar, defaults,
  hidden menu
- `employees.service.spec.ts` — create, permissions, allergies, filters,
  move, owner protection, **orders are never written**
- `companies.authorization.spec.ts` — every handler, Admin-only grants

E2E (`test/companies.e2e-spec.ts`): auth, company CRUD, public/duplicate
domains, calendar, holidays, delivery defaults, ineligible driver, price
tier, menu visibility, employee CRUD, domain mismatch, pagination, owner
validation, **move-preserves-order**, unique-index protection.

## 20. Frontend

Minimum admin UI, no business rules in Next.js:

- `/companies` — list/create, domains, addresses, calendar/holidays,
  delivery defaults (including eligible drivers), price tier, hidden ids,
  employees of the selected company
- `/employees` — list with company filter, create, edit, company assignment,
  delivery flags, allergen/dietary checkboxes

Both call the NestJS API with the existing httpOnly cookie.

## 21. Trade-offs

- **Addresses are deactivated, not deleted.** Historical orders keep a live
  FK plus a snapshot. Reactivating is possible; a hard delete is not.
- **Owner cannot move or be deactivated** until someone else is assigned.
  Cheaper than a multi-company owner model the assignment does not ask for.
- **Hidden menu is ids, not a resolved menu.** Step 10 will join this data
  to categories and the pricing resolver.
- **Employee email must match an approved company domain.** That is the
  existing schema's reason for `CompanyDomain` existing. Public domains are
  therefore rejected on the company side as well.
- **Eligible drivers are listed by permission, not by the Driver role
  name.** A future "Senior Driver" role works without a code change.

## 22. Intentionally deferred

- CSV employee import
- MenuResolver / employee-facing menu
- Order creation (and therefore cutoff, kitchen board, dispatch)
- Pricing calculation (reuse Step 8 as-is)
- Billing / invoicing (billing *contact* only)
- Dashboards, notifications, exports
