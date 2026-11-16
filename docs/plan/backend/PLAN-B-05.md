# PLAN-B-05 — Users, Workspaces, and Preferences

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). Each account gets one individual workspace, saved preferences, data export, and account deletion. See [Implementation status](#implementation-status-mvp) at the end.


**Status:** 🟡 Partly done (MVP) · **Phase:** 2 · **Depends on:** [03](PLAN-B-03.md), [04](PLAN-B-04.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [14 Security and privacy](PLAN-B-14.md) · [18 Teams](PLAN-B-18.md) · frontend [PLAN-A-04K](../frontend/PLAN-A-04K.md) (Account), the Account page and theme switch

## 1. Purpose and scope

Who the person is and where their work lives: the user profile, the **individual workspace** that owns every record, application preferences, the authorization context used by every other module, and the privacy duties of an account (export and deletion).

**In scope:** profile, preferences, workspace creation and rename, the request context (`ctx`), the `canAccess()` seam, data export, account deletion.
**Out of scope:** credentials and sessions (04), team membership and roles (18).

## 2. Concepts

- **Workspace** — the container for all records. v1 has one **individual** workspace per account, created at registration. The model allows several (Q4) and a future **team** type (PLAN-B-18); no v1 endpoint creates a second one.
- **Request context (`ctx`)** — built by the session middleware for every authenticated request: `{ userId, workspaceId, timeZone, now(), role: 'owner' }`. Services receive `ctx` as their first argument; repositories apply `workspaceId` from it (PLAN-B-03 section 2.4). Nothing reads `workspaceId` from request bodies or query strings.
- **`canAccess(ctx, record)`** — the single authorization function. In v1 it returns true only when `record.workspaceId` equals `ctx.workspaceId` and the workspace's owner is the user. It exists so team roles can be added in one place later (this closes the "`workspaceId` and `canAccess()` not built" gap noted in CONTEXT.md).

## 3. Data model

`users` and `workspaces` as defined in PLAN-B-03 sections 3.1 and 3.3. Preferences are embedded in `users.preferences`:

| Preference | Values | Default | Frontend source |
| --- | --- | --- | --- |
| `theme` | `system`, `light`, `dark` | `system` | Theme switch (PLAN-A-05 W12) |
| `textScale` | `100`, `115`, `130` | `100` | Text size setting |
| `reduceMotion` | `system`, `on` | `system` | Motion setting |
| `singleKeyShortcuts` | boolean | `true` | Quick add key `Q` can be turned off |
| `timeZone` | IANA name | from browser at sign-up | Used for "today", overdue, calendar |
| `weekStart` | `mon`, `sun` | `mon` | Calendar |
| `locale` | `en` | `en` | Reserved |
| `firstRun` | { `checklist`: { `createdProject`, `addedTask`, `triedQuickAdd`, … }, `dismissedAt` } | all false | First-run checklist (PLAN-A-04L) |
| `tipsSeen` | string[] (≤ 50) | [] | One-time tips |

Unknown preference keys are rejected; the schema is the whitelist.

## 4. Endpoints

All require authentication. State-changing calls require CSRF.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /me` | Profile, preferences, workspace summary, verification state | Same data as `GET /auth/session` minus session fields |
| `PATCH /me` | Update `displayName`, `avatarColor`, and `preferences.*` | Partial; preferences merge by key; `If-Match` optional |
| `GET /workspace` | Current workspace | `{ id, type, name, createdAt, counts: { projects, tasks, … } }` (counts from a cheap aggregate) |
| `PATCH /workspace` | Rename | `name` 1–60 chars |
| `POST /me/export` | Request a full export | Idempotency key required; returns `202` + export descriptor (section 8) |
| `GET /me/export/:exportId` | Export status / download link | Signed, expiring link |
| `POST /me/delete` | Request account deletion | Body: `password`; schedules purge in 14 days; revokes sessions |
| `POST /me/delete/cancel` | Cancel a pending deletion | Only valid while `status = deleting` and within the window (login is allowed solely to reach this action) |
| `POST /me/first-run/:step` | Mark a checklist step complete | Server owns the checklist so it follows the account across devices |
| `DELETE /me/first-run` | Dismiss the checklist | |

Email and password changes live in PLAN-B-04.

## 5. Business rules

- Display name 1–60 chars, trimmed, no control characters; avatar colour from the fixed pastel set (`pink|blue|lilac|yellow|green`) used by the frontend tones.
- `timeZone` must be a valid IANA zone (validated with `Intl.supportedValuesOf('timeZone')` or a bundled list); changing it is allowed and affects only derived "today/overdue" computations, never stored dates.
- Preference writes are idempotent merges; concurrent edits from two devices resolve per key (last write wins).
- A user always has exactly one `defaultWorkspaceId`; deleting or archiving the only workspace is not possible.
- Workspace `type: 'individual'` forbids any member/role fields in responses, keeping the demo's rule that the individual workspace never shows team concepts.

## 6. Workspace creation

Called by registration inside the same transaction as user creation: creates the `workspaces` document (`name: "<displayName>'s workspace"`, editable), sets `workspaceIds` and `defaultWorkspaceId`, initializes `preferences`, and returns the context for the first session. It does **not** create sample projects; the first-run flow offers templates instead (PLAN-A-04L, PLAN-B-06 section 7).

## 7. Authorization contract used by every module

1. The session middleware resolves `ctx`.
2. Services call `repo.findById(ctx, id)`; the repository returns `null` for anything outside the workspace.
3. Services translate `null` into `NotFoundError` (never `403`; PLAN-B-14 section 4).
4. Every module's test suite includes the shared `itDeniesOtherWorkspaces(route)` helper (PLAN-B-15).
5. Future roles extend `canAccess(ctx, record, action)` with `action` in `read|write|delete|share`; call sites already pass the action so no module changes later.

## 8. Privacy duties

### 8.1 Export (data portability)

- Produces a **ZIP** in object storage under `exports/<workspaceId>/<exportId>.zip` containing `workspace.json` (all records with links resolved to ids), one Markdown file per document (latest version) plus `document-versions.json`, a `files-manifest.json`, and the stored uploads. A `README.txt` explains the format.
- Because the work can exceed a function's duration limit, export is a **job** (PLAN-B-19 once available; in v0.1 limited to a **JSON-only export** generated inline for workspaces under a size cap, with uploaded files listed by short-lived download links instead of bundled).
- Download link is signed, expires in 24 hours; the export object is deleted after 7 days.
- Requires a verified email; limited to one per 24 hours; rate-limited; recorded in `audit_log`.

### 8.2 Account deletion

1. User confirms with their password (re-authentication).
2. `status = deleting`, `deletionRequestedAt = now`, all sessions revoked, confirmation email sent with a cancel link.
3. During the 14-day window the account cannot sign in except to cancel.
4. The purge job removes the user, workspace, all records, links, sessions, tokens, stored files and exports, and writes an anonymous audit entry (counts, no content).
5. Backups age out per the retention policy; the Privacy Policy states this (draft text to be confirmed in legal review; Q7).

### 8.3 Data minimization

Only the fields in section 3 are stored. No marketing data, no third-party analytics ids, no raw IP addresses beyond truncated audit values. This must stay consistent with `docs/privacy-policy.md` and `docs/cookie-and-local-storage-policy.md` (update both if any collection or cookie is added).

## 9. Frontend mapping

| Frontend feature | Backend |
| --- | --- |
| Account page: name, colour | `PATCH /me` |
| Account page: theme, text size, motion, shortcuts | `PATCH /me` `preferences` |
| First-run checklist (PLAN-A-04L) | `POST /me/first-run/:step` |
| "Export my data" / "Delete account" (preview-only today) | `/me/export`, `/me/delete` |
| `data/store.js` session-only additions | Replaced by real writes (PLAN-B-17) |
| Theme persisted in `localStorage` today | Becomes a **cache**; the server preference wins after sign-in |

## 10. Implementation tasks

- [ ] `UsersService`, `WorkspacesService`, `PreferencesService`, `ExportService`, `DeletionService`.
- [ ] Context builder and `canAccess()`; export a typed `ctx` for all modules.
- [ ] Endpoints, Zod schemas, OpenAPI for section 4.
- [ ] Registration hook to create the workspace transactionally.
- [ ] Inline JSON export, then ZIP export once PLAN-B-19 lands.
- [ ] Deletion request/cancel flow and purge hook (PLAN-B-03 section 7).
- [ ] First-run checklist endpoints and defaults.
- [ ] Update privacy policy draft references and `CODEMAP.md`.

## 11. Testing

Preference merge and validation (unknown keys, bad time zone); workspace created exactly once with the user; export contains every record type and no data from other users; deletion schedules, blocks login, cancels, and purges everything (including storage objects, verified via a fake storage client); `canAccess` matrix tests.

## 12. Acceptance criteria

1. Registering creates one user and one workspace atomically; a failure leaves neither.
2. Changing the theme on one device is reflected after signing in on another.
3. An export of the seeded demo workspace round-trips: every project, task, requirement, file record, document, change, and link id appears.
4. After the purge, no document in any collection references the deleted user or workspace.
5. A user cannot read, modify, or export another user's workspace by changing ids in any request.

## 13. Open questions

- Q4 (one or many workspaces per account), Q5, Q7 in PLAN-B-00.
- Whether the export should also offer Markdown-per-record (human readable) in addition to JSON.
- Whether account deletion should offer an immediate (no grace period) option.

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, updated 2026-11-16 · Each account gets one individual workspace, saved preferences, data export, and account deletion.

**Built**

- User and individual workspace created together at registration; request context `ctx` from the session.
- `GET /me`, `PATCH /me` for display name and preferences; `GET/PATCH /workspace` to read and rename the workspace.
- `GET /me/export` downloads everything as JSON (no secrets); `POST /me/delete` (password + typing DELETE) removes the account, all records, versions, links, and uploaded files immediately (`services/account.js`).
- Frontend Account page: profile, preferences, password, devices, activity, recently deleted, your data, calendar download, delete account.

**Not built yet**

- Export as a ZIP that includes the uploaded files, a grace period before deletion, first-run checklist endpoints, a named `canAccess()` seam (the tenant guard does this job today).

**Deviations and notes**

- Deletion is immediate in the MVP (no 14-day grace period); the confirmation is the password plus typing DELETE.
