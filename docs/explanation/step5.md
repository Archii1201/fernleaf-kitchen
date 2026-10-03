# Step 5 — Staff Management

A small admin-only module for managing staff accounts. It adds no new infrastructure: it reuses the guards, decorators, pagination, validation and error system from Steps 2–4.

## Endpoints

| Route | Permission | Behaviour |
| --- | --- | --- |
| `GET /api/staff` | `staff.view` | Paginated list via the shared `PaginationQueryDto` (`page`, `limit`, max 100) and `{ data, meta }` envelope. |
| `POST /api/staff` | `staff.manage` | Creates a `User` login plus its `Staff` profile in one transaction. |
| `GET /api/staff/:id` | `staff.view` | One account, 404 when unknown. |
| `PATCH /api/staff/:id` | `staff.manage` | Profile fields only: `fullName`, `phone`, `jobTitle`. |
| `PATCH /api/staff/:id/role` | `staff.manage` | Changes `roleId`. |
| `PATCH /api/staff/:id/active` | `staff.manage` | Activates/deactivates the login. |

## Authorization

Two permissions were added to the existing catalogue: `staff.view` and `staff.manage`. Because `ROLE_PERMISSIONS[Admin]` is the whole catalogue, Admin gets them automatically and Kitchen/Dispatch/Driver do not — so staff management is Admin-only without a single role-name comparison. Enforcement is the global `JwtAuthGuard` (401 when unauthenticated) plus `PermissionsGuard` (403 when the role lacks the permission); the controller only declares `@RequirePermissions(...)`.

Re-running `pnpm db:seed` grants the new permissions, since the seed reconciles role grants.

## Validation and data rules

- **Email** is normalized with a `@Transform` (trim + lowercase) before `@IsEmail`, matching how `AuthService.login` looks users up, so `Admin@Test.com` and `admin@test.com` are the same account. Duplicates are rejected with 409 `STAFF_EMAIL_ALREADY_EXISTS`; a lost race or a duplicate `staffCode` surfaces as 409 from the `P2002` unique violation.
- **Password** is required on create, hashed with the existing `PasswordService` (bcrypt), and never returned. Every query selects columns explicitly, so `passwordHash` is not in any response shape.
- **Role** must reference an existing `Role`; an unknown id is 400 `ROLE_NOT_FOUND`.
- **Active** is a strict boolean; `:id` is validated by `ParseUUIDPipe`.
- Email and password of an existing account are *not* editable through `PATCH /:id` — the global `forbidNonWhitelisted` rule turns an attempt into 400.

## Self-protection (server-side)

Both rules live in `StaffService`, so they hold regardless of what the frontend sends:

- `updateActive` throws `SELF_DEACTIVATION_FORBIDDEN` (403) when the caller targets their own id with `active: false`. Reactivating yourself is still allowed.
- `updateRole` loads the target role's permission keys and throws `SELF_ROLE_DOWNGRADE_FORBIDDEN` (403) if the caller is moving *themselves* to a role that does not grant `staff.manage`. The check is capability-based, so a second admin-like role works fine.

Deactivation needs no extra logic to lock a user out: Step 4's `JwtAuthGuard` re-reads the account on every request, so an existing cookie stops working immediately and login returns the standard 401.

## Files

New: `src/staff/` (`staff.module.ts`, `staff.controller.ts`, `staff.service.ts`, `staff.errors.ts`, DTOs and response types, `staff.service.spec.ts`, `staff.authorization.spec.ts`) and `test/staff.e2e-spec.ts`.

Changed: `src/auth/permissions.ts` (two new keys), `src/app.module.ts` (imports `StaffModule`), `prisma/seed.ts` (the four seeded accounts now also get their `Staff` profile, upserted on the unique `userId` so it stays idempotent).

## Tests

Unit (`pnpm test`, mocked Prisma): pagination `skip`/`take` and meta, no `passwordHash` in the select or the response, password hashing, duplicate email 409, unknown role 400, unknown id 404, profile-only updates, role change, self-downgrade blocked, deactivate/reactivate, self-deactivation blocked. `staff.authorization.spec.ts` asserts every staff route declares a staff permission, writes require `staff.manage`, and only Admin holds those permissions.

End-to-end (`pnpm test:e2e`, seeded database): unauthenticated 401, Kitchen 403 on read and write routes, admin list with pagination, `limit=1000` rejected, create → login works → duplicate 409 → invalid email 400 → unknown role 400, read and 404, profile update (and `email` rejected), role change, deactivate (login then fails) and reactivate, and both self-protection rules including a check that the admin row was not modified.
