# Step 2 — NestJS API Foundation

## 1. Why this step exists

Step 1 produced a working skeleton: a NestJS app, a Prisma connection to PostgreSQL and a `/api/health` endpoint. Step 2 does not add any business feature. It builds the *shared plumbing* that every future module (Companies, Employees, Catalogue, Orders, Kitchen, Billing) will reuse:

- one way to read and validate configuration,
- one way to validate incoming request payloads,
- one way to express business failures (domain errors),
- one error response shape for the whole API,
- one request identifier that ties a client-visible response to a server log line,
- one place that logs method/path/status/duration,
- one pagination contract for list endpoints,
- one place that documents the API (Swagger).

Doing this once, up front, means the domain modules stay small: a service throws `ConflictDomainError` and the infrastructure turns it into a correct HTTP 409 with a stable error code. Without this foundation each module would invent its own error shapes, its own pagination keys and its own logging, and the API would become inconsistent for the frontend.

## 2. Configuration

Two pieces work together:

- **`@nestjs/config`** loads environment variables (from the process environment and the `.env` file) and exposes them through the injectable `ConfigService`. It is registered with `isGlobal: true`, so any module can inject `ConfigService` without importing `ConfigModule` again.
- **Zod** describes the *shape* those variables must have. `ConfigModule.forRoot({ validate })` calls our `validateEnv()` function once, during module initialisation, before any provider is constructed.

```ts
ConfigModule.forRoot({
  isGlobal: true,
  cache: true,
  validate: validateEnv,
});
```

`validateEnv()` runs `envSchema.safeParse(...)`. On failure it throws an error listing the offending variable **names and reasons only** — never their values, because those values are connection strings and secrets. On success it returns the parsed object, and `ConfigService` serves those parsed values first, so `configService.get('PORT')` returns a real `number`, not the string `"3001"`.

**Why validate at startup (fail fast)?** A missing or malformed variable is a deployment mistake. If we only discovered it when the first request touched the database, we would get a confusing 500 in production, possibly hours later. Validating at boot means the process refuses to start with a precise message — the failure happens where it can still be fixed cheaply.

**Why no hardcoded secrets?** Secrets in source control leak through git history, forks, CI logs and screenshots, and they cannot be rotated per environment. The code only ever reads secrets from the environment; `.env.example` holds placeholders so a new developer knows which variables to set, and the real `.env` is git-ignored.

Validated variables:

| Variable | Rule | Why |
| --- | --- | --- |
| `NODE_ENV` | one of `development` \| `test` \| `production`, default `development` | Guards environment-specific behaviour; an unexpected value like `prod` would silently disable production safeguards. |
| `PORT` | integer 1–65535, coerced from string, default `3001` | Environment variables are always strings; coercion keeps the rest of the code typed as `number`. |
| `TIMEZONE` | non-empty string | Kitchen operations are date/shift based, so the server must have one declared timezone. Validated as a non-empty string for now; it can be tightened to a real IANA zone later. |
| `APP_URL` | valid URL | Public base URL of the web app, used for links and later for CORS. |
| `DATABASE_URL` | non-empty `postgres://` / `postgresql://` URL | The runtime connection used by Prisma. |
| `DIRECT_URL` | non-empty `postgres://` / `postgresql://` URL | A non-pooled connection, used by migration tooling when the runtime connection goes through a pooler. Locally it may point at the same database. |
| `JWT_SECRET` | string, minimum 32 characters | Needed in a later step for token signing. Validating length now prevents a weak, brute-forceable secret from reaching production. |

`DIRECT_URL` is validated and documented, but Prisma's working configuration from Step 1 was deliberately left alone: the local setup does not use a pooler, so `prisma.config.ts` still uses `DATABASE_URL`. When a pooled hosted database is introduced, the migration datasource can switch to `DIRECT_URL` without touching anything else.

## 3. Prisma

Step 1 already provided the Prisma layer and Step 2 did not recreate it:

- **`PrismaService`** extends `PrismaClient`, is decorated with `@Injectable()`, reads `DATABASE_URL` through the injected `ConfigService`, builds a `PrismaPg` adapter and connects in `onModuleInit()`.
- **`PrismaModule`** declares `PrismaService` as a provider and exports it. It is decorated with `@Global()`.

**Dependency injection.** Nothing calls `new PrismaClient()`. Nest creates a single `PrismaService` instance and injects it wherever it is requested (`constructor(private readonly prisma: PrismaService) {}`). That single instance means one connection pool, and it makes services testable: a test can provide a fake `PrismaService` instead.

**Why global?** Practically every future module needs database access. Without `@Global()`, each module would have to import `PrismaModule`, which is pure boilerplate. The module is infrastructure with no business meaning, so making it global is a reasonable exception to strict module boundaries.

**The PostgreSQL driver adapter.** Prisma 7 talks to PostgreSQL through a driver adapter: `PrismaPg` wraps the `pg` driver and is handed to the `PrismaClient` constructor. So the path from HTTP to the database is: controller → service → `PrismaService` (a `PrismaClient`) → `PrismaPg` adapter → `pg` → PostgreSQL.

No repositories, domain models or schema changes were added in this step.

## 4. Global ValidationPipe

Registered in `main.ts`:

```ts
app.useGlobalPipes(
  new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
  }),
);
```

- **`whitelist: true`** strips any property that has no validation decorator on the DTO. Unknown input never reaches a service or Prisma.
- **`forbidNonWhitelisted: true`** goes further: instead of silently stripping unknown properties, the request is rejected with 400. A typo like `limt=50` fails loudly rather than being ignored.
- **`transform: true`** turns the plain incoming object into an instance of the DTO class and applies `class-transformer` conversions, so `?page=2` becomes the number `2`.

Example with `PaginationQueryDto`:

- `GET /api/companies?page=2&limit=10` → DTO instance with `page = 2`, `limit = 10` (numbers).
- `GET /api/companies` → defaults `page = 1`, `limit = 20`.
- `GET /api/companies?limit=1000` → 400, limit above the maximum.
- `GET /api/companies?secret=1` → 400, property `secret` is not allowed.

No business DTOs were created in this step; only the reusable pagination DTO.

## 5. Domain Errors

`src/common/errors/` defines a small hierarchy:

- **`DomainError`** — abstract base extending `Error`. It carries a machine-readable `code`, a human-readable `message`, optional non-sensitive `details`, and a `kind` discriminator.
- **`ValidationDomainError`** (`kind: 'validation'`) — the request is well formed but breaks a business rule.
- **`NotFoundDomainError`** (`kind: 'not_found'`) — the requested entity does not exist.
- **`ConflictDomainError`** (`kind: 'conflict'`) — the operation conflicts with current state (duplicate, locked record).
- **`ForbiddenDomainError`** (`kind: 'forbidden'`) — the caller is known but not allowed.

Usage in a future module:

```ts
throw new ConflictDomainError({
  code: 'PREP_UNIT_LOCKED',
  message: 'This combination cannot be changed because preparation has started.',
});
```

`PREP_UNIT_LOCKED` is only an illustration — Step 2 ships the mechanism, not the rule.

**Why keep them away from HTTP?** A service that throws `ConflictException` is making a transport decision in the middle of business logic. That hurts in three ways: the same rule reused from a queue consumer, a cron job or a CLI script would carry HTTP semantics it cannot honour; unit tests have to assert on HTTP statuses instead of business meaning; and the status/code mapping ends up scattered across dozens of services. Here, the error classes know *what* went wrong (`kind` + `code`); only `domain-error-status.ts` and the exception filter know what that means over HTTP. One file to change if a mapping should change.

## 6. Global Exception Filter

`AllExceptionsFilter` (`@Catch()` with no arguments, registered through the `APP_FILTER` provider in `CommonModule`) is the single exit point for errors.

**Why centralised?** Otherwise every controller needs try/catch, the frontend has to handle several error shapes, and sooner or later a raw stack trace or a Prisma error containing the connection string reaches a client. One filter guarantees one contract and one redaction policy.

How errors become responses:

1. **`DomainError`** → status from `kind` (`validation` → 400, `not_found` → 404, `conflict` → 409, `forbidden` → 403), with the domain `code` and `message` preserved.
2. **`HttpException`** (including the 400 produced by `ValidationPipe` and Nest's own 404 for unknown routes) → its status is kept, `code` is derived from the status name (e.g. `NOT_FOUND`), and `class-validator` constraint messages are returned under `details.errors`.
3. **Anything else** (a bug, a Prisma failure, a `TypeError`) → a fixed generic 500. The original error, including its stack, is logged server-side with the request id and never sent to the client.

Response contract:

```json
{
  "statusCode": 409,
  "code": "PREP_UNIT_LOCKED",
  "message": "This combination cannot be changed because preparation has started.",
  "requestId": "0f2b1c54-..."
}
```

```json
{
  "statusCode": 500,
  "code": "INTERNAL_SERVER_ERROR",
  "message": "An unexpected error occurred.",
  "requestId": "0f2b1c54-..."
}
```

`requestId` is read from the request object, where the request id middleware put it. That is what makes the generic 500 debuggable: the client reports the id, and the full stack trace is found in the logs under the same id.

## 7. Request ID

A request id is a short opaque identifier assigned to every single HTTP request.

**Why it helps.** Logs from many concurrent requests interleave. With a request id, every log line belonging to one request can be grepped together, and because the id is also in the error response and in the `X-Request-ID` response header, a screenshot from a user is enough to find the exact server-side failure — without exposing a stack trace.

Flow:

1. `requestIdMiddleware()` runs before routing (registered with `app.use()` in the bootstrap).
2. If the incoming request already carries `x-request-id` and it matches a conservative pattern (8–128 characters of `A–Z a–z 0–9 . _ -`), it is reused — this is how a frontend-generated id survives into the backend logs. Anything longer or containing other characters is discarded and replaced, so an attacker cannot inject newlines or megabytes of text into our log files.
3. Otherwise a `crypto.randomUUID()` is generated.
4. The id is attached as `req.requestId` and set on the response as `X-Request-ID`.
5. The logging interceptor and the exception filter read it through the `getRequestId(req)` helper.

This is deliberately *not* distributed tracing: no trace context propagation, no spans, no exporters.

## 8. Logging/Timing Interceptor

An **interceptor** in NestJS wraps the handler: it runs code before the controller method is called and can act on the returned stream afterwards. That makes it the natural place for cross-cutting concerns that need to see both sides of a request — timing, logging, response shaping.

`LoggingInterceptor` records the start time, lets the handler run, and on completion (or on error) emits one line through the Nest `Logger`:

```
[HTTP] GET /api/health 200 14ms requestId=0f2b1c54-...
```

It logs the HTTP method, the path without its query string, the response status, the duration in milliseconds and the request id. On the error path the status is derived from the thrown error (domain errors use the same mapping as the filter), so the log agrees with what the client received.

**What is not logged, and why.** No request bodies, no headers, no query values. Bodies contain passwords and personal data; headers contain `Authorization` and cookies; query strings sometimes contain tokens. Logs are copied into aggregators, shared in tickets and kept for a long time — anything logged must be assumed to be readable by people who should not see credentials. Secrets such as `JWT_SECRET` and `DATABASE_URL` are never logged either; the environment validation error messages mention variable names only.

## 9. Pagination

`src/common/pagination/` provides:

- **`PaginationQueryDto`** — `page` (integer, minimum 1, default 1) and `limit` (integer, minimum 1, maximum 100, default 20), plus `skip`/`take` getters that map directly onto `prisma.findMany({ skip, take })`.
- **`PaginationMeta`** — `page`, `limit`, `total`, `totalPages`.
- **`PaginatedResponse<T>`** — `{ data: T[]; meta: PaginationMeta }`.
- **`buildPaginationMeta()` / `paginate()`** — compute `totalPages = ceil(total / limit)` and wrap a result set in the envelope.

Meaning of the fields: `page` is the 1-based page requested, `limit` is the page size, `total` is the number of matching rows in the database (not in the page), and `totalPages` is derived from `total` and `limit` so the UI can render a pager without extra maths.

```json
{
  "data": [],
  "meta": { "page": 1, "limit": 20, "total": 150, "totalPages": 8 }
}
```

**Why pagination is necessary.** Order, employee and billing tables grow without bound. An unpaginated list endpoint eventually loads tens of thousands of rows into memory, serialises them all and times out the browser. A maximum limit also protects the server from a client asking for everything in one request.

**Why it is shared infrastructure.** Every list endpoint has the same need. Defining the query DTO and the response envelope once means all modules validate the same way, the frontend writes one pagination hook, and the Swagger documentation is consistent. Step 2 ships only the contract — no database queries yet.

## 10. Swagger

Swagger (the tooling around the **OpenAPI** specification) generates a machine-readable description of the API from the code and serves an interactive UI from it.

Why it is useful here: the frontend developer can see the real request and response shapes instead of asking; endpoints can be tried out from the browser without writing curl commands; and because the document is generated from the controllers and DTOs, it cannot drift from the implementation the way a hand-written document would.

Configuration lives in `src/config/swagger.ts`: title *Fernleaf Kitchen API*, a short description, version `0.1.0`. The UI is mounted at the path `docs` with `useGlobalPrefix: true`, so it reuses the existing `/api` prefix instead of hardcoding it — which is what would produce a wrong `/api/api/docs`. The final URL is:

```
http://localhost:3001/api/docs
```

Only what exists today is documented: the health endpoint. No future business endpoints were invented.

## 11. Request lifecycle

```
Request
  |
  v
Request ID Middleware        (assign/reuse X-Request-ID, set response header)
  |
  v
Logging/Timing Interceptor   (start timer, "before" half)
  |
  v
Validation Pipe              (whitelist / forbidNonWhitelisted / transform)
  |
  v
Controller
  |
  v
Service
  |
  v
PrismaService  ->  PrismaPg adapter  ->  pg
  |
  v
PostgreSQL
  |
  v
Logging/Timing Interceptor   ("after" half: method, path, status, duration, requestId)
  |
  v
Response
```

**Where the exception filter participates.** It sits outside the whole chain, as the error path rather than a step in it. If anything from the validation pipe inwards throws — a failed DTO validation, a `DomainError` from a service, a Prisma failure, Nest's own 404 for an unknown route — the normal flow stops and the exception filter builds the response instead:

```
Validation Pipe / Controller / Service / Prisma  --throws-->  AllExceptionsFilter
                                                                    |
                                      (statusCode, code, message, requestId)
                                                                    v
                                                                 Response
```

The interceptor still sees the error (it logs the failing request), and the request id middleware has already set the `X-Request-ID` header, so even a 500 response is traceable. Errors thrown inside the middleware itself are the one thing outside the filter's reach — which is why that middleware is kept trivial.

## 12. Files created/changed

Created:

| File | Responsibility |
| --- | --- |
| `apps/api/src/config/env.schema.ts` | Zod schema for the environment, plus the inferred `Env` type. |
| `apps/api/src/config/env.validation.ts` | `validateEnv()` hook for `ConfigModule`; reports variable names only, never values. |
| `apps/api/src/config/swagger.ts` | Swagger document (title, description, version) mounted at `/api/docs`. |
| `apps/api/src/common/common.module.ts` | Registers the global exception filter and logging interceptor as DI providers. |
| `apps/api/src/common/errors/domain-error.ts` | Abstract `DomainError` with `code`, `message`, `details`, `kind`. |
| `apps/api/src/common/errors/validation-domain-error.ts` | `ValidationDomainError`. |
| `apps/api/src/common/errors/not-found-domain-error.ts` | `NotFoundDomainError`. |
| `apps/api/src/common/errors/conflict-domain-error.ts` | `ConflictDomainError`. |
| `apps/api/src/common/errors/forbidden-domain-error.ts` | `ForbiddenDomainError`. |
| `apps/api/src/common/errors/domain-error-status.ts` | The single `kind` → HTTP status mapping. |
| `apps/api/src/common/errors/index.ts` | Barrel for the error module. |
| `apps/api/src/common/filters/all-exceptions.filter.ts` | Converts domain errors, HTTP exceptions and unknown errors into the one response contract. |
| `apps/api/src/common/interceptors/logging.interceptor.ts` | One log line per request: method, path, status, duration, requestId. |
| `apps/api/src/common/middleware/request-id.middleware.ts` | Assigns/reuses the request id, exposes `getRequestId()`. |
| `apps/api/src/common/pagination/pagination-query.dto.ts` | `PaginationQueryDto` with defaults, bounds and `skip`/`take`. |
| `apps/api/src/common/pagination/paginated-response.ts` | `PaginationMeta`, `PaginatedResponse<T>`, `buildPaginationMeta()`, `paginate()`. |
| `apps/api/src/common/pagination/index.ts` | Barrel for the pagination module. |
| `apps/api/src/common/pagination/pagination.spec.ts` | Unit tests for the pagination DTO rules and meta maths. |
| `docs/explanation/step2.md` | This document. |

Changed:

| File | Change |
| --- | --- |
| `apps/api/src/main.ts` | Request id middleware, global prefix, global `ValidationPipe`, Swagger, typed `PORT`, Nest `Logger` instead of `console.log`. |
| `apps/api/src/app.module.ts` | `ConfigModule` now validates the environment with Zod; imports `CommonModule`. |
| `apps/api/src/health/health.controller.ts` | Swagger tag and documented 200 response; behaviour unchanged. |
| `apps/api/package.json` | Added `@nestjs/swagger`, `class-validator`, `class-transformer`, `zod`. |
| `.env.example` | Added `APP_URL`, documented `DIRECT_URL` and `JWT_SECRET`, added local placeholder values. |

Unchanged on purpose: `prisma/schema.prisma`, `prisma.config.ts`, `PrismaModule`, `PrismaService`.

## 13. Interview explanation

"Step 2 is the API foundation — no features, just the infrastructure every module will depend on.

Configuration is centralised: `@nestjs/config` loads the environment and a Zod schema validates it at startup, so a missing `DATABASE_URL` or a weak `JWT_SECRET` stops the process immediately with a message that names the variable but never prints its value. `PORT` is coerced to a number there, so the rest of the code is typed.

Input is handled by a global `ValidationPipe` with `whitelist`, `forbidNonWhitelisted` and `transform`, so unknown fields are rejected rather than silently reaching Prisma.

Errors are modelled in the domain, not in HTTP: services throw `NotFoundDomainError` or `ConflictDomainError` with a machine-readable code, and a single global exception filter maps the error kind to a status and emits one consistent body — `statusCode`, `code`, `message`, `requestId`. Unexpected errors become a generic 500 and are logged server-side, so stack traces and connection strings never leak.

Every request gets a request id — reused from `X-Request-ID` if the client sent a sane one, otherwise generated — which is attached to the request, included in the log line and returned in the response header and error body. A user can quote the id from a failed request and I can find the exact stack trace.

A logging interceptor emits one line per request with method, path, status, duration and request id, and deliberately logs no bodies, headers or tokens.

Pagination is defined once: a validated `page`/`limit` query DTO with sane defaults and a maximum, and a `{ data, meta }` envelope with `total` and `totalPages`, so every list endpoint behaves the same for the frontend.

Finally, Swagger is served at `/api/docs`, generated from the code so the documentation cannot drift.

The result is that a feature module in Step 3 only writes business logic: it throws domain errors, accepts the shared pagination DTO, and gets validation, logging, tracing, error formatting and documentation for free."

## 14. Decisions and tradeoffs

- **Zod instead of `class-validator` for the environment.** `ConfigModule.forRoot({ validate })` wants one function over a plain object, which is exactly Zod's `safeParse`. Zod also gives `z.infer` for a static `Env` type and `z.coerce.number()` for `PORT`, with no decorator class to maintain. `class-validator` is still used for request DTOs, where NestJS's `ValidationPipe` requires it — two libraries, but each in the layer it fits.
- **Environment errors name variables, not values.** A naive validator that echoes the received value would print the database password into the startup logs of a CI job.
- **Filter and interceptor registered as `APP_FILTER` / `APP_INTERCEPTOR` providers in `CommonModule`, not via `app.useGlobalFilters()`.** Both then participate in dependency injection, so a future addition (for example a config-aware logger) can be injected instead of constructed by hand. `ValidationPipe` and Swagger stay in `main.ts` because they are plain bootstrap configuration with no dependencies.
- **`kind` discriminator instead of a status on the error.** Keeping `HttpStatus` out of the error classes is what makes the domain layer reusable outside HTTP; the one mapping table lives in `domain-error-status.ts` and is shared by the filter and the interceptor so logs and responses cannot disagree.
- **Request id middleware as a plain Express handler registered with `app.use()`.** A `NestMiddleware` class would need a wildcard route pattern in `MiddlewareConsumer`, whose syntax is version sensitive; `app.use()` guarantees the middleware runs before routing for every request, including unmatched routes, and the middleware has no dependencies to inject.
- **Incoming request ids are filtered by a strict pattern.** Reusing a client id is useful for end-to-end correlation, but an unchecked header is a log-injection and log-bloat vector, so anything outside 8–128 safe characters is replaced.
- **`forbidNonWhitelisted: true` is strict on purpose.** It will reject requests that an older frontend sends with extra fields. The tradeoff is accepted because silent stripping hides client bugs, and the API and the web app ship together.
- **`DIRECT_URL` validated but not yet wired into Prisma.** It is required by the assignment and will matter behind a connection pooler, but changing the working Step 1 datasource configuration now would be churn with no benefit locally.
- **Pagination verified by a unit test rather than a temporary endpoint.** Adding a throwaway controller just to demonstrate the DTO would be business-free clutter in the API surface; `pagination.spec.ts` proves the defaults, bounds, numeric transformation and `totalPages` maths instead, and the DTO will appear in Swagger as soon as the first real list endpoint uses it.
- **Logging kept to one line per request.** No correlation store, no structured JSON transport, no log shipping — the Nest `Logger` is enough at this stage and can be replaced later without touching the interceptor's call sites.
