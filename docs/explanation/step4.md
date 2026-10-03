# Step 4 — Authentication and RBAC

## 1. What this step adds

Staff can log in, the API knows who is calling, and every route states what permission it needs. Nothing business-specific was built: the only endpoints are login, logout and "who am I".

```
POST /api/auth/login    public      email + password -> httpOnly cookie
POST /api/auth/logout   public      clears the cookie
GET  /api/auth/me       profile.read   caller + the permissions their role grants
GET  /api/health        public      unchanged from Step 1
```

## 2. Authentication

**Login.** `AuthController.login` validates a `LoginDto` (`email`, `password`) through the global `ValidationPipe`, then `AuthService.login` looks the user up by lower-cased email, checks `active`, and compares the password against the stored bcrypt hash via `PasswordService`. On success it signs a JWT whose payload is just `{ sub, email }`.

**Token delivery.** The token is written to an `httpOnly` cookie (`fernleaf_token`) with `sameSite: 'lax'`, `path: '/'`, `maxAge` of 12 hours, and `secure: true` when `NODE_ENV=production`. It is **never** put in the response body, so page scripts cannot read it and an XSS bug cannot exfiltrate it. The login response contains only `id`, `email`, `roleId`, `roleName` — the object is assembled field by field in `AuthService`, so a `passwordHash` cannot leak by accident.

**Expiry.** 12 hours, defined once in `auth.constants.ts` (`TOKEN_TTL_SECONDS`) and used for both the JWT `expiresIn` and the cookie `maxAge`, so the cookie and the token can never disagree.

**Secret.** `JwtModule.registerAsync` reads `JWT_SECRET` through the existing `ConfigService` (validated at startup in Step 2 as at least 32 characters). No secret appears in source or logs.

**`JwtAuthGuard`.** Registered globally, so **authentication is the default** and a route has to opt out explicitly with `@Public()`. It reads the token from the cookie, falling back to an `Authorization: Bearer` header for API clients and tests, verifies it, then re-reads the user from the database. That extra read is deliberate: a deactivated account loses access on the next request instead of when its token expires. The resolved user is attached to `request.user`.

**`@CurrentUser()`.** A param decorator returning the `AuthenticatedUser` from the request. If there is no user it throws rather than returning `undefined`, so it cannot silently be used on a public route.

**Logout.** Clears the cookie with the same attributes it was set with (minus `maxAge`), and returns 204. It is public because clearing a cookie needs no valid session.

**Errors.** Step 2's domain error system gained an `unauthorized` kind mapped to 401, and `auth.errors.ts` defines `InvalidCredentialsError` (`INVALID_CREDENTIALS`), `MissingAuthenticationError` (`UNAUTHENTICATED`), `InvalidTokenError` (`INVALID_TOKEN`) and `InsufficientPermissionsError` (`INSUFFICIENT_PERMISSIONS`, 403). The global exception filter turns them into the standard body with `statusCode`, `code`, `message` and `requestId`. An unknown email, a wrong password and a deactivated account all produce the *same* error, so the endpoint cannot be used to enumerate valid staff accounts, and the real reason a token failed (expired, malformed, bad signature) is never echoed back.

## 3. RBAC

Authorization is permission-based. There is no `if (user.role === 'ADMIN')` anywhere — role names only exist in the seed and as a display field.

```
@RequirePermissions('orders.edit')
```

- **`@RequirePermissions(...)`** stores the required keys as route metadata. Keys come from the `PERMISSIONS` catalogue, so the decorator is type-checked and a typo is a compile error. Several permissions may be listed; all of them are required (AND).
- **`PermissionsGuard`** is registered globally, after `JwtAuthGuard`. If a route declares no permissions it allows the request; otherwise it resolves the caller's permissions and throws `InsufficientPermissionsError` (403) when any are missing. Because it runs after authentication, a missing token is already a 401 — the two statuses never get confused.
- **`PermissionService`** resolves permissions with one Prisma query that walks `User → Role → RolePermission → Permission` (and ignores inactive users). Permissions are read per request rather than baked into the token, so revoking a permission takes effect immediately.

Both guards are provided with `APP_GUARD` inside `AuthModule`, in that order, so enforcement is server-side and global rather than something each controller has to remember.

## 4. Staff accounts and the seed

`prisma/seed.ts` seeds the permission catalogue, the four roles with their grants, and the four logins (all with password `Test@1234`):

| Account | Role | Permissions |
| --- | --- | --- |
| `admin@test.com` | Admin | everything in the catalogue |
| `kitchen@test.com` | Kitchen | `profile.read`, `orders.view`, `kitchen.view`, `kitchen.update` |
| `dispatch@test.com` | Dispatch | `profile.read`, `orders.view`, `dispatch.view`, `dispatch.manage`, `delivery.view` |
| `driver@test.com` | Driver | `profile.read`, `delivery.view`, `delivery.update` |

**Idempotency.** Every write is an upsert keyed on a natural unique column (`Permission.key`, `Role.name`, `User.email`, and the `RolePermission` composite key), so re-running creates nothing new. Two details make it actually converge:

- Role grants are **reconciled**, not appended: after upserting the intended grants, any other grant for that role is deleted. Without this, removing a permission from the catalogue would leave the old grant in place forever.
- A user's password is only re-hashed when `bcrypt.compare` shows the stored hash no longer matches the seed password. Comparing hashes directly would always differ (bcrypt salts every hash) and would rewrite the row on every run.

Run it with `pnpm db:seed`; it is also wired into `prisma.config.ts` as the Prisma seed command.

## 5. Tests

Unit tests (`pnpm test`, no database):

- `password.service.spec.ts` — hashing, verification, wrong password, salting.
- `auth.service.spec.ts` — valid login, unknown email, wrong password, deactivated account, no hash in the result, and that all three failures are indistinguishable.
- `permission.service.spec.ts` — the role→permission query shape, all-required semantics, no query when nothing is required.
- `jwt-auth.guard.spec.ts` — no token, cookie token, bearer fallback, expired/garbage token, deleted user, deactivated user, `@Public()` bypass.
- `permissions.guard.spec.ts` — allow with permission, 403 without, multiple required permissions, unauthenticated request.
- `permissions.spec.ts` — the role matrix: Admin has everything, Kitchen/Dispatch/Driver cannot reach each other's permissions, `users.manage` is Admin-only.
- `route-permission-coverage.spec.ts` — walks the module graph by reflection and fails if any route is neither `@Public()` nor permission-protected, or is both. It also pins the list of public routes, so making a new route public is a deliberate, reviewable change rather than an oversight.

End-to-end tests (`pnpm test:e2e`, needs a seeded database):

- `auth.e2e-spec.ts` — login sets an httpOnly cookie and returns no token or hash; wrong password and unknown email both 401; protected route without a token 401; garbage token 401; `/auth/me` returns the caller and their permissions; health stays public; the four accounts are checked against test-only probe routes so Kitchen gets 403 on a dispatch route and Driver gets 403 on both; logout clears the cookie.
- `seed.e2e-spec.ts` — the four accounts exist with the right roles, each role has exactly its expected permissions, the roles are isolated from each other, and running the seed twice more changes no counts.

## 6. Request lifecycle with auth

```
Request
  v
Request ID middleware        (Step 2)
  v
cookie-parser                 (reads fernleaf_token)
  v
JwtAuthGuard                  @Public() ? pass : verify token -> request.user   -> 401
  v
PermissionsGuard              @RequirePermissions(...) -> PermissionService      -> 403
  v
ValidationPipe -> Controller -> Service -> Prisma -> PostgreSQL
  v
Logging interceptor -> Response        (errors exit via the global filter)
```

## 7. Files

Created: `src/bootstrap.ts` (shared app configuration used by `main.ts` and the e2e tests), `src/common/errors/unauthorized-domain-error.ts`, `src/auth/*` (module, controller, `AuthService`, `PasswordService`, `PermissionService`, constants, permission catalogue, errors, DTOs, `JwtAuthGuard`, `PermissionsGuard`, `@Public`, `@RequirePermissions`, `@CurrentUser`, types), `prisma/seed.ts`, and the specs listed above.

Changed: `src/main.ts` (delegates to `configureApp`), `src/app.module.ts` (imports `AuthModule`), `src/health/health.controller.ts` (`@Public()`), `src/config/swagger.ts` (cookie auth), `src/common/errors/*` (new `unauthorized` kind → 401), `prisma.config.ts` (seed command), `package.json` (`@nestjs/jwt`, `bcryptjs`, `cookie-parser`, `tsx`, `db:seed`).

Removed: `test/app.e2e-spec.ts`, which asserted a `GET /` "Hello World" route that this application never mounted.

## 8. Decisions

- **Permissions in the database, not in the token.** One extra query per request buys immediate revocation. If it ever shows up in profiling, a short-lived per-request cache is a local change inside `PermissionService`.
- **Cookie, not `Authorization` header, as the primary transport.** `httpOnly` means JavaScript cannot read the token, which is the main protection against XSS token theft. The Bearer fallback exists for tooling.
- **Global guards with explicit opt-out.** If authentication were opt-in, a forgotten decorator would silently publish an endpoint. With global guards plus the coverage test, forgetting authorization fails the test suite.
- **`bcryptjs` rather than `bcrypt`.** Same algorithm and hash format, but pure JavaScript, so there is no native build step on Windows. The cost factor (12) lives in one constant.
- **`/auth/me` requires `profile.read` rather than "just being logged in".** It keeps the rule "every route declares a permission or is public" absolute, which is what the coverage test can actually enforce.
- **No `Staff` rows in the seed.** `User` carries the login and role; `Staff` is the operational profile from Step 3 and nothing in this step needs it yet.
