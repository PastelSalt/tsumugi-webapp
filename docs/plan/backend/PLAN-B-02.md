# PLAN-B-02 — API Contract and Conventions

**Status:** Proposed · **Phase:** 1 · **Depends on:** [01](PLAN-B-01.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [03 Data model](PLAN-B-03.md) · [14 Security](PLAN-B-14.md) · [17 Frontend integration](PLAN-B-17.md)

## 1. Purpose and scope

The rules every endpoint follows, so the API feels like one product and the frontend can rely on it: URL design, versioning, request validation, response and error envelopes, pagination, filtering, sorting, concurrency control, idempotency, field naming, and documentation (OpenAPI). Also defines the typed client the frontend will use.

Out of scope: individual resource endpoints (each module plan lists its own).

## 2. Resource and URL design

- Base path `/api/v1`. A breaking change creates `/api/v2`; additive changes (new optional fields, new endpoints) never bump the version.
- Plural nouns, lower-case, hyphenated where needed: `/projects`, `/milestones`, `/tasks`, `/requirements`, `/files`, `/documents`, `/changes`, `/links`.
- Nested routes only for **ownership by a parent that must be in the URL for clarity**, one level deep: `/projects/:projectId/phases`. Records are otherwise addressed flat by id, since ids are globally unique: `/tasks/:taskId`. A `projectId` filter is a query parameter on collection reads.
- Non-CRUD actions are `POST /<resource>/:id/<verb>`: `/tasks/:id/complete`, `/projects/:id/archive`, `/documents/:id/finalize`.
- `PATCH` for partial updates (JSON merge semantics, no JSON Patch). `PUT` is not used for records. `DELETE` is a soft delete (PLAN-B-03 section 7) and returns `204`.
- `GET` is always safe and never writes (including "last opened" updates, which use an explicit `POST /projects/:id/open`).

### 2.1 Status codes

| Code | When |
| --- | --- |
| 200 | Successful read, update, or action |
| 201 | Created (with `Location` header) |
| 204 | Deleted, or action with no body |
| 304 | `If-None-Match` matches current `ETag` |
| 400 | Validation or malformed request |
| 401 / 403 | Not signed in / not allowed |
| 404 | Not found, **or not yours** |
| 409 | Conflict (duplicate, invalid state) |
| 412 | `If-Match` version mismatch |
| 413 / 415 | Too large / wrong content type |
| 422 | Valid shape but violates a business rule |
| 429 | Rate limited (with `Retry-After`) |
| 5xx | Server problem, standard envelope, no internals |

## 3. Naming and field conventions

- JSON keys **camelCase**, matching the frontend. Collection and enum values use the exact vocabulary from PLAN-B-00 section 6.2 (including spaces and capitalization such as `"To do"`, `"On hold"`).
- `id` (string) on every record; foreign keys end in `Id` / `Ids` (`projectId`, `requirementIds`).
- Timestamps: `createdAt`, `updatedAt` (UTC ISO-8601 with `Z`). Calendar dates: `YYYY-MM-DD` strings (`due`, `start`, `end`). Never mix.
- Empty value policy: omit unknown optional fields on write; the API returns `null` for "known empty" (`due: null`) and `[]` for empty lists. Never returns `undefined` or empty strings as null stand-ins.
- Booleans are real booleans; flags are named positively (`blocked`, `verified`, `isFinal`, `archived`).
- Server-controlled fields (`id`, `workspaceId`, `createdAt`, `updatedAt`, `version`, derived values) are **read-only**; sending them on write is a `400` (strict objects).
- Money, percentages, and counts are numbers; percentages are integers 0–100 or `null` when not computable (matches `projectProgress().pct`).
- Maximum string lengths are defined once in `shared/validation/limits.ts` and cited by every schema (e.g. titles 200, descriptions 5,000, notes 20,000, tags 30 chars × 20 tags).

## 4. Validation

- One Zod schema per request part: `params`, `query`, `body`. `validate({ params, query, body })` middleware parses, **replaces** the raw values with parsed ones, and throws `ValidationError`.
- All object schemas are `.strict()`; strings are trimmed; ids use `objectIdSchema` (24 hex chars) and respond `404` for well-formed-but-missing and `400` for malformed.
- Query parameters are coerced (`limit`, booleans) with explicit bounds.
- Cross-field rules (e.g. milestone `due ≥ start`) live in `.superRefine` so the error points at the field.
- Validation errors list every failing field: `details: [{ path: "due", code: "invalid_date", message: "Use YYYY-MM-DD." }]`. Messages are user-safe and match the plain wording style of the frontend.

## 5. Envelopes

Success:

```json
{ "data": { "id": "…", "title": "…" }, "meta": { "requestId": "…" } }
```

List:

```json
{ "data": [ … ], "meta": { "requestId": "…", "nextCursor": "eyJ…", "hasMore": true, "total": 42 } }
```

`total` is included only on endpoints that document it (counts can be expensive; PLAN-B-13 lists them).

Error:

```json
{ "error": { "code": "validation_failed", "message": "Some fields need attention.", "details": [ { "path": "due", "code": "invalid_date", "message": "Use YYYY-MM-DD." } ], "requestId": "…" } }
```

`code` values are a closed, documented set (PLAN-B-01 section 7 plus module-specific codes listed in each plan, namespaced like `auth.invalid_credentials`). Clients branch on `code`, never on `message`.

## 6. Pagination, filtering, sorting

- **Cursor pagination** on every list: `?limit=25&cursor=…`. `limit` default 25, max 100. The cursor is an opaque, URL-safe, **signed** base64 of `{ sortKey values, _id }`; tampering returns `400 invalid_cursor`. Stable ordering always ends with `_id` as the tiebreaker.
- **Sorting:** `?sort=due` or `?sort=-updatedAt` (leading `-` descending). Each endpoint whitelists sortable fields (those backed by an index).
- **Filtering:** plain query parameters, whitelisted and typed per endpoint: `?projectId=…&status=Doing&status=To%20do&due.lte=2026-11-30`. Repeated keys mean OR within a field; different fields mean AND. Operators: `.lte`, `.gte` for dates/numbers only.
- **Text search:** `?q=` on endpoints that declare it (prefix/word match over title-like fields; full search is PLAN-B-13).
- **Include deleted/archived:** `?archived=true|false|any` (projects), `?deleted=only` only on the "Recently deleted" endpoint.
- **Sparse fields / expansion:** `?expand=milestone,links` where documented, to avoid chatty clients; default responses are compact.
- Totals and facet counts come from dedicated endpoints in PLAN-B-13, not from every list.

## 7. Concurrency control

- Every mutable record has an integer `version` (starts at 1, incremented on every write). Responses carry `ETag: "<version>"`.
- `PATCH`/`DELETE`/action endpoints accept `If-Match`. When present and stale → `412 version_mismatch` with the current record in `details.current` so the client can reconcile. When absent, last-write-wins is accepted for single-user workspaces (a plan can mark an endpoint as `If-Match` required).
- `If-None-Match` on single-record `GET` returns `304`.
- Bulk reorder or multi-record actions use a transaction (PLAN-B-03 section 9) and either fully succeed or fully fail.

## 8. Idempotency

- `POST` creates accept `Idempotency-Key` (UUID, ≤ 64 chars). The server stores `{ key, userId, method, path, requestHash, responseStatus, responseBody }` in `idempotency_keys` (TTL 24 h).
- Same key + same request → replay the stored response with `Idempotent-Replay: true`. Same key + different request → `422 idempotency_key_reused`.
- Required for: account export request, upload intent creation (PLAN-B-10), project-from-template creation (creates many records). Optional for other creates; the frontend sends one on Quick add so a retry cannot duplicate a task.

## 9. Standard behaviors every endpoint must implement

| Behavior | Rule |
| --- | --- |
| Authentication | `401` unless the route is explicitly public (health, auth endpoints) |
| Authorization | Workspace-scoped query; foreign or missing records → `404` |
| CSRF | State-changing methods require the CSRF header (PLAN-B-04 section 7) |
| Content type | `application/json` required on bodies; `415` otherwise |
| Rate limit headers | `RateLimit-Limit`, `RateLimit-Remaining`, `RateLimit-Reset` on limited routes |
| Caching | `Cache-Control: no-store` on all authenticated responses; health may be cacheable |
| Request id | Returned in the `X-Request-Id` header and `meta.requestId` |
| Locale | Messages are English in v1; `code` is stable for future translation |
| Unknown fields | Rejected |

## 10. Documentation and typed client

- Each route registers its schemas with `zod-to-openapi`; `npm run openapi:export` writes `Server/openapi/openapi.json` (committed so diffs show API changes in reviews). CI fails if the generated file differs from the committed one.
- Swagger UI / Scalar is served at `/api/v1/docs` in non-production only.
- A small hand-written **API client** lives in `client/src/lib/api/` (not generated code in v1): `request()` handles credentials, CSRF header, envelope unwrapping, error class (`ApiError` with `code`, `status`, `details`, `requestId`), and retry for idempotent reads. Types come from `openapi-typescript` output kept in `client/src/lib/api/schema.d.ts` for editor assistance; the client remains JavaScript. Detail in [PLAN-B-17](PLAN-B-17.md).
- A **contract test suite** boots the app, walks the OpenAPI document, and for every operation verifies: documented status codes occur, responses validate against their schemas, and unauthenticated calls return `401`.

## 11. Cross-cutting endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /api/v1/vocab` | Returns the status, priority, kind, and limits vocabularies so the client can stay in sync without hard-coding (auth required not needed; cacheable) |
| `GET /api/v1/docs`, `/openapi.json` | Documentation (non-production) |

## 12. Implementation tasks

- [ ] `validate` middleware, shared schema helpers (`objectId`, `isoDate`, `pagination`, `sort`), `limits.ts`.
- [ ] Response helpers: `ok()`, `created()`, `list()`, `noContent()`; serializers strip internal fields (`_id` → `id`, `__v`, `deletedAt`, `workspaceId`).
- [ ] Cursor encode/decode with HMAC signature; property tests for round-trip and tamper detection.
- [ ] `ETag`/`If-Match` helpers; `version` plugin for Mongoose (PLAN-B-03).
- [ ] Idempotency middleware and collection.
- [ ] OpenAPI registry, export script, CI diff check, docs route.
- [ ] Contract test runner.
- [ ] Frontend `lib/api` client skeleton (shipped with Phase 3 in PLAN-B-17).
- [ ] `GET /vocab`.

## 13. Testing

Unit: cursor signing, query parsing/whitelisting, envelope helpers, `If-Match` logic. Integration: pagination across more than one page with equal sort keys, tampered cursor, stale `If-Match`, idempotent replay and key reuse. Contract: generated from the OpenAPI document.

## 14. Acceptance criteria

1. Two consecutive pages of a list never repeat or skip a record, even when many records share the same sort value.
2. A client can tell every error apart by `code` alone; no response ever contains a stack trace.
3. A repeated create with the same `Idempotency-Key` creates exactly one record.
4. A stale `If-Match` update fails with `412` and returns the current record.
5. `openapi.json` is generated, committed, and kept in sync by CI.
6. The frontend `request()` helper can call `/health/live`, parse the envelope, and surface an `ApiError` for a failing call.

## 15. Open questions

- Whether to expose a bulk-update endpoint for tasks (reorder, bulk status) in v0.1 (PLAN-B-08 proposes it behind a flag).
- Whether to adopt ProblemDetails (RFC 9457) instead of the custom error envelope. Default: custom envelope, shaped to convert later.
