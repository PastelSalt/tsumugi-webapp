# PLAN-B-03 — Data Model and Persistence

**Status:** Proposed · **Phase:** 1 · **Depends on:** [01](PLAN-B-01.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [02 API conventions](PLAN-B-02.md) · [12 Changes and links](PLAN-B-12.md) · [14 Security](PLAN-B-14.md)

## 1. Purpose and scope

The shared persistence rules and the **complete collection catalogue**: base schema, ids, dates, scoping, soft delete, versioning, links, counters, transactions, indexes, migrations, and seed data. Per-module field details are owned by the module plans and summarized here so the whole model can be reviewed in one place.

## 2. Base conventions

### 2.1 Base fields (Mongoose plugin `baseRecord`)

| Field | Type | Rule |
| --- | --- | --- |
| `_id` | ObjectId | Exposed as `id` (string) |
| `workspaceId` | ObjectId, required, indexed | Set by the repository helper, never by request data (D-11) |
| `createdAt`, `updatedAt` | Date (UTC) | Mongoose `timestamps` |
| `version` | Number, default 1 | Incremented in a `pre('save')`/update hook (optimistic concurrency; PLAN-B-02 section 7) |
| `deletedAt` | Date or absent | Soft delete (section 7) |
| `deletedBatchId` | ObjectId or absent | Groups records deleted together for exact restore |

Schema options: `strict: 'throw'` (unknown fields are bugs), `versionKey: false` (custom `version` instead of `__v`), `minimize: false`, JSON transform removes `_id`, `__v`, `deletedAt`, `deletedBatchId`, `workspaceId` and adds `id`.

### 2.2 Ids

ObjectIds everywhere (D-09). Human-readable keys: `projects.slug` (unique per workspace), `requirements.key` (`REQ-001`, unique per project, allocated from `counters`). Slugs are generated from the name, ASCII-folded, with `-2`, `-3` suffixes on collision, and never change after creation (renames keep the slug; a `slugHistory` array lets old URLs redirect).

### 2.3 Dates

D-10: `Date` for instants; `String` `YYYY-MM-DD` for calendar dates with a schema validator and an index-friendly lexical order. The user's time zone (`users.preferences.timeZone`, default from browser at registration, IANA name) is used whenever the server must decide "today" (PLAN-B-13).

### 2.4 Repository helper (the tenant guard)

All modules read and write through `scopedModel(Model, ctx)` which injects `{ workspaceId: ctx.workspaceId, deletedAt: { $exists: false } }` into every `find`, `count`, `update`, `delete`, and `aggregate` ($match first stage). Direct use of `Model.find()` outside `repository.ts` is blocked by lint (PLAN-B-01 section 3). A test enumerates every repository method and asserts that a record from another workspace is invisible (PLAN-B-15).

## 3. Collection catalogue

Field lists use the frontend names. `★` marks required fields. Bounded embedded arrays are capped and enforced in schema.

### 3.1 `users` (PLAN-B-04, 05)

`email★` (unique, lower-cased, normalized), `emailVerifiedAt`, `passwordHash★`, `displayName★`, `avatarColor`, `workspaceIds[]`, `defaultWorkspaceId★`, `preferences` { `theme` (`system|light|dark`), `textScale`, `reduceMotion`, `singleKeyShortcuts`, `timeZone★`, `weekStart`, `locale` }, `status` (`active|pending|disabled|deleting`), `failedLogins` { `count`, `lockedUntil` }, `lastLoginAt`, `deletionRequestedAt`, `termsAcceptedAt`/`termsVersion`.
Not scoped by `workspaceId` (users own workspaces).

### 3.2 `sessions` (PLAN-B-04)

`userId★`, `tokenHash★` (unique), `csrfSecretHash`, `createdAt`, `lastSeenAt`, `expiresAt★` (TTL index), `absoluteExpiresAt★`, `ip` (truncated), `userAgent` (truncated), `label`, `revokedAt`.

### 3.3 `workspaces` (PLAN-B-05)

`type★` (`individual` for v1), `name★`, `ownerId★`, `createdAt`. Team fields reserved but absent in v1 (PLAN-B-18).

### 3.4 `projects` (PLAN-B-06)

`name★`, `slug★`, `category★`, `kind★` (`software|creative|research|multimedia|blank`), `status★`, `tone`, `tags[≤20]`, `description`, `objective`, `start`, `end`, `phases[≤20]` (`{ id, name }` ordered), `phaseIndex`, `lastOpenedAt`, `archivedAt`, `templateKind`.

### 3.5 `milestones` (PLAN-B-07)

`projectId★`, `title★`, `description`, `start★`, `due★`, `phaseId` (stable id of one of the project's phases; the API also presents the frontend's `phase` index), `done`, `doneAt`, `blocked`, `afterId` (dependency, same project, acyclic).

### 3.6 `tasks` (PLAN-B-08)

`projectId★`, `milestoneId`, `title★`, `notes`, `status★` (`To do|Doing|Done`), `priority★`, `due`, `blocked`, `completedAt`, `subtasks[≤50]` (`{ id, text, done }`), `order` (float rank for manual ordering). Links: requirements, files (via `links`).

### 3.7 `requirements` (PLAN-B-09)

`projectId★`, `key★` (`REQ-###`), `title★`, `type★`, `status★` (`Open|Met`), `verified`, `milestoneId`, `description`, `acceptance[≤30]` (`{ id, text, met }`). Links: tasks, files, changes.

### 3.8 `files` (PLAN-B-10)

`projectId★`, `name★`, `kind★` (`document|image|media|data|link`), `ext`, `bytes`, `mime`, `tags[≤20]`, `description`, `isFinal`, `milestoneId`, `storage` { `key`, `etag`, `status` (`pending|ready|failed`), `checksum` } (absent for `link`), `link` { `url`, `host` } (only for `link`), `uploadedAt`. Links: requirements, tasks.

### 3.9 `documents` and `document_versions` (PLAN-B-11)

`documents`: `projectId★`, `title★`, `status★` (`Draft|Final`), `tags[]`, `description`, `milestoneId`, `currentVersion★`, `bodyBytes`. `document_versions`: `documentId★`, `projectId★`, `version★` (unique per document), `body★` (Markdown, ≤ 200 KB), `summary`, `createdAt`, `createdBy`, `changeId`.

### 3.10 `changes` (PLAN-B-12)

`projectId★`, `at★` (instant), `summary★`, `recordType★` (`Project|Milestone|Task|Requirement|File|Document`), `recordId★`, `action★` (`created|updated|deleted|restored|status|linked|unlinked|finalized|uploaded`), `reviewed`, `fromVersion`, `toVersion`, `fields[]` (names that changed), `source` (`user|system`). Immutable except `reviewed`. Links: requirements, tasks.

### 3.11 `links` (PLAN-B-12)

`projectId★`, `a` { `type`, `id` }, `b` { `type`, `id` }, `relation★` (`implements|satisfies|attached|affects`), `createdAt`. Stored once in canonical order (see section 6).

### 3.12 Supporting collections

| Collection | Fields | TTL / notes |
| --- | --- | --- |
| `counters` | `scope★` (`req:<projectId>`), `seq★` | Atomic `$inc` for `REQ-###` |
| `idempotency_keys` | `userId`, `key`, `requestHash`, `status`, `body` | TTL 24 h |
| `upload_intents` | `userId`, `fileId`, `key`, `expiresAt`, `maxBytes`, `mime` | TTL 2 h, plus cleanup job |
| `rate_limits` | `bucket★` (hashed), `count`, `resetAt` | TTL on `resetAt` |
| `email_tokens` | `userId`, `purpose` (`verify|reset|email-change`), `tokenHash★`, `expiresAt`, `usedAt` | TTL on `expiresAt` + 1 day |
| `audit_log` | `userId`, `event`, `at`, `ipTruncated`, `meta` | Security-relevant events; retained 12 months (decision Q7) |
| `jobs` | PLAN-B-19 | Future |

## 4. Indexes (authoritative list)

All compound indexes start with `workspaceId` unless noted. Index creation is **explicit** (`npm run db:indexes`), never at runtime in production.

| Collection | Index | Why |
| --- | --- | --- |
| `users` | `{ email: 1 }` unique | Login, duplicate check |
| `sessions` | `{ tokenHash: 1 }` unique; `{ expiresAt: 1 }` TTL (0 s); `{ userId: 1 }` | Lookup; expiry; "sign out everywhere" |
| `projects` | `{ workspaceId, slug }` unique (partial: not deleted); `{ workspaceId, archivedAt, status, updatedAt: -1 }`; `{ workspaceId, lastOpenedAt: -1 }` | Slug lookup; directory; recents |
| `milestones` | `{ workspaceId, projectId, due }`; `{ workspaceId, done, due }` | Timeline; overdue |
| `tasks` | `{ workspaceId, projectId, status, due }`; `{ workspaceId, status, due }`; `{ workspaceId, milestoneId }`; `{ workspaceId, projectId, order }` | Lists, Today/Upcoming, milestone progress, manual order |
| `requirements` | `{ workspaceId, projectId, key }` unique; `{ workspaceId, projectId, status }`; `{ workspaceId, milestoneId }` | Specs view, coverage |
| `files` | `{ workspaceId, projectId, kind, updatedAt: -1 }`; `{ workspaceId, isFinal }`; `{ storage.key }` unique sparse | Library, final lookup, reconciliation |
| `documents` | `{ workspaceId, projectId, status, updatedAt: -1 }` | Library |
| `document_versions` | `{ documentId, version }` unique | Version lookup |
| `changes` | `{ workspaceId, projectId, at: -1 }`; `{ workspaceId, recordType, recordId, at: -1 }` | History, per-record history |
| `links` | `{ workspaceId, 'a.type', 'a.id' }`; `{ workspaceId, 'b.type', 'b.id' }`; unique `{ workspaceId, a.type, a.id, b.type, b.id, relation }` | Both directions, duplicate prevention |
| `counters` | `{ scope: 1 }` unique | Atomic sequence |
| `email_tokens`, `idempotency_keys`, `upload_intents`, `rate_limits` | TTL indexes as above, plus lookup keys | Expiry |
| Text | `{ workspaceId, title/name/description }` text index on tasks, requirements, files, documents (or Atlas Search, decided in PLAN-B-13) | Search |

Rule: any new query pattern in a module plan must name its index here in the same change.

## 5. Embedded versus referenced

| Data | Choice | Reason |
| --- | --- | --- |
| Project phases | Embedded array | Small, always read with the project |
| Task subtasks | Embedded, capped at 50 | Edited with the task, no independent identity beyond `id` |
| Requirement acceptance criteria | Embedded, capped at 30 | Same |
| Document body | Separate `document_versions` | Large, versioned, not needed in lists |
| Changes, links | Separate collections | Unbounded and queried independently (spec section 7: avoid unrestricted arrays) |
| User preferences | Embedded in `users` | Read at session load |

## 6. Links model (edges)

Many-to-many relations are edges in `links` so both directions are indexed and validated (D-14). The API still presents arrays (`requirementIds` on tasks, etc.); the service layer converts.

| Relation | Between | Meaning | Presented as |
| --- | --- | --- | --- |
| `implements` | Task ↔ Requirement | Task is work toward the requirement | `task.requirementIds`, `requirement.taskIds` |
| `satisfies` | File/Document ↔ Requirement | The file is evidence for the requirement | `file.requirementIds`, `requirement.fileIds` |
| `attached` | File/Document ↔ Task | File is related to the task | `task.fileIds`, `file.taskIds` |
| `affects` | Change ↔ Requirement/Task | Change touched that record | `change.requirementIds`, `change.taskIds` |

Single-parent relations stay as foreign keys: `task.milestoneId`, `requirement.milestoneId`, `file.milestoneId`, `document.milestoneId`, `milestone.afterId`, every record's `projectId`.

Canonical order: the `a` side is the lexically smaller `type` (`Change < File < Requirement < Task`, documents use type `File`), preventing mirrored duplicates. Validation lives in [PLAN-B-12](PLAN-B-12.md) section 5.

## 7. Soft delete, cascade, and restore

- `DELETE` sets `deletedAt` (and a `deletedBatchId` shared by the cascade) instead of removing the document. All repository reads exclude deleted records.
- Cascades: deleting a project soft-deletes its milestones, tasks, requirements, files, documents, changes, and links in one transaction with one batch id. Deleting a milestone **detaches** its tasks/requirements/files (sets `milestoneId: null`) rather than deleting them; deleting a requirement/task removes its links (soft-deleted in the same batch so restore re-creates them).
- **Restore:** `POST /<resource>/:id/restore` clears `deletedAt` for the whole `deletedBatchId`. Restore fails with `409` if a unique key would collide (e.g. a new project took the slug); the service suggests the next slug.
- **Purge job (daily):** hard-deletes batches older than 30 days, then removes orphaned `links`, `upload_intents`, and storage objects, and writes an audit entry (counts only).
- Unique indexes are partial (`deletedAt: { $exists: false }`) so a deleted record never blocks reuse of a slug or key.

## 8. Migrations and index management

- Schema evolution is **additive and lazy** by default: new optional fields with defaults; readers tolerate missing fields.
- Breaking changes use numbered scripts in `Server/migrations/NNNN-name.ts` (idempotent, resumable, batched, dry-run flag), recorded in a `migrations` collection with `appliedAt`. `npm run db:migrate` runs pending ones; CI runs them against a seeded memory database.
- Every migration documents rollback or states it is irreversible. Production migrations run from a developer machine or a protected workflow, never on function start.
- `npm run db:indexes` syncs the index catalogue in section 4 (create-only; drops require an explicit flag and a review note).

## 9. Transactions and atomicity

MongoDB Atlas replica sets support multi-document transactions. Use them (via a `withTransaction(ctx, fn)` helper with retry on `TransientTransactionError`) only where several records must change together:

- project create from a template (project + milestones + tasks + requirements + changes),
- cascade delete/restore,
- link replacement for a record,
- document finalize (version + status + change),
- account purge.

Single-document updates use atomic operators (`$inc`, `$set`, `findOneAndUpdate` with a `version` filter) instead of transactions.

## 10. Seed and fixtures

- `npm run db:seed` creates a demo user and a workspace from `Server/seed/demo.ts`, a typed port of `client/src/pages/workspace/data/fixtures.js` (same six projects, so the frontend demo can be compared one-to-one). It maps the readable demo ids to real ObjectIds in memory and writes real links. Only for development and preview environments; guarded by `NODE_ENV !== 'production'`.
- Test factories (`test/factories/`) build valid records with sensible defaults and are the only way tests create data.

## 11. Data protection hooks

- Fields holding secrets (`passwordHash`, token hashes) are `select: false` and excluded from every serializer.
- Email addresses are stored normalized; hashed variants are used in logs.
- Backups and restore: PLAN-B-16. Export/delete: PLAN-B-05.
- Field-level encryption is not planned for v0.1; document bodies and file names are protected by access control and encryption at rest provided by Atlas and the storage provider. Revisit if sensitive-data use cases require it.

## 12. Implementation tasks

- [ ] `baseRecord` plugin, `scopedModel` helper, `withTransaction` helper, `version` increment hook.
- [ ] Schemas and models for every collection in section 3 with validators and caps.
- [ ] Index definitions and `db:indexes` script; index verification test.
- [ ] Counter service (`nextRequirementKey(projectId)`).
- [ ] Soft delete, cascade, restore, and purge utilities with tests on batch behavior.
- [ ] Migration runner and first no-op migration as a template.
- [ ] Seed script and factories.
- [ ] Integrity checker script (`check:integrity`): orphan links, links across projects, requirements with duplicate keys, tasks pointing to deleted milestones, files stuck in `pending`.

## 13. Testing

Property tests for the tenant guard (random workspace pairs); transaction rollback tests (inject a failure mid-cascade); restore collision tests; index tests that run `explain()` on each documented query and assert `IXSCAN`; migration idempotency tests.

## 14. Acceptance criteria

1. No repository method returns another workspace's record in the tenant-guard test.
2. Deleting and restoring a project with children yields exactly the original state, including links.
3. A deleted project's slug can be reused; restoring the old project prompts a new slug.
4. Every documented query uses an index (verified by `explain()` tests).
5. `check:integrity` reports zero problems after the seed script and after the full test suite's cascade scenarios.
6. Seeding reproduces the demo dataset with working links.

## 15. Open questions

- Atlas Search versus MongoDB text indexes for search (decided in PLAN-B-13 after a spike).
- Whether to store audit events in MongoDB or ship them to a log service (PLAN-B-16).
