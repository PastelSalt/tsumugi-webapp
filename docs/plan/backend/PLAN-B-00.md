# PLAN-B-00 — Tsumugi Backend Master Plan

## Plan status

**Revision:** 1 — initial master plan
**Status:** Proposed. Nothing in this plan is implemented; `Server/` contains only a placeholder `package.json`.
**Scope:** The complete technical plan for the Tsumugi backend: architecture, shared conventions, module breakdown, delivery order, and release criteria.
**Audience:** Maintainers and contributors. Each module has its own detailed plan (index in section 4); this document holds everything that is shared between them.
**Source material:** [PROJECT-SPECS.md](../../../PROJECT-SPECS.md) (target architecture), [CONTEXT.md](../../../CONTEXT.md) (decisions on record), [RESEARCH.md](../../../RESEARCH.md), the frontend plans [PLAN-A-01 to PLAN-A-05](../frontend/), and the working demo data model in `client/src/pages/workspace/data/`.

> **Where this plan departs from PROJECT-SPECS.md.** The specification describes ten record types and eleven routes. The shipped frontend deliberately simplified this (PLAN-A-04 Revision 3): **seven record types**, an **individual workspace**, and five destinations. The backend serves the frontend's model, not the original one. Section 6.3 lists every difference. Where the specification and the frontend disagree, the frontend model wins; where the specification adds engineering guidance (security, serverless limits, data-modelling rules), it is kept.

---

## 1. Goals, non-goals, and success measures

### 1.1 Goals

1. Replace the demo's in-memory fixtures with a real, persistent, secure backend that the existing frontend can adopt **without a redesign** (see [PLAN-B-17](PLAN-B-17.md)).
2. Make **traceability** a first-class, server-validated feature: objective → requirement → milestone → task → change → final file, stored as explicit relationships, never as loose text.
3. Keep every derived number (progress, health, overdue, coverage) computed **on the server from stored records** by one documented rule each ([PLAN-B-13](PLAN-B-13.md)).
4. Be **deployable incrementally** to Vercel's serverless model with MongoDB Atlas and S3-compatible storage, and still be runnable locally with one command.
5. Be **safe by default**: backend-enforced authorization on every route, hashed credentials, validated input, no leaked internals ([PLAN-B-14](PLAN-B-14.md)).
6. Be **open-source friendly**: a new contributor can clone, run the API against a local database, and run the tests in under ten minutes.
7. Leave a clean seam for a future **team workspace** without building it now ([PLAN-B-18](PLAN-B-18.md)).

### 1.2 Non-goals (initial release)

- Real-time collaboration, WebSockets, or presence (serverless functions cannot hold persistent connections; see D-12).
- Team workspaces, roles, sharing, comments, or notifications (designed for in [PLAN-B-18](PLAN-B-18.md) and [PLAN-B-19](PLAN-B-19.md), built later).
- A custom workflow builder (predefined templates only; see [PLAN-B-06](PLAN-B-06.md)).
- AI features. Tsumugi must remain fully useful without any AI provider.
- Replacing Git hosting, an IDE, or a file-hosting service (PROJECT-SPECS section 15).

### 1.3 Success measures

| Measure | Target for the first public release |
| --- | --- |
| All frontend demo features work against the real API | 100% of workspace pages; no fixture imports left in `client/src/pages/workspace` |
| Authorization correctness | Every endpoint has an automated test proving another user's data returns `404` |
| API latency (p95, warm, excluding file transfer) | < 300 ms for reads, < 500 ms for writes (REQ-006 style target from the demo) |
| Cold-start overhead on Vercel | < 1.5 s added to first request; no cold-start dependency on slow imports |
| Test coverage | ≥ 85% lines on services, 100% of endpoints exercised by at least one integration test |
| Security | No high or critical findings from `npm audit` and the review in PLAN-B-14 section 12 |
| Recovery | A documented, rehearsed restore from backup (PLAN-B-16) |

---

## 2. Guiding principles

1. **The frontend model is the contract.** Field names, statuses, and derived values follow the demo unless a plan records a reason to change.
2. **Server is the source of truth.** The client never computes a number the server also stores or returns.
3. **Explicit over implicit.** Relationships are stored and validated; statuses come from one small vocabulary; nothing is inferred from text.
4. **Small modules with one owner each.** A module owns its collection, its routes, its rules, and its tests. Modules talk through service functions, never through each other's models.
5. **Stateless by design.** No in-memory sessions, no local disk, no background threads. Anything long-running is a job record processed by a trigger (PLAN-B-19).
6. **History is preserved.** Important changes create change records; deletion is soft first, hard later (section 9).
7. **Boring technology.** Prefer well-supported libraries; every dependency must justify itself (PLAN-B-01 section 9).
8. **Document as we go.** `LOG.md`, `CODEMAP.md`, and `README.md` are updated in the same change as the code ([INSTRUCTIONS.md](../../../INSTRUCTIONS.md)).

---

## 3. Decision record

Decisions are numbered so modules can cite them. Status is **Decided** (apply now), **Default** (apply unless a spike disproves it), or **Open** (needs the owner; listed in section 13).

| ID | Decision | Status | Rationale |
| --- | --- | --- | --- |
| D-01 | **TypeScript (strict), ESM, Node.js 22 LTS** for the backend | Decided | Spec asks for typed code; shared Zod schemas give runtime and static safety. The client stays JavaScript for now; types are shared through generated OpenAPI/Zod output (PLAN-B-02 section 10), not by converting the client. |
| D-02 | **Express 5** as the HTTP framework | Decided | Spec choice; mature; works behind a serverless adapter. |
| D-03 | **MongoDB Atlas + Mongoose 8** | Decided | Spec choice. Atlas free tier for development; transactions available on replica sets. |
| D-04 | **Zod** for all request/response validation, one schema per endpoint, shared with OpenAPI generation | Decided | Single source for validation, types, and docs. |
| D-05 | **Server-side sessions in MongoDB, opaque token in an `HttpOnly; Secure; SameSite=Lax` cookie** | Decided | Matches the demo's recorded decision (task "Choose session strategy": server-side sessions with secure cookies → simple revocation, no tokens in browser storage). Works on serverless because state lives in the database. |
| D-06 | **Password hashing with Argon2id** (`@node-rs/argon2`, prebuilt binaries); `node:crypto` scrypt as fallback if a platform cannot load it | Default | Argon2id is the current OWASP recommendation; prebuilt binaries avoid native build problems on Vercel. |
| D-07 | **REST + JSON** under `/api/v1`, resource-oriented, cursor pagination | Decided | Simple, cacheable, testable; matches TanStack Query style. GraphQL is rejected as unnecessary complexity. |
| D-08 | **Object storage: S3-compatible bucket (Cloudflare R2 by default), browser uploads directly via presigned URLs**; MongoDB stores metadata only | Decided | Vercel Functions cap request bodies at about 4.5 MB; binary files must never pass through the API. R2 has no egress fee. Any S3-compatible provider can be swapped in through env vars. |
| D-09 | **Public IDs are 24-character ObjectId strings**; requirements also get a human key `REQ-###` unique per project; projects get a unique-per-workspace `slug` | Decided | Stable, non-guessable-enough combined with authorization, and friendly keys where people read them. The demo's readable IDs (`project-garden`, `t1`) are fixture-only. |
| D-10 | **Dates:** calendar dates (`due`, `start`, `end`) are `YYYY-MM-DD` strings interpreted in the **user's stored time zone**; instants (`createdAt`, `at`) are UTC ISO-8601 | Decided | Avoids the classic off-by-one-day bug; the demo already uses date-only strings. |
| D-11 | **Every record carries `workspaceId`; every query is scoped by it** through one data-access helper | Decided | Gives the team-workspace seam (`canAccess()` from CONTEXT.md "Known gaps") for free and makes cross-tenant leaks testable. |
| D-12 | **No WebSockets / no persistent workers in v1.** Live-ish needs use polling or revalidation; background work uses scheduled/triggered functions | Decided | PROJECT-SPECS section 7.4 warning. |
| D-13 | **Soft delete first** (`deletedAt`), hard delete by a scheduled purge after a retention window | Decided | Supports Undo, recovery, and the history guarantee. |
| D-14 | **Relationships are stored as edges in a `links` collection** for many-to-many, and as foreign keys for many-to-one; the API presents them as id arrays (`requirementIds`, …) so the frontend shape is unchanged | Decided | Both directions must be queryable and validated (spec section 6); see PLAN-B-03 and PLAN-B-12. |
| D-15 | **Derived values are computed on read** (with an optional cache), never stored as authoritative fields | Decided | One rule, one place; no drift. |
| D-16 | **Monorepo, npm workspaces:** `client/`, `Server/` (kept name for continuity; folder renamed only if the owner asks), plus `packages/` for shared code if needed | Default | Keeps the single-repo story; avoids premature package publishing. |
| D-17 | **Vercel Functions as the first deployment**, behind a thin adapter so Express can move to a container host without code changes | Decided | Spec section 7.4; keeps escape hatch. |
| D-18 | **License: MIT** (already added) | Decided | — |

---

## 4. Module index and delivery order

Every module has its own plan with data model, endpoints, rules, edge cases, tests, tasks, and acceptance criteria.

| Plan | Module | Depends on | Phase |
| --- | --- | --- | --- |
| [PLAN-B-01](PLAN-B-01.md) | Platform foundation (project layout, config, app/serverless entry, errors, logging, DB connection, tooling) | — | 1 |
| [PLAN-B-02](PLAN-B-02.md) | API contract and conventions (REST rules, envelopes, pagination, filtering, idempotency, OpenAPI, client SDK) | 01 | 1 |
| [PLAN-B-03](PLAN-B-03.md) | Data model and persistence (collections, schemas, indexes, links, soft delete, migrations, seeding) | 01 | 1 |
| [PLAN-B-04](PLAN-B-04.md) | Authentication and sessions | 01, 02, 03 | 2 |
| [PLAN-B-05](PLAN-B-05.md) | Users, workspaces, and preferences | 03, 04 | 2 |
| [PLAN-B-06](PLAN-B-06.md) | Projects, phases, and templates | 03, 05 | 3 |
| [PLAN-B-07](PLAN-B-07.md) | Milestones | 06 | 3 |
| [PLAN-B-08](PLAN-B-08.md) | Tasks and subtasks | 06, 07 | 3 |
| [PLAN-B-09](PLAN-B-09.md) | Requirements and acceptance criteria | 06, 07, 08 | 4 |
| [PLAN-B-10](PLAN-B-10.md) | Files and object storage | 06, 12 (links) | 5 |
| [PLAN-B-11](PLAN-B-11.md) | Documents (Markdown, versions) | 06, 10 | 5 |
| [PLAN-B-12](PLAN-B-12.md) | Changes, links, and traceability | 03, 08, 09, 11 | 6 |
| [PLAN-B-13](PLAN-B-13.md) | Home, Insights, and search (derived metrics) | 06–12 | 7 |
| [PLAN-B-14](PLAN-B-14.md) | Security and privacy (cross-cutting) | all | 1 → 7 |
| [PLAN-B-15](PLAN-B-15.md) | Testing and quality (cross-cutting) | all | 1 → 7 |
| [PLAN-B-16](PLAN-B-16.md) | Deployment, operations, and observability | 01 | 1, 7 |
| [PLAN-B-17](PLAN-B-17.md) | Frontend integration and fixture migration | 02, then each module | 3 → 7 |
| [PLAN-B-18](PLAN-B-18.md) | Teams and collaboration (future design) | 05, 12, 14 | Later |
| [PLAN-B-19](PLAN-B-19.md) | Notifications, recurrence, and background jobs (future design) | 08, 16 | Later |

Cross-cutting plans (14, 15, 16) start in Phase 1 and are reviewed again at the end of every phase.

---

## 5. System architecture

### 5.1 Context

```text
 Browser (React SPA, Vite build)
   │  HTTPS, cookie session, JSON            │  HTTPS, presigned URL, file bytes
   ▼                                         ▼
 Vercel (static client + /api/* Functions)   S3-compatible bucket (R2 by default)
   │  Express app via serverless adapter        ▲
   │  Mongoose (pooled, reused per instance)    │ presign / head / delete (server only)
   ▼                                            │
 MongoDB Atlas  ◄──── scheduled functions (purge, cleanup, reminders later)
```

### 5.2 Request lifecycle

1. Platform entry (`api/index.ts`) hands the request to the Express app (`app.ts`), created once per instance.
2. Middleware in fixed order: request id → security headers → CORS → body limit and JSON parse → logging → rate limit → **session loader** → route.
3. Route: **validate** (Zod) → **authorize** (workspace scope + role seam) → **service** (business rules, transactions) → **repository** (Mongoose) → **serialize** (response schema).
4. Errors flow to one error handler that maps domain errors to the error envelope (PLAN-B-02 section 5) and never leaks internals.

### 5.3 Layering rules

| Layer | May call | Must not |
| --- | --- | --- |
| Route / controller | validators, services | touch models, contain business rules |
| Service | repositories, other modules' **services**, the event emitter | import another module's model or express objects |
| Repository | Mongoose models of **its own module** | apply authorization or business rules |
| Shared | pure utilities, error classes, schema helpers | import any module |

### 5.4 Serverless constraints applied everywhere

- The Express app and the Mongoose connection are created at module scope and reused; connection promise is cached on `globalThis` (PLAN-B-01 section 6).
- No local files at runtime, no timers that outlive a request, no in-memory caches that matter for correctness.
- Request body limit 1 MB for JSON; file bytes never go through the API (D-08).
- Maximum function duration is treated as 10 s; any operation that could exceed it is a job (PLAN-B-19) or is paginated.

---

## 6. Shared domain model

### 6.1 Record types

Seven record types, matching the frontend, plus supporting collections.

| Record | Collection | Owner module | Notes |
| --- | --- | --- | --- |
| Workspace | `workspaces` | 05 | One individual workspace per user in v1 |
| User | `users` | 05 (auth fields in 04) | Preferences embedded |
| Session | `sessions` | 04 | TTL-expired |
| Project | `projects` | 06 | Embeds ordered `phases` |
| Milestone | `milestones` | 07 | |
| Task | `tasks` | 08 | Embeds `subtasks` (bounded) |
| Requirement | `requirements` | 09 | Embeds `acceptance` criteria (bounded) |
| File | `files` | 10 | Uploads and external links |
| Document | `documents` + `document_versions` | 11 | Markdown body; shown as a File in the Library |
| Change | `changes` | 12 | Immutable history entries |
| Link | `links` | 12 | Edges for many-to-many relationships |
| Upload intent | `upload_intents` | 10 | Pending uploads; TTL-expired |
| Counter | `counters` | 03 | Per-project `REQ-###` sequence |
| Idempotency key | `idempotency_keys` | 02 | TTL-expired |
| Rate-limit bucket | `rate_limits` | 14 | TTL-expired |
| Job | `jobs` | 19 | Future |

### 6.2 Vocabulary (single source: `shared/vocab.ts`, mirrored from `client/.../data/status.js`)

| Concept | Values |
| --- | --- |
| Project status | `Planning`, `Active`, `On hold`, `Done`; **Archived** is a flag (`archivedAt`), not a status |
| Work status (task) | `To do`, `Doing`, `Done`; **Blocked** is a flag |
| Priority | `normal`, `high` |
| Requirement type | `Functional`, `Non-functional` |
| Requirement status | `Open`, `Met`; **Verified** is a flag |
| Document status | `Draft`, `Final` |
| File kind | `document`, `image`, `media`, `data`, `link` |
| Derived milestone state | `Done`, `Overdue`, `Doing`, `Upcoming` (never stored) |
| Derived project health | `On track`, `At risk` (never stored) |

### 6.3 Differences from PROJECT-SPECS.md

| Specification | This plan | Reason |
| --- | --- | --- |
| `assets` and `documents` collections | `files` (uploads/links) and `documents` (Markdown) stay separate in storage; the API also exposes a merged **Library** view | Storage needs differ (binary vs text + versions); the UI treats them as one "File" |
| `revisions` | `changes` (+ `document_versions` for content) | Frontend renamed it; content history and activity history are separate concerns |
| `activities` collection | Not stored; the activity feed is **derived** from `changes` | Frontend removed activity as a record type |
| Project statuses Idea / Planning / Active / On Hold / Completed / Archived | Planning / Active / On hold / Done + archive flag | Matches the shipped vocabulary |
| Task statuses Backlog / To Do / In Progress / In Review / Blocked / Completed | To do / Doing / Done + Blocked flag | Same |
| Deliverables | A **Final** flag on a file or document | Same |
| Collaborators, assignees | Not in v1 (`workspaceId` seam only) | Individual workspace |
| Kanban view | Client concern; the API just supports `status` filtering and ordering | — |
| React Router, TypeScript, MUI on the client | Unchanged client (history router, JS, custom CSS) | Frontend is built; see PLAN-B-17 |

### 6.4 Relationship map (the traceability graph)

```text
Project.objective ──► Requirement ──(FK milestoneId)──► Milestone
                          ▲  ▲                              ▲
        links: implements │  │ links: satisfies             │ FK milestoneId
                        Task  File/Document ◄── links: attached ── Task
                          ▲        ▲
                          └── Change ──┘   (links: affects; plus recordType/recordId)
```

Rules enforced by the server: both ends of every link belong to the **same workspace and project**; no orphan links after deletion; a **Final** file is the evidence that a requirement is satisfied (PLAN-B-12 section 7).

---

## 7. Cross-cutting conventions

Each convention has a single owning plan; modules must follow it and not restate it.

| Topic | Rule (summary) | Owner |
| --- | --- | --- |
| URL shape | `/api/v1/<plural-noun>[/:id][/<sub-resource>]`; verbs only for non-CRUD actions (`POST /tasks/:id/complete`) | 02 |
| Response envelope | `{ data, meta? }` for success; `{ error: { code, message, details?, requestId } }` for failure | 02 |
| Pagination | Cursor-based, `limit` default 25, max 100 | 02 |
| Idempotency | `Idempotency-Key` header supported on `POST` creates | 02 |
| Concurrency | `ETag` / `If-Match` using a numeric `version` field on mutable records | 02, 03 |
| Validation | Zod, strict objects (unknown keys rejected) | 02 |
| Authorization | Session → user → workspace; every query scoped; foreign records return `404` not `403` | 04, 14 |
| Logging | Structured JSON (pino), request id on every line, no secrets or PII bodies | 01, 16 |
| Time and dates | D-10 | 03 |
| Soft delete | D-13; list endpoints hide deleted by default | 03 |
| Change recording | Services emit domain events; the Changes module subscribes (PLAN-B-12 section 4) | 12 |
| Rate limiting | Per-IP and per-account buckets with strict limits on auth endpoints | 14 |

---

## 8. Technology stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Runtime / language | Node.js 22 LTS, TypeScript (strict, ESM) | D-01 |
| HTTP | Express 5, `helmet`, `cors`, `cookie-parser` | |
| Validation / docs | Zod, `zod-to-openapi` (or equivalent) | D-04 |
| Database | MongoDB Atlas, Mongoose 8 | D-03 |
| Auth | Own session layer, `@node-rs/argon2` | D-05, D-06 |
| Storage | `@aws-sdk/client-s3` + `s3-request-presigner` against R2/S3 | D-08 |
| Email (recovery, verification) | Provider behind an interface (Resend by default), console transport in development | PLAN-B-04 |
| Logging | `pino` | |
| Diff | `diff` (jsdiff) for document comparison | PLAN-B-11 |
| Markdown safety | `marked` + `sanitize-html` or equivalent, server-side validation only; rendering stays on the client | PLAN-B-11 |
| Tests | Vitest, Supertest, `mongodb-memory-server` (replica set mode), `msw` for outside services | PLAN-B-15 |
| Lint / format | ESLint (flat config, same style as client), Prettier | PLAN-B-01 |
| CI | GitHub Actions: lint, typecheck, test, build, audit | PLAN-B-15, 16 |
| Hosting | Vercel (client + Functions), Atlas, R2 | D-17 |

---

## 9. Data lifecycle

| Event | Behavior |
| --- | --- |
| Create | Record gets `createdAt`, `updatedAt`, `version = 1`, `workspaceId` |
| Update | `updatedAt` and `version` increment; a Change is recorded when the record type is change-tracked |
| **Archive** (projects only) | `archivedAt` set; project and its children become read-only for writes except unarchive; hidden from default lists |
| **Delete** | `deletedAt` set; hidden everywhere; restorable (Undo and "Recently deleted") for **30 days**; children are cascaded as soft-deleted with the same `deletedBatchId` so restore is exact |
| **Purge** | Scheduled job hard-deletes records past retention, removes their links, and deletes stored objects |
| **Account export** | Authenticated request produces a JSON (+ file list) bundle of the workspace (PLAN-B-05 section 8) |
| **Account deletion** | Soft-delete account immediately (sessions revoked); full purge after 14 days unless cancelled; matches the Privacy Policy draft (retention periods to be filled in during legal review) |

---

## 10. Delivery plan

Phases are incrementally deployable. Each phase ends with a **release gate**: the listed exit criteria pass, `LOG.md`, `CODEMAP.md`, and `README.md` are updated, and a deployment to a preview environment works.

| Phase | Plans | Outcome | Exit criteria |
| --- | --- | --- | --- |
| **1. Foundation** | 01, 02, 03, 14 (baseline), 15 (baseline), 16 (CI + preview deploy) | A running, tested, deployed "hello" API with the shared conventions in place | `GET /api/v1/health` live on a preview URL; CI green; error envelope, validation, logging, DB connection, and test harness proven by tests |
| **2. Accounts** | 04, 05 | Real registration, login, logout, recovery, sessions, preferences, workspace creation | A user can register, verify, log in, change preferences, log out, and recover a password end to end; auth endpoints rate-limited; account export works |
| **3. Core work** | 06, 07, 08, 17 (projects, milestones, tasks) | Frontend Projects, Tasks, and Home run on the API | Demo flows for projects, milestones, tasks (including Quick add, undo, calendar) work against the API with fixtures removed for those types |
| **4. Specs** | 09 | Requirements with acceptance criteria and gap detection | Specs view runs on the API; requirement status rules enforced |
| **5. Library** | 10, 11 | Files via presigned upload, links, Markdown documents with versions | Upload, download, final flag, and document versioning work; orphaned uploads cleaned up |
| **6. History and traceability** | 12 | Changes, links, "Why it exists / What it becomes" | History view and trace panels run on the API; link validation proven by tests |
| **7. Insights and hardening** | 13, 14 (review), 15 (full), 16 (production), 17 (finish) | Insights/Home metrics, search, security review, production deployment | Release criteria in section 11 all met |
| **Later** | 18, 19 | Team workspace, notifications, recurrence | Separate plans and approvals |

The ordering within a phase follows section 4's dependency column. The first end-to-end vertical slice (register → create project → add task) should be reachable by the end of Phase 3 so the product can be used by its own developers (PROJECT-SPECS principle 8: track Tsumugi's development in Tsumugi).

---

## 11. Release criteria for the first public version (v0.1)

- [ ] Every item in the "Available" list of the README works against the real API, and no fixture import remains in the workspace code.
- [ ] Every endpoint documented in OpenAPI, with request/response schemas generated from the Zod source.
- [ ] Authorization tests: for each endpoint, a second user receives `404` for the first user's records.
- [ ] No endpoint accepts unvalidated input; no stack trace or internal ID ever appears in an error response.
- [ ] Rate limits active on auth, upload-intent, and export endpoints.
- [ ] Backups enabled in Atlas, restore rehearsed once, steps documented (PLAN-B-16).
- [ ] Production and preview environments use **separate** databases, buckets, and secrets.
- [ ] Privacy Policy, Terms, and Cookie policy reviewed and published (they remain drafts until then; the app keeps them `noindex` until published).
- [ ] `npm audit` has no high or critical issues; dependency update policy documented.
- [ ] Documentation current: README, CODEMAP, CONTRIBUTING, LOG, OpenAPI, runbook.

---

## 12. Risk register

| # | Risk | Likelihood | Impact | Mitigation | Plan |
| --- | --- | --- | --- | --- | --- |
| R1 | Cold starts or connection storms on Vercel exhaust Atlas connections | Medium | High | Cached connection on `globalThis`, small pool (`maxPoolSize` ≈ 5), Atlas connection monitoring, lazy-load heavy modules | 01, 16 |
| R2 | Cookie sessions plus cross-site setups cause CSRF or login failures | Medium | High | Same-site deployment (client and API on one domain), `SameSite=Lax`, Origin checks and a CSRF token on state-changing requests | 04, 14 |
| R3 | Authorization bug leaks one user's records to another | Low | Critical | Single scoped-query helper (D-11), `404` for foreign records, a contract test that iterates every route | 03, 14, 15 |
| R4 | Large uploads or hostile files abuse storage | Medium | Medium | Presigned URLs with size/type constraints, per-user quotas, post-upload verification, scanning hook | 10, 14 |
| R5 | Link graph gets inconsistent after deletes/restores | Medium | Medium | Link rules in one service, cascade with `deletedBatchId`, nightly integrity check job | 03, 12 |
| R6 | Frontend/backend drift (field names, derived numbers) | High | Medium | Generated OpenAPI + shared vocab, contract tests, fixtures retired module by module | 02, 17 |
| R7 | Metrics become slow as data grows | Low (single user) | Medium | Indexes, pagination, per-project aggregation, optional cached snapshots | 13 |
| R8 | Email deliverability problems break verification/recovery | Medium | Medium | Provider abstraction, SPF/DKIM setup checklist, resend limits, clear UX states (already designed in PLAN-A-03) | 04 |
| R9 | Scope creep toward teams/real-time before the core is solid | Medium | Medium | Non-goals in section 1.2; future plans (18, 19) frozen until v0.1 ships | all |
| R10 | Legal text published without review | Low | High | Release criterion; `check:legal` already fails builds when `LEGAL_STATUS = published` with unresolved placeholders | 14 |

---

## 13. Open questions for the owner

| # | Question | Needed by | Default if unanswered |
| --- | --- | --- | --- |
| Q1 | Final production domain, and will the API live on the same registrable domain as the client? | Phase 2 | Same domain, `/api` path (cookie sessions work best) |
| Q2 | Email provider and sending domain for verification and recovery | Phase 2 | Resend, with a placeholder domain until chosen |
| Q3 | Object storage provider (R2, S3, Supabase Storage, or other) and per-user storage quota | Phase 5 | Cloudflare R2; 1 GB per user; 100 MB per file |
| Q4 | One individual workspace per account, or several? (RESEARCH.md section 8) | Phase 2 | One per account; schema allows many |
| Q5 | Is email verification required before using the app? | Phase 2 | Required before sharing/exporting; app usable immediately |
| Q6 | Should the backend folder remain `Server/` (capitalized) or be renamed to `api/` as in PROJECT-SPECS? | Phase 1 | Keep `Server/`; Vercel entry lives in `client/api` or root `api/` as decided in PLAN-B-16 |
| Q7 | Retention windows (deleted records, logs, backups) for the final Privacy Policy | Phase 7 | 30 days deleted records, 30 days logs, 35 days backups |
| Q8 | Do you want social sign-in (Google/GitHub) later? | Later | Not in v0.1; auth module keeps an `identities` seam |
| Q9 | Public read-only sharing and export formats (RESEARCH.md section 8) | Phase 6+ | Export JSON/Markdown only |

---

## 14. Definition of done (every task in every module plan)

1. Behavior matches the module plan and its acceptance criteria.
2. Request and response schemas defined in Zod and present in the OpenAPI output.
3. Authorization enforced and tested, including the "other user gets 404" case.
4. Unit tests for rules, integration tests for endpoints, and any new index verified.
5. Lint, typecheck, and tests pass in CI; no new `npm audit` high/critical findings.
6. No secrets, tokens, or personal data in logs or error messages.
7. `LOG.md`, `CODEMAP.md`, `README.md`, and the relevant plan's status section updated in the same change.

---

## 15. Glossary

| Term | Meaning |
| --- | --- |
| Workspace | The container that owns all records; individual in v1, team later |
| Record | Any of the seven user-facing types |
| Link | A stored, validated relationship between two records |
| Trace / traceability | Following links from objective to final file |
| Change | An immutable entry describing how a record changed |
| Final | Flag marking a file or document as the delivered result |
| Gap | A requirement lacking a linked task or a linked final file |
| Derived value | A number or label computed from stored records on read |
| Idempotency key | Client-supplied token making a create safe to retry |
