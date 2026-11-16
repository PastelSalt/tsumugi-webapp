# PLAN-B-01 — Platform Foundation

**Status:** Proposed · **Phase:** 1 · **Depends on:** — · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [02 API conventions](PLAN-B-02.md) · [03 Data model](PLAN-B-03.md) · [15 Testing](PLAN-B-15.md) · [16 Deployment](PLAN-B-16.md)

## 1. Purpose and scope

Everything every other module stands on: the project layout, configuration loading, the Express application and its serverless entry point, the error system, logging, the database connection, and developer tooling. No business features live here.

**In scope:** repository layout, TypeScript/ESM setup, environment configuration, app factory, platform adapters, middleware order, error classes and handler, logging, health endpoints, MongoDB connection management, scripts, linting, and a minimal CI.
**Out of scope:** authentication (04), route conventions (02), schemas (03), deployment settings (16), tests beyond the harness (15).

## 2. Repository layout

`Server/` is kept (open question Q6). The module layout follows PROJECT-SPECS section 10 with a clear split between application code and platform entry points.

```text
Server/
├── package.json
├── tsconfig.json               strict, ESM, path aliases (@/…)
├── eslint.config.js
├── vitest.config.ts
├── .env.example                every variable, documented, no secrets
├── src/
│   ├── app.ts                  createApp(): Express — no listen(), no platform code
│   ├── server.ts               local entry: loads env, connects DB, app.listen
│   ├── config/
│   │   ├── env.ts              Zod-validated environment (single read of process.env)
│   │   └── constants.ts        limits, TTLs, retention windows
│   ├── platform/
│   │   ├── vercel.ts           serverless handler wrapping createApp()
│   │   └── db.ts               cached connection (section 6)
│   ├── middleware/
│   │   ├── request-id.ts
│   │   ├── security-headers.ts
│   │   ├── cors.ts
│   │   ├── body-limit.ts
│   │   ├── request-log.ts
│   │   ├── rate-limit.ts       (policy in PLAN-B-14)
│   │   ├── session.ts          (PLAN-B-04)
│   │   ├── validate.ts         (PLAN-B-02)
│   │   └── error-handler.ts
│   ├── modules/                one folder per business domain (PLAN-B-04 … 13)
│   │   └── <module>/{routes,controller,service,repository,model,schemas,events}.ts
│   ├── shared/
│   │   ├── errors/             AppError and subclasses
│   │   ├── validation/         shared Zod pieces (objectId, date, pagination)
│   │   ├── vocab.ts            status/priority/kind constants
│   │   ├── events.ts           typed in-process domain event bus
│   │   └── utils/
│   └── openapi/                generated spec and registry (PLAN-B-02)
├── scripts/                    seed, migrate, indexes, export-openapi, integrity-check
└── test/                       harness, factories, integration, contract
```

If the entry point must live at the repository root for Vercel (`api/index.ts`), it is a one-line re-export of `Server/src/platform/vercel.ts` (decided in PLAN-B-16).

## 3. Tooling and scripts

| Item | Decision |
| --- | --- |
| Package manager | npm, `package-lock.json` committed, Node version pinned in `.nvmrc` and `engines` |
| TypeScript | `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, ESM (`"type": "module"`); the current CommonJS `package.json` is replaced |
| Dev runner | `tsx watch src/server.ts` |
| Build | `tsc -p tsconfig.build.json` → `dist/` (typecheck-only for Vercel, which bundles TypeScript itself) |
| Lint / format | ESLint flat config consistent with the client; Prettier; `eslint-plugin-security` and `no-restricted-imports` to enforce layering (modules must not import each other's `model.ts`/`repository.ts`) |
| Pre-commit | optional `lint-staged`; CI is the enforcement point |

Scripts (`Server/package.json`): `dev`, `build`, `start`, `typecheck`, `lint`, `test`, `test:watch`, `test:integration`, `openapi:export`, `db:seed`, `db:indexes`, `db:migrate`, `check:integrity`.

## 4. Configuration

All configuration enters through `config/env.ts`, which parses `process.env` with Zod **once at startup** and exports a frozen, typed object. Any missing or malformed required value aborts startup with a readable list of problems (no values printed).

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | yes | `development` / `test` / `production` |
| `PORT` | no (3001) | Local listen port |
| `MONGODB_URI` | yes | Atlas or local connection string |
| `MONGODB_DB_NAME` | no | Override database name (per environment) |
| `AUTH_SECRET` | yes (≥ 32 bytes) | HMAC key for token hashing and CSRF tokens |
| `SESSION_COOKIE_NAME` | no | Default `tsumugi_sid` (`__Host-` prefix in production) |
| `CLIENT_ORIGIN` | yes | Allowed origin(s), comma-separated, exact match |
| `APP_URL` | yes | Public base URL for links in emails |
| `EMAIL_PROVIDER`, `EMAIL_API_KEY`, `EMAIL_FROM` | production | Transport selection (`console` in dev) |
| `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY` | for files | S3-compatible storage |
| `LOG_LEVEL` | no | `info` default |
| `RATE_LIMIT_DISABLED` | test only | Ignored unless `NODE_ENV=test` |
| `CRON_SECRET` | production | Authenticates scheduled-function calls (PLAN-B-16) |

Rules: `.env` files are git-ignored; `.env.example` is complete and commented; production and preview use separate values (release criterion); secrets are never logged, returned, or placed in URLs.

## 5. Application factory and middleware order

`createApp(deps?)` builds the Express instance and returns it. It accepts optional dependency overrides (email transport, storage client, clock) so tests never reach external services.

Order (fixed; changing it requires updating this plan):

1. `trust proxy` configured for Vercel (so `req.ip` and secure-cookie logic are correct).
2. **Request id**: accept a sane inbound `X-Request-Id` or generate a UUID; echo in the response.
3. **Security headers** (`helmet`: no `X-Powered-By`, HSTS in production, `nosniff`, `frame-ancestors 'none'`, referrer policy, a strict API-appropriate CSP).
4. **CORS**: allow-list from `CLIENT_ORIGIN`, `credentials: true`, explicit methods and headers (`Content-Type`, `Idempotency-Key`, `If-Match`, `X-CSRF-Token`), `Vary: Origin`.
5. **Body parsing**: JSON only, 1 MB limit, `strict: true`; other content types rejected with `415`.
6. **Request log** (start/finish with duration, status, route pattern, request id).
7. **Rate limit** (global coarse limit; route-specific limits attach later, PLAN-B-14).
8. **Session loader** (reads cookie, attaches `req.auth` or none; PLAN-B-04).
9. **Routes** mounted under `/api/v1`.
10. **404 handler** returning the standard error envelope.
11. **Error handler** (last).

## 6. Database connection

Serverless instances can start many times; connections must be reused and bounded.

- `platform/db.ts` exposes `getDb()`: caches the `mongoose.connect()` promise on `globalThis.__tsumugiDb`; concurrent callers await the same promise.
- Options: `maxPoolSize: 5`, `minPoolSize: 0`, `serverSelectionTimeoutMS: 5000`, `socketTimeoutMS: 20000`, `bufferCommands: false`, `autoIndex: false` in production (indexes are created by `db:indexes`, PLAN-B-03 section 8).
- A failed first connection resets the cache so the next request retries.
- `server.ts` (local) connects before listening; serverless connects lazily at first request.
- `GET /api/v1/health/ready` performs a cheap `ping`; `health/live` never touches the database.
- Graceful shutdown in local mode closes the HTTP server and the connection.

## 7. Error system

One base class and a closed set of subclasses; every thrown error in services is an `AppError` or is converted to `500` by the handler.

| Class | HTTP | `code` | Typical use |
| --- | --- | --- | --- |
| `ValidationError` | 400 | `validation_failed` | Zod failure; carries field `details` |
| `AuthenticationError` | 401 | `unauthenticated` | Missing/expired session |
| `ForbiddenError` | 403 | `forbidden` | Action not allowed (e.g. CSRF, unverified email for a gated action) |
| `NotFoundError` | 404 | `not_found` | Missing **or not visible to caller** (never reveals which) |
| `ConflictError` | 409 | `conflict` / `duplicate` | Unique violation, state conflict |
| `PreconditionFailedError` | 412 | `version_mismatch` | `If-Match` stale |
| `PayloadTooLargeError` | 413 | `payload_too_large` | Body or file limit |
| `UnsupportedMediaTypeError` | 415 | `unsupported_media_type` | Non-JSON body |
| `UnprocessableError` | 422 | `rule_violation` | Valid shape, breaks a business rule (e.g. cross-project link) |
| `RateLimitError` | 429 | `rate_limited` | Includes `Retry-After` |
| `InternalError` | 500 | `internal_error` | Anything unexpected |
| `UnavailableError` | 503 | `unavailable` | Database or storage down |

The error handler: maps Mongoose duplicate-key (`11000`) to `409`, Mongoose/Cast errors to `400`/`404`, Zod to `400`, JSON parse errors to `400`; logs unexpected errors with stack **server-side only**; returns `{ error: { code, message, details?, requestId } }` and never a stack, query, collection name, or secret. Envelope detail is in [PLAN-B-02](PLAN-B-02.md) section 5.

## 8. Logging

- `pino` JSON to stdout (Vercel captures it). Fields: `time`, `level`, `requestId`, `method`, `route` (pattern, not raw URL with ids), `status`, `durationMs`, `userId` (hash or id, never email), `workspaceId`.
- **Never logged:** request bodies, cookies, `Authorization`, passwords, tokens, reset links, file contents, full email addresses (use a masked form).
- Levels: `info` for requests, `warn` for rejected/limited requests and security events, `error` for unexpected failures.
- Security events (login failure, lockout, password change, session revoked) go through a dedicated `securityLog()` helper so they can be routed to alerts later (PLAN-B-16).
- Log sampling for health checks (not logged at `info`).

## 9. Dependency policy

Every runtime dependency needs a one-line reason in `Server/DEPENDENCIES.md`. Prefer the standard library, then well-maintained packages with active security response. Pin exact versions in the lockfile, review updates weekly through Dependabot grouped PRs, and run `npm audit --omit=dev` in CI. Avoid packages needing native builds unless prebuilt for Vercel (Argon2 binding is the only planned exception).

## 10. Health and meta endpoints

| Method and path | Auth | Response |
| --- | --- | --- |
| `GET /api/v1/health/live` | none | `{ data: { status: "ok" } }` |
| `GET /api/v1/health/ready` | none | `{ data: { status: "ok", db: "up" } }` or `503` |
| `GET /api/v1/meta` | none | `{ data: { version, commit, environment } }` (no secrets) |
| `GET /api/v1/openapi.json` | none (non-production) | Generated OpenAPI document |

## 11. Implementation tasks

- [ ] Replace `Server/package.json` with the ESM/TypeScript setup; add tsconfig, ESLint, Vitest, Prettier, `.nvmrc`, `.env.example`.
- [ ] Implement `config/env.ts` with tests for missing/invalid values.
- [ ] Implement `app.ts`, `server.ts`, and `platform/vercel.ts`.
- [ ] Implement middleware 1–7 and 10–11 (session and rate-limit are stubs until PLAN-B-04/14).
- [ ] Implement error classes and handler with tests for every mapping.
- [ ] Implement `platform/db.ts` with a test proving a single connection is reused across calls.
- [ ] Implement logging with a redaction test.
- [ ] Health, meta, 404 handler.
- [ ] Layering lint rule and `DEPENDENCIES.md`.
- [ ] Minimal GitHub Actions workflow: install, lint, typecheck, test, build.
- [ ] Update README, CODEMAP, LOG; replace the "Server" section of the README.

## 12. Testing

- Unit: env parsing, error mapping, request-id handling, redaction.
- Integration: `GET /health/*`, unknown route returns the envelope, oversized body returns `413`, wrong content type returns `415`, CORS allows only configured origins, security headers present.
- Connection reuse test using `mongodb-memory-server`.

## 13. Acceptance criteria

1. `npm run dev` in `Server/` starts the API; `GET /api/v1/health/ready` returns `ok` against a local MongoDB.
2. The same app runs through the serverless handler in a local invocation test.
3. A thrown unexpected error returns a `500` envelope with a request id and **no** stack or message from the underlying error.
4. Starting with a missing required variable fails fast with a clear message.
5. CI runs lint, typecheck, test, build on every pull request and passes.
6. Layering lint rule fails a deliberately bad cross-module import in a test fixture.

## 14. Open questions

- Q6 (folder name and Vercel entry location) in PLAN-B-00.
- Whether to adopt `Fastify` later for performance; not justified for v0.1.
