# PLAN-B-15 — Testing and Quality

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). A working integration test suite runs offline in a few seconds. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** 🟡 Partly done (MVP) · **Phase:** 1 → 7 (cross-cutting) · **Depends on:** all modules · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [01 Foundation](PLAN-B-01.md) · [02 Contract](PLAN-B-02.md) · [14 Security](PLAN-B-14.md) · [16 CI/CD](PLAN-B-16.md) · client checks in `docs/testing/ux-walkthrough-checklist.md`

## 1. Purpose and scope

How the backend proves it works and keeps working: test layers, tooling, data factories, the shared contract and authorization suites, coverage targets, performance budgets, CI gates, and quality rules for contributors. PROJECT-SPECS section 13 requires testing from Phase 1, not at the end; this plan makes that concrete.

## 2. Test pyramid

| Layer | Tool | What it covers | Share of tests |
| --- | --- | --- | --- |
| **Unit** | Vitest | Pure rules: metrics, status machines, slug/key/cursor/order helpers, validators, token/password utilities | ~60% |
| **Integration (service + database)** | Vitest + `mongodb-memory-server` (single-node **replica set** so transactions work) | Services, repositories, transactions, cascades, indexes, links, events | ~25% |
| **API / HTTP** | Vitest + Supertest against `createApp()` | Routes, validation, envelopes, cookies, CSRF, pagination, rate limits | ~12% |
| **Contract** | Generated from OpenAPI (section 6) | Every operation: schemas, status codes, auth, tenant isolation | automatic |
| **End-to-end** | Playwright against a preview deployment | Core journeys through the real client and API | handful |
| **Manual / exploratory** | Checklists | Real email, real bucket, accessibility with the real API | per release |

## 3. Tooling and environment

- **Vitest** with workspaces (unit vs integration), `--pool=forks` for database tests, V8 coverage.
- **Database:** one `MongoMemoryReplSet` per worker; each test file uses a unique database name; collections are truncated between tests through a helper (never `dropDatabase` mid-suite).
- **External services are injected, not mocked globally:** `createApp({ email, storage, clock })` receives fakes: `InMemoryEmailTransport` (inspectable outbox), `InMemoryStorage` (implements presign/head/delete), and a controllable `Clock` (needed for expiry, lockout, time zones, TTL logic).
- **HTTP fakes** for anything else via `msw`.
- **Time:** tests never use real time for logic; the demo's fixed date (`2026-11-12`) is the default `Clock` for golden tests.
- **Randomness:** seeded where needed for reproducibility; token generators accept an injectable source in tests.
- **Determinism rule:** tests may not depend on order, wall-clock time, network, or the developer's environment variables (`NODE_ENV=test` loads `.env.test` only).

## 4. Factories and fixtures

`Server/test/factories/` provides builders (`buildUser`, `buildWorkspace`, `buildProject`, `buildTask`, …) with valid defaults and overrides, plus `seedDemoWorkspace(ctx)` which loads the typed port of the frontend fixtures (PLAN-B-03 section 10). Rules: tests create data **only** through factories or public services; no hand-written documents; factories always set `workspaceId` from a provided context so tenant tests are easy; a `twoUsers()` helper creates two isolated users with sessions for authorization tests.

## 5. What each module must test (minimum bar)

Every module plan has its own testing section; the common minimum for **every endpoint** is:

1. Happy path with response schema validation.
2. Unauthenticated → `401`.
3. Another user's record → `404` (tenant isolation).
4. Invalid body/query/params → `400` with field details; unknown fields rejected.
5. State rules: archived project (`409`), deleted record (`404`), version conflict (`412`) where applicable.
6. Side effects: Change recorded, links updated, counts/derived values correct.
7. Idempotency where documented.

## 6. Shared suites

### 6.1 Authorization contract suite (blocks merge)

Iterates every operation in `openapi.json`; for each, using `twoUsers()` and the seeded workspace of user A:

- User B calling with A's ids receives `404` (or `401` without a session) — never `200`, `403`, or data.
- User B cannot create records that reference A's records (`projectId`, `milestoneId`, `requirementIds`, `fileIds`, …).
- Route inventory check: the suite fails when a route exists in Express but not in OpenAPI (nothing undocumented) or lacks a declared auth policy.

### 6.2 Schema and envelope contract suite

For each operation: response bodies validate against their declared Zod/OpenAPI schemas; error responses match the envelope; documented status codes are reachable; `Cache-Control: no-store` on authenticated routes; no `x-powered-by`.

### 6.3 Golden metric tests

`GET /home`, `/insights`, project summaries, and the task views are compared with expected outputs derived from the **frontend selectors** run on the same fixtures at the fixed demo date (a script in `Server/test/golden/` generates the expected JSON from `client/src/pages/workspace/data/selectors.js`; regenerated only deliberately and reviewed). This is the safety net for PLAN-B-17's migration.

### 6.4 Redaction suite

Captures logger output across the integration suite and asserts the absence of passwords, tokens, cookies, presigned URLs, and full emails.

### 6.5 Migration suite

Runs every migration twice (idempotent) against seeded data and checks `check:integrity`.

## 7. Specific high-risk test areas

| Area | Tests |
| --- | --- |
| Auth | Timing equalization (tolerance-based), lockout math, token replay, session rotation, CSRF failure modes, cookie flags per environment |
| Concurrency | Parallel `REQ-###` allocation, parallel document saves, stale `If-Match`, double-submitted idempotent creates, two tabs editing a task |
| Transactions | Failure injected mid-cascade leaves no partial state; event recording is atomic with the write |
| Time | Time-zone/DST matrix for overdue/today/calendar; TTL and expiry logic with the controllable clock |
| Links | Illegal pairs, cross-project, duplicates, cascade/restore symmetry, N+1 query-count assertions |
| Storage | Fake-storage flow, lying clients, quota, orphan cleanup |
| Soft delete | Hidden everywhere, restore exactness, slug reuse, purge removes everything |
| Pagination | Equal sort keys across pages, deletion between pages, tampered cursors |
| Input | NoSQL operator injection and `$`-keys in every field, oversized bodies, deeply nested JSON, Unicode edge cases (RTL, emoji, normalization), control characters |

## 8. Coverage and quality gates

| Gate | Threshold |
| --- | --- |
| Line coverage, `modules/**/service.ts` and `shared/**` | ≥ 85% (enforced) |
| Branch coverage on rule-heavy files (status machines, metrics, link validation) | ≥ 90% |
| Endpoint coverage | 100% of operations hit by at least one integration test (checked by the contract runner) |
| Mutation testing (optional, quarterly) | Stryker on `shared/metrics` and the requirement state machine |
| Lint, typecheck | zero errors |
| Flaky tests | none tolerated; a test that fails once without a code change is quarantined **with an issue** within a day |

Coverage is a floor, not a goal; review focuses on behavior-describing test names ("rejects completing a requirement with open criteria").

## 9. Performance and load tests

- **Budgets** (checked in CI against a generated workspace of 5,000 tasks, 500 requirements, 2,000 files, 10,000 changes): `GET /home`, `/insights`, `/tasks/views/today` p95 < 300 ms; list endpoints p95 < 200 ms; writes p95 < 400 ms on the memory server (relative budgets; absolute numbers re-measured on Atlas in preview).
- **Query plans:** `explain()` tests assert index usage for every documented query (PLAN-B-03).
- **Load:** `k6` smoke script (50 virtual users, 2 minutes) against preview before each release; watch connection counts on Atlas (risk R1).
- **Cold start:** measured in preview and recorded in `LOG.md` per release.

## 10. End-to-end tests

Playwright, run against the preview deployment on `main` (not on every PR):

1. Register → verify (test inbox) → log in → create project from template → add task with Quick add → complete it → see Home update.
2. Create requirement → link task → upload file (small) → mark Final → requirement gap disappears → History shows the changes.
3. Edit a document twice → diff shows changes → finalize → edit blocked.
4. Delete project → Undo → everything is back.
5. Log out → protected routes redirect to login.
6. Accessibility smoke with `axe` on key pages against real data.

## 11. CI pipeline (GitHub Actions)

Per pull request (target < 8 minutes): install (`npm ci`) → lint → typecheck → unit + integration + API tests with coverage → contract suites → OpenAPI export diff check → `npm audit --omit=dev` → `gitleaks` → build. On `main`: deploy preview, run migrations dry-run, run E2E and the k6 smoke script, publish coverage summary. Required checks protect `main` (PLAN-B-14 section 11).

## 12. Quality practices

- Conventional, descriptive test names; one behavior per test; arrange/act/assert.
- Tests live beside the module (`modules/<m>/__tests__`) plus shared suites in `test/`.
- Bug fixes start with a failing test.
- Reviews check: authorization test present, derived values via shared functions, documentation updated (Definition of Done in PLAN-B-00 section 14).
- A `Server/TESTING.md` explains how to run the suites, how to add a factory, and how to debug a failing replica-set test; linked from `CONTRIBUTING.md`.

## 13. Implementation tasks

- [ ] Vitest config, replica-set helper, truncation helper, controllable clock (Phase 1).
- [ ] Fakes: email, storage, clock; app factory overrides (Phase 1).
- [ ] Factories and demo seed (Phase 1, extended per module).
- [ ] Authorization and schema contract suites (Phase 1, run on every route from the first one).
- [ ] Golden-metric generator from frontend selectors (Phase 3).
- [ ] Redaction and migration suites (Phase 2 / when first migration lands).
- [ ] Performance generator, budgets, k6 script (Phase 7, with a smoke version earlier).
- [ ] Playwright journeys (Phase 3 onward, completed Phase 7).
- [ ] CI workflows, coverage reporting, `TESTING.md`.

## 14. Acceptance criteria

1. A new contributor runs `npm test` after `npm install` and gets a green run in under five minutes with no external services.
2. Adding a route without OpenAPI documentation or without an authorization policy fails CI.
3. The golden tests prove API-derived numbers equal the frontend selectors' numbers for the demo dataset.
4. Coverage gates are enforced and reported on every PR.
5. The E2E journeys pass against a preview deployment before every release.

## 15. Open questions

- Whether to run the integration suite against a real Atlas dev cluster nightly in addition to the memory server (catches driver/server-version differences).
- Whether to adopt Stryker mutation testing early; default: later, on the metrics and state machines only.

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, built 2026-11-16 · A working integration test suite runs offline in a few seconds.

**Built**

- Vitest + Supertest + an in-memory MongoDB; 19 tests across auth, isolation, projects, milestones, tasks, requirements and links, documents, files, Home/Insights/search (`npm test`).
- Manual browser check of login, register, empty workspace, new project, Quick add, requirements, library note, and task completion against the real API.

**Not built yet**

- Separate unit tests, shared authorization contract suite, golden metric tests, coverage gates, performance budgets, Playwright journeys, CI workflow.
