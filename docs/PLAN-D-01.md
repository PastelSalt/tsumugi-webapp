# PLAN-D-01 — Backend Handoff for the Android App

**Status:** Handoff, current as of 2026-11-16 · **Series:** PLAN-D is the mobile-app series (PLAN-A frontend, PLAN-B backend, PLAN-C owner actions).
**Audience:** whoever builds the Tsumugi Android app (Kotlin, Compose or otherwise). This document says what the backend does today, exactly how to talk to it, what it will not do for you yet, and what backend work is proposed for mobile.
**Source of truth:** the running code in `Server/` (routes in `Server/src/routes/`, rules in `Server/src/services/`) and its tests (`Server/test/`). Where this document and the code disagree, the code wins; please tell us. Design intent is in [PLAN-B-00](plan/backend/PLAN-B-00.md) and the module plans, each of which ends with an implementation status.

> **What this is not.** The backend is a **local MVP**: one computer, no HTTPS, no email, no hosting. It is enough to build and test the Android app against. Section 14 lists what mobile still needs from the backend before release.
>
> **Mobile design reference.** The web plans mention a separate `tsumugi-mobile` project and its `docs/REFERENCE-WEB-ALIGNMENT.md` (design tokens). That repository was not part of this one and was not reviewed for this handoff; this document covers backend behavior only.

---

## 1. At a glance

| | |
|---|---|
| Base URL (local) | `http://localhost:3001/api/v1` (from an Android emulator: `http://10.0.2.2:3001/api/v1`) |
| Style | REST, JSON, UTF-8, camelCase |
| Auth | **Cookie session** (`tsumugi_sid`, opaque token, 30 days sliding). **No bearer tokens yet** (section 4.3) |
| Account model | One person = one account = one **individual** workspace. No teams |
| Success body | `{ "data": … }` (lists: `{ "data": [ … ] }`; paginated lists add `meta`) |
| Error body | `{ "error": { "code": "…", "message": "…", "details"?: … } }` |
| Ids | 24-character hex strings (MongoDB ObjectIds). Treat as opaque strings |
| Dates | Calendar dates `YYYY-MM-DD` in the **person's time zone**; instants are UTC ISO-8601 |
| Versioning | Path prefix `/v1`. Additive changes (new optional fields, new endpoints) will not bump it |
| Rate limits | In-memory, per IP, on auth and export routes (section 12) |
| Machine-readable spec | **None yet** (no OpenAPI). Use this document and the tests |

---

## 2. Running the backend for mobile development

From the repository root:

```bash
npm run setup          # once
npm run seed           # demo account: demo@tsumugi.local / demo-password-1 (6 projects of sample data)
```

Then make the API reachable from the emulator or a phone. By default it listens on `127.0.0.1` only (private to the computer). Create `Server/.env` with:

```env
HOST=0.0.0.0
```

and start the API with `npm run dev --prefix Server` (the web app is not needed for mobile work). The port is 3001.

| Where the app runs | Base URL to use |
|---|---|
| Android emulator | `http://10.0.2.2:3001/api/v1` |
| Physical phone on the same Wi-Fi | `http://<computer's LAN IP>:3001/api/v1` (allow Node through the Windows firewall for private networks) |
| Physical phone over USB | `adb reverse tcp:3001 tcp:3001`, then `http://localhost:3001/api/v1` |

**Cleartext HTTP.** Android blocks `http://` by default (API 28+). For **debug builds only**, add a network security configuration that allows cleartext to `10.0.2.2` and your LAN host, or use the `adb reverse` route with `localhost` (also needs the exception). Production must use HTTPS (see section 14). `HOST=0.0.0.0` exposes the API, with no HTTPS, to everyone on the network: use it only on a network you trust and turn it off afterwards.

**Quick checks** (replace the host as needed):

```bash
curl http://localhost:3001/api/v1/health                    # {"data":{"status":"ok"}}
curl -i -c jar.txt -H 'Content-Type: application/json' \
  -d '{"email":"demo@tsumugi.local","password":"demo-password-1"}' \
  http://localhost:3001/api/v1/auth/login                    # 200 + Set-Cookie: tsumugi_sid=…
curl -b jar.txt http://localhost:3001/api/v1/workspace/snapshot
```

---

## 3. Conventions every call follows

### 3.1 Requests
- `Content-Type: application/json` for bodies (file uploads use `multipart/form-data`, section 9). JSON body limit is 1 MB.
- **Bodies are strict:** unknown fields are rejected with `400 validation_failed`. Send only documented fields. Server-controlled fields (`id`, `createdAt`, `updatedAt`, `workspaceId`, derived values) are not accepted on write.
- `PATCH` is a partial update: send only the fields you are changing. Arrays (`tags`, `subtasks`, `acceptance`, `requirementIds`, `fileIds`, `taskIds`) **replace** the whole list.
- Optional values: send `null` to clear a nullable field (`due`, `milestoneId`, `recurrence`, `afterId`); omit the field to leave it alone.
- Ids in the URL must be 24-hex; anything else is `400`. A well-formed id that is missing **or belongs to someone else** is `404` (never `403`), so the app cannot probe other people's data.

### 3.2 Responses
- `Cache-Control: no-store` on everything. A request id is returned in `X-Request-Id`; include it in bug reports.
- `204 No Content` for deletes and some actions (logout, change password, revoke session, delete).
- JSON field names match the web app's shapes (section 5).

### 3.3 Status codes
| Code | Meaning |
|---|---|
| 200 / 201 / 204 | OK / created / done, no body |
| 400 | Invalid input (`validation_failed`, `invalid_json`); `details[]` lists `{ path, code, message }` per field |
| 401 | Not signed in, session expired, or wrong credentials |
| 403 | Request rejected as cross-site (only possible when an `Origin` header is sent) |
| 404 | Not found **or not yours** |
| 409 | State conflict (archived project, final document, duplicate, email taken) |
| 412 | Stale document save (`version_mismatch`); `details.current` has the latest text |
| 413 | Too large (body, file, or storage quota) |
| 422 | Valid shape but breaks a rule (requirement not complete, cross-project link, dependency cycle, bad file) |
| 423 | Account temporarily locked |
| 429 | Rate limited; `Retry-After` header (seconds) |
| 5xx | Server problem; message is generic, details are never exposed |

Clients should branch on `error.code`, not on the English `message` (messages are written for people and may change).

### 3.4 Error code catalogue (stable)
`validation_failed`, `invalid_json`, `unauthenticated`, `forbidden`, `not_found`, `duplicate`, `payload_too_large`, `rate_limited`, `internal_error`, `version_mismatch` (412)
`auth.invalid_credentials`, `auth.locked`, `auth.email_taken`
`project.archived`, `project.deleted`, `project.bad_dates`
`milestone.bad_dates`, `milestone.bad_phase`, `milestone.dependency_cycle`
`requirement.criteria_open` (`details.open` = count), `requirement.not_met`
`link.cross_project`, `link.relation_not_allowed`
`task.same_project`
`document.final`, `document.bad_body`
`file.missing`, `file.type_not_allowed`, `file.content_mismatch`, `file.too_large`, `file.quota_exceeded`, `file.bad_url`, `file.no_download`, `file.type_changed`, `file.same_project`
Pagination: `400` with `details[0].code = "invalid_cursor"`.

---

## 4. Authentication and sessions

### 4.1 How it works today
The server issues a **session cookie**: name `tsumugi_sid`, `HttpOnly`, `SameSite=Lax`, path `/`, `Secure` only in production. The value is an opaque random token; the server stores only its SHA-256 hash. A session lasts **30 days and slides**: using the app extends it (at most once an hour). Logging out, changing the password (other devices only), or "sign out everywhere" ends sessions immediately.

### 4.2 What the Android app should do now
- Use a **persistent cookie jar** (for example OkHttp `CookieJar` backed by encrypted storage such as `EncryptedSharedPreferences`/DataStore with Tink) so the session survives restarts. Do not log cookie values.
- Do **not** send an `Origin` header (OkHttp does not by default). The cross-site check only applies when an `Origin` is present; browsers always send one, native apps do not.
- On launch call `GET /auth/session`: `200` → signed in (body is the user), `401` → show sign-in.
- On any `401` from another endpoint, treat the session as ended: clear local state and go to sign-in (keep unsent edits locally; section 11).
- Send the device's IANA time zone (for example `Asia/Taipei`) at registration (`timeZone`). If the person travels, update it with `PATCH /me { "preferences": { "timeZone": "…" } }` (section 8).

### 4.3 What is not available yet (important for mobile)
- **No bearer/refresh tokens.** Cookie sessions work from a native HTTP client, but a token model (short-lived access token plus rotating refresh token, stored in the Android Keystore) is the usual mobile pattern and is proposed in section 14 (D-01-A).
- **No email:** no verification, no password recovery, no change of email. A forgotten password cannot be recovered yet.
- **No social sign-in.**

### 4.4 Endpoints
| Method and path | Body | Result |
|---|---|---|
| `POST /auth/register` | `{ email, password, displayName, timeZone?, acceptTerms: true }` | `201` user; sets cookie. `409 auth.email_taken` if the email exists |
| `POST /auth/login` | `{ email, password }` | `200` user; sets cookie. `401 auth.invalid_credentials` (same for unknown email and wrong password), `423 auth.locked` after 5 wrong passwords (15 min) |
| `POST /auth/logout` | none | `204`; clears cookie |
| `GET /auth/session` | none | `200` user, or `401` |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `204`; **all other sessions end** |
| `GET /auth/sessions` | none | `[{ id, current, createdAt, lastSeenAt, device }]` |
| `DELETE /auth/sessions/:id` | none | `204` (sign out one device) |
| `POST /auth/logout-all` | `{ keepCurrent?: boolean }` | `204` |
| `GET /auth/activity` | none | recent sign-in and account events (last 50) |
| `GET /me`, `PATCH /me` | `{ displayName?, preferences? }` | user |
| `GET /workspace`, `PATCH /workspace` | `{ name }` | `{ id, name, type: "individual" }` |
| `GET /me/export` | none | JSON file download (all the person's data, no secrets) |
| `POST /me/delete` | `{ password, confirm: "DELETE" }` | `204`; **permanently** deletes the account, data, and files |

**User object**
```json
{ "id": "…", "email": "a@b.co", "displayName": "Ada", "workspaceId": "…",
  "preferences": { "theme": "system|light|dark", "weekStart": "monday|sunday", "shortcuts": true,
                   "motion": "system|reduced", "timeZone": "Asia/Taipei", "firstRunDismissed": false } }
```
`shortcuts` is a web keyboard setting; the app can ignore it. `theme`, `weekStart`, `motion`, and `timeZone` are meaningful on mobile and are saved per account.

**Password rules:** 12–128 characters, not the email or display name, not a common password. The server returns `400` with `details[0].path = "password"` (or `newPassword`) and a message.

---

## 5. Data model (what the app receives)

All records are returned in the **same shape the web app uses**. Ids are strings. Fields shown with `?` may be absent or `null`.

### 5.1 Vocabulary (exact strings, case and spaces matter)
| Concept | Values |
|---|---|
| Project status | `Planning`, `Active`, `On hold`, `Done` (archived is a separate flag) |
| Project kind | `software`, `creative`, `research`, `multimedia`, `blank` |
| Tone (colour) | `pink`, `blue`, `lilac`, `yellow`, `green` |
| Task status | `To do`, `Doing`, `Done` (blocked is a separate flag) |
| Priority | `normal`, `high` |
| Requirement type | `Functional`, `Non-functional` |
| Requirement status | `Open`, `Met` (verified is a separate flag) |
| Document status | `Draft`, `Final` |
| File kind | `document`, `image`, `media`, `data`, `link` |
| Repeat | `daily`, `weekly`, `monthly`, `yearly` |
`GET /vocab` returns these lists and limits so the app need not hard-code them.

### 5.2 Project
`id, name, slug, category, kind, status, tone, tags[], description, objective, start (date), end (date), phases[] (names), phaseIndex, updatedAt (date), lastOpenedAt (local datetime), archived (bool), archivedAt (date)?`
`objective` is the root of traceability ("why the project exists").

### 5.3 Milestone
`id, projectId, title, description, start, due (dates), phase (index into project.phases), done, blocked, afterId?` — `afterId` is a dependency on another milestone of the same project (no cycles).

### 5.4 Task
`id, projectId, milestoneId?, title, notes, status, priority, due (date)?, blocked, subtasks[{ id, text, done }], requirementIds[], fileIds[], changeIds[], recurrence?{ freq, interval }, seriesId?`

### 5.5 Requirement
`id, projectId, key ("REQ-001"), title, type, status, verified, milestoneId?, description, acceptance[{ id, text, met }], taskIds[], fileIds[]`
Show `key` to people; it is unique per project and never reused.

### 5.6 Library item (file, link, or document)
Common: `id, projectId, name, kind, ext, bytes, tags[], description, isFinal, milestoneId?, requirementIds[], taskIds[], updatedAt (date)`
- **Uploaded file:** also `downloadable: true`. **Link:** `kind: "link"`, `url`, `host`.
- **Document (Markdown note):** has `isDoc: true`, `status`, `version`, `body`, and `kind: "document"`. **The presence of `isDoc` (or a `body` field) is how to tell a document from a file.**

### 5.7 Change (History entry)
`id, projectId, at (local datetime), summary, recordType (Project|Milestone|Task|Requirement|File), recordId, reviewed, requirementIds[], taskIds[], fromVersion?, toVersion?, diff?[{ mark: "=" | "+" | "-", text }]`
`diff` is present on document changes in the snapshot (up to the 30 newest) and always available from the diff endpoint.

### 5.8 Relationships (traceability)
`objective → requirement → milestone → task → change → final file`. Links are stored and validated by the server. Many-to-many links are exposed as id arrays: `task.requirementIds`, `task.fileIds`, `requirement.taskIds`, `requirement.fileIds`, `file.requirementIds`, `file.taskIds`, `change.requirementIds`, `change.taskIds`. To change them, `PATCH` the record with the full new array. Both ends must be in the **same project** (`422 link.cross_project` otherwise). A requirement is "covered" when it has a linked task **and** a linked **Final** file or document.

---

## 6. Endpoint reference (data)

All require a session. Bodies are strict. `{id}` is a 24-hex id.

### 6.1 Loading everything
| Call | Notes |
|---|---|
| `GET /workspace/snapshot` | The whole workspace in one response: `{ today, now, projects, milestones, tasks, requirements, files, changes }` in the shapes above. **Recommended first load** (section 10) |
| `GET /home` | `{ today, figures{dueToday,overdue,doing}, attention{overdue,today,doing}, upNext[], recentProjects[] }` |
| `GET /insights?projectId=` | `{ today, progress[], coverage{total,complete,withGaps,missingTask,missingFile}, overdue[] }` |
| `GET /search?q=&limit=` | `[ { type, id, title, subtitle, href } ]` — `href` is a **web** route; map `type` and `id` to app screens instead |
| `GET /templates` | Project templates (kind, label, phases, starter milestone and tasks) |
| `GET /vocab`, `GET /metrics/definitions` | Vocabulary and the plain-language rule for each metric |

### 6.2 Projects
| Call | Body / notes |
|---|---|
| `GET /projects?archived=false\|true\|any&status=&q=` | List (default hides archived) |
| `POST /projects` | `{ name (required), templateKind?, kind?, category?, status?, tone?, tags?, description?, objective?, start?, end?, phases?, phaseIndex? }`. With `templateKind` the server also creates the starter milestone and tasks |
| `GET /projects/:id`, `PATCH /projects/:id` | Patch fields as above plus `archived: boolean`. Archived projects are read-only (`409 project.archived`) except to unarchive |
| `DELETE /projects/:id` | `204`; soft delete of the project **and everything in it** |
| `GET /projects/recent?limit=`, `GET /projects/by-slug/:slug` | Convenience lookups |
| `GET /projects/:id/summary` | `{ today, progress{done,total,pct}, health, counts, nextMilestone, coverage }` |
| `GET /projects/:id/coverage` | `{ coverage, gaps[{ code, … }] }` |
| `GET /projects/:id/timeline` | Milestones with derived `state` and `progress`, plus `window` and `phases` |
| `POST /projects/:id/open` | Marks "recently opened"; call when the person opens a project (GETs never write) |

### 6.3 Milestones
`GET /milestones?projectId=&done=` · `POST /milestones { projectId, title, start, due, description?, phase?, afterId? }` · `PATCH /milestones/:id { title?, description?, start?, due?, phase?, done?, blocked?, afterId? }` · `DELETE /milestones/:id` (its tasks, requirements, and files are kept and detached). Rules: `due ≥ start`; `phase` must exist in the project; no dependency cycles. Marking `done: true` clears `blocked`.

### 6.4 Tasks
| Call | Notes |
|---|---|
| `GET /tasks?projectId=&milestoneId=&status=&priority=&q=` | `status` may repeat |
| `GET /page/tasks?limit=&cursor=&projectId=&status=` | Paginated (section 7) |
| `POST /tasks` | `{ projectId, title (required), notes?, status?, priority?, due?, blocked?, milestoneId?, subtasks?[{text,done}], recurrence?{freq,interval 1–30}, requirementIds?, fileIds? }` |
| `GET /tasks/:id`, `PATCH /tasks/:id` | Any of the create fields. `status: "Done"` clears `blocked` and sets completion; moving away from `Done` clears completion |
| `DELETE /tasks/:id`, `POST /tasks/:id/restore` | Soft delete and undo |
| `POST /tasks/:id/move` | `{ projectId, milestoneId? }` — clears the old project's links |
| `POST /tasks/bulk` | `{ ids[1..100], action: "complete"\|"status"\|"priority"\|"due"\|"blocked"\|"delete", value? }`. If any id is not yours nothing changes (`404`) |

**Repeating tasks:** finishing a task with `recurrence` creates the next occurrence on the server (same title, notes, priority, milestone, links; subtasks reset to not done; new due date from the rule, never in the past; month ends clamp, so 31 Jan + 1 month = 28 Feb). The next task appears in the list on the next fetch; the app should refetch after completing a repeating task.

### 6.5 Requirements
`GET /requirements?projectId=` · `GET /requirements/by-key/:projectId/:key` · `POST /requirements { projectId, title, type?, status?, verified?, milestoneId?, description?, acceptance?[{text,met}], taskIds?, fileIds? }` · `PATCH /requirements/:id` (same fields) · `DELETE /requirements/:id`.
Server rules the app should mirror in its UI:
- A requirement can be `Met` only if **every** acceptance criterion is met (a requirement with no criteria can be marked met directly): otherwise `422 requirement.criteria_open`.
- Un-ticking a criterion on a `Met` requirement **reopens** it and clears `verified`.
- `verified` is only allowed while `Met` (`422 requirement.not_met`).

### 6.6 Library: files, links, documents
| Call | Notes |
|---|---|
| `GET /library?projectId=` | Files, links, and documents in one list |
| `POST /files` | `multipart/form-data` (section 9) |
| `POST /files/links` | `{ projectId, name, url (http/https), description?, tags? }` |
| `PATCH /files/:id` | `{ name?, description?, tags?, isFinal?, milestoneId?, requirementIds?, taskIds? }` |
| `POST /files/:id/replace` | multipart `file`; same extension required |
| `POST /files/:id/move` | `{ projectId }` |
| `GET /files/:id/download[?inline=1]` | Streams the file (section 9) |
| `DELETE /files/:id` | Soft delete |
| `GET /files/usage` | `{ usedBytes, limitBytes, fileCount }` |
| `POST /documents` | `{ projectId, title?, body?, description?, tags?, milestoneId? }` → creates version 1 |
| `GET /documents/:id` | Includes the current `body` |
| `PATCH /documents/:id` | Metadata, or `{ body, baseVersion, summary? }` to save text (see below) |
| `POST /documents/:id/finalize` / `unfinalize` | Final documents cannot be edited (`409 document.final`) |
| `GET /documents/:id/versions`, `…/versions/:n`, `POST …/versions/:n/restore`, `GET …/diff?from=&to=`, `GET …/export` | History, restore as a new version, line diff, Markdown download |
| `POST /documents/:id/move`, `DELETE /documents/:id` | |

**Saving document text:** send `baseVersion` = the `version` you loaded. If someone (another device) saved since, you get `412 version_mismatch` and `error.details.current = { version, body }`; show the person both texts or reload, never silently overwrite. Maximum 200 KB of text. Every save creates a new immutable version.

### 6.7 History and recovery
| Call | Notes |
|---|---|
| `GET /changes?projectId=&recordId=&limit=` | Newest first |
| `GET /page/changes?limit=&cursor=&projectId=` | Paginated, no diffs |
| `PATCH /changes/:id` | `{ reviewed: boolean }` (the only editable field) |
| `GET /records/:type/:id/trace` and `/links` | `type`: `task`, `requirement`, `file`, `milestone`. Returns `{ why[], becomes[], gaps[] }`: "why it exists" and "what it became" |
| `GET /trash` | Deleted in the last 30 days: `[{ type, recordType, id, title, projectId, projectName, deletedAt }]` |
| `POST /trash/:type/:id/restore` | `type`: `project`, `task`, `milestone`, `requirement`, `file`, `document`. Restoring a child of an archived or deleted project is refused (`409`) |
| `GET /calendar.ics` | iCalendar file of open tasks with a due date and open milestones |

---

## 7. Pagination

Only `GET /page/tasks` and `GET /page/changes` are paginated; other lists return everything. Query `limit` (1–100, required) and `cursor` (optional). Response: `{ data: [...], meta: { nextCursor: string|null, hasMore: boolean } }`. Pass `meta.nextCursor` back unchanged. Cursors are signed and **only valid until the server restarts**; on `400 invalid_cursor` start again from the first page. Pages never repeat or skip records.

---

## 8. Time zones and "today"

- Task and milestone dates are plain `YYYY-MM-DD` strings with **no time and no zone**. Show them as-is; never convert them through a device time zone (that causes off-by-one-day bugs).
- "Today", "overdue", and "due today" are decided **on the server** in the account's `preferences.timeZone`. The snapshot, `/home`, and `/insights` return `today` (`YYYY-MM-DD`). Use that string, not the phone's clock, when labelling or colouring dates, so the app and the web app always agree.
- `Change.at` and `lastOpenedAt` are local datetimes (`YYYY-MM-DDTHH:mm:ss`) in the account's zone, without an offset. `createdAt`/`expiresAt` style fields on sessions and activity are UTC ISO strings.
- Set `timeZone` at registration and keep it current with `PATCH /me`.

---

## 9. Files

- **Upload:** `POST /files` as `multipart/form-data` with parts `file` (the bytes), `projectId`, optional `description`, and optional `tags` (comma-separated string). Do not set the part's file name to a path; send just the name.
- **Allowed types** (by extension, and the contents must match): documents (`pdf docx doc odt rtf txt md pptx epub`), images (`png jpg jpeg gif webp svg`), audio/video (`mp3 wav ogg flac mp4 webm mov m4a`), data (`csv tsv json xlsx ods zip`). Anything else is `422 file.type_not_allowed`; a renamed file whose contents do not match is `422 file.content_mismatch`.
- **Limits:** 100 MB per file (`413 file.too_large`), 1 GB per account (`413 file.quota_exceeded`). Files go **through the API** today (no direct-to-storage uploads), so use a streaming `RequestBody` and show progress; large uploads on mobile data may be slow.
- **Download:** `GET /files/:id/download` returns an attachment. Add `?inline=1` for images, PDF, audio, and video to get the right content type. SVG is always a download, never inline. Links (`kind: "link"`) have no file: open `url` in the browser.
- **Sample data caveat:** files from `npm run seed` are metadata only (`downloadable` is `false`): they have no stored bytes.

---

## 10. Recommended data flow for the app

1. **Launch:** `GET /auth/session`. `401` → sign-in screen.
2. **After sign-in:** `GET /workspace/snapshot` and cache it in a local database (Room). It is one request, shaped for screens, and includes `today`. The web app does exactly this.
3. **Reads:** render from the local cache; refresh the snapshot when the app returns to the foreground and after any write that changes derived data (completing a task, finishing a repeating task, marking a requirement met, uploading a file, document changes).
4. **Writes:** call the granular endpoint (`PATCH /tasks/:id`, …); apply the optimistic change locally, replace the local record with the server's response (the response is the full updated record in the same shape), roll back and show the message on error.
5. **Deletes:** use the soft-delete endpoint, show "Undo" for a few seconds (the restore endpoints exist for tasks and projects, and `/trash/:type/:id/restore` for every kind).
6. **Big workspaces:** the snapshot is not paginated or incremental (section 14, D-01-C). It is fine for one person's workspace (hundreds of tasks); report it if it becomes slow.

**Do not retry creates automatically.** There are no idempotency keys yet (section 14), so a retried `POST` after a timeout can create a duplicate task or project. After a network error on a create, refetch the list and check before offering "try again". `PATCH`, `DELETE`, and restore are safe to repeat.

---

## 11. Offline and conflicts (what the server gives you)

- The server has **no sync protocol**: no change feed, no `updatedSince`, no ETags, no `If-Match`. Except for document text (`baseVersion`), concurrent edits are **last write wins**.
- A reasonable offline approach until sync is added: keep an outbox of pending writes in Room; send them in order when online; on `404` for a record that was deleted elsewhere, drop that write and tell the person; on `409`/`422`, surface the message and keep the item for the person to fix; on `401`, keep the outbox and ask them to sign in.
- Keep `PATCH` bodies minimal (only the changed fields) so a stale device overwrites as little as possible.
- Never store the person's password. If a session expires offline, queue work and ask them to sign in when back online.

---

## 12. Limits and rate limiting

| Limit | Value |
|---|---|
| `POST /auth/login` | 30 per 15 minutes per IP; account locks for 15 minutes after 5 wrong passwords (`423`) |
| `POST /auth/register` | 20 per hour per IP |
| `POST /auth/change-password` | 10 per 15 minutes |
| `GET /me/export` | 10 per hour; `POST /me/delete` 5 per hour |
| Strings | task/requirement/document titles 200; project name 120; milestone title 160; tags 30 characters × 20; subtasks 50 per task; acceptance criteria 30 per requirement; phases 20; document text 200 KB; notes 20,000 |
| Bulk | 100 ids per request |

Exceeding a rate limit returns `429` with `Retry-After`. The limiter is in memory per server process and applies by IP, so many phones behind one NAT share a bucket. These numbers will be revisited for deployment.

---

## 13. Security notes for the app

- Production **must** use HTTPS only. The local backend has none; do not ship a build that allows cleartext.
- Store the session cookie (or, later, tokens) in encrypted storage; never log cookies, passwords, or request bodies of auth calls.
- The app never needs to know a storage path or key; files are addressed by record id and checked against the signed-in account on every request.
- Never trust the app for authorization: the server re-checks every request. A different account's ids always return `404`.
- User text (titles, notes, Markdown) is stored as plain data and **never rendered by the server**. The app must render it safely (no raw HTML in a `WebView`; use a Markdown renderer that does not allow HTML).
- Account deletion and data export exist (`/me/delete`, `/me/export`); store policies (Google Play data safety, account deletion in-app and on the web) will likely require surfacing them in the app and linking the privacy policy (the legal pages are still drafts; see [PLAN-C-01](PLAN-C-01.md)).

---

## 14. Gaps for mobile and proposed backend work

Nothing below exists yet. IDs are proposals; "owner needed" means it also depends on a [PLAN-C-01](PLAN-C-01.md) item.

| ID | Need | Why mobile needs it | Proposed work | Depends on |
|---|---|---|---|---|
| D-01-A | **Token auth** | Mobile best practice: short-lived access token + rotating refresh token in Keystore; avoids cookie-jar edge cases | `POST /auth/token` (login), `/auth/refresh`, `/auth/revoke`; `Authorization: Bearer`; per-device sessions already listable | none |
| D-01-B | **HTTPS and a public address** | Android release builds need TLS; app links need a domain | Deployment (PLAN-B-16) | C1-02, C1-03 |
| D-01-C | **Delta sync** | Avoid downloading the whole workspace every time | `GET /sync?since=` returning changed and deleted records; `updatedAt`/`deletedAt` exposure; a server `version` counter | none |
| D-01-D | **Idempotency keys** | Safe retries of creates on flaky mobile networks | `Idempotency-Key` header on `POST` creates | none |
| D-01-E | **ETag / If-Match** | Detect conflicting edits instead of last-write-wins | `version` on records, `412` on stale writes | none |
| D-01-F | **Push notifications** | Reminders and "due today" | FCM device tokens table, a job runner, reminder scheduling (PLAN-B-19) | Firebase project (owner) |
| D-01-G | **Email flows** | Password recovery and verification; in-app deep links | Email service (PLAN-B-04) | C1-01 |
| D-01-H | **Direct-to-storage uploads** | Large files over mobile data without proxying through the API | Presigned uploads (PLAN-B-10) | C1-04 |
| D-01-I | **OpenAPI document** | Generate the Kotlin client and keep it in sync | Generate from the Zod schemas; publish `openapi.json` | none |
| D-01-J | **Mobile-sized endpoints** | Smaller payloads for list screens | `fields=`/`expand=` parameters, thumbnails for images | none |
| D-01-K | **App-aware compatibility** | Old app versions after API changes | `X-Client-Version` header, a minimum-version response, deprecation policy | none |
| D-01-L | **Google Play requirements** | Data-safety form and in-app account deletion | Already: `/me/delete`, `/me/export`; needs published privacy policy | C1-14 |

---

## 15. What changed in the backend (for the mobile team's catch-up)

Everything below exists and is covered by the 39-test suite (`npm test --prefix Server`), including an automated check that **no route lets one account see another's data**.

- **Accounts:** register, log in, log out, session, change password, preferences, devices (list/revoke/sign out everywhere), activity log, export, account deletion, workspace rename.
- **Core records:** projects (templates, archive, delete/restore, summary, coverage, timeline, slug and recents lookups), milestones (dependencies, phases), tasks (subtasks, links, repeating, bulk, move, delete/restore, pagination), requirements (atomic `REQ-###` keys, acceptance criteria and the "met" rules, links, lookup by key).
- **Library:** uploads with content checks and quota, links, Final flag, replace, move, download, Markdown documents with versions, diff, restore-as-new-version, finalize, move, export.
- **Traceability and history:** validated links, trace endpoint, History with reviewed flag, document diffs.
- **Insights:** Home, Insights, project summary, search, metric definitions.
- **Safety:** Recently deleted (30-day restore for every kind), purge of old deleted data, strict validation, `404` for anything not yours, locked-down response headers, upload content checks, integrity checker (`npm run check:integrity`).
- **Operations:** server lint, GitHub Actions CI, optional `HOST` setting so an emulator or phone can reach the local API (added with this handoff).

---

## 16. Derived numbers the app should show the same way

Use the server's definitions so mobile and web agree (also at `GET /metrics/definitions`):

| Metric | Rule |
|---|---|
| Open task | status is not `Done` |
| Overdue task | open and `due < today` (today = server's `today`) |
| Due today | open and `due == today` |
| Project progress | done tasks ÷ all tasks, rounded to a whole percent; show "no tasks yet" (not 0%) when there are none |
| Milestone state | `Done` if done; else `Overdue` if `due < today`; else `Doing` if `start ≤ today`; else `Upcoming` |
| Project health | `At risk` if any open task of the project is overdue, else `On track` (shown for Active projects) |
| Coverage | complete = `Met` and verified; a gap = no linked task, or no linked Final file/document |

The snapshot does not include these numbers per record; the app derives them from the snapshot (as the web app does), or can call `/home`, `/insights`, and `/projects/:id/summary`.

---

## 17. Test accounts, data, and tools

- **Demo account:** `demo@tsumugi.local` / `demo-password-1` after `npm run seed` (six projects, 15 tasks, 9 requirements, documents with versions, history). Re-running the seed resets that account only.
- **Fresh account:** register through the API; the workspace starts empty (templates available through `POST /projects { templateKind }`).
- **Reset everything:** stop the API, delete `Server/.data` and `Server/uploads`.
- **Run the server tests:** `npm test` from the repo root. The tests are the best executable examples of request and response shapes: `Server/test/work.test.js`, `extras.test.js`, `auth.test.js`.
- **Seeing requests:** the API logs unexpected errors only. Use an OkHttp logging interceptor in debug builds (redact `Cookie`, `Set-Cookie`, and auth bodies).

---

## 18. Open questions for the mobile team

1. Offline scope for v1: read-only cache, or full offline writes with an outbox? (This decides how soon D-01-C and D-01-E are needed.)
2. Token auth (D-01-A) before or after the first internal build? Cookie jar works for development.
3. Which screens need pagination or smaller payloads (D-01-J)? Tell us the largest lists you expect.
4. Notifications: what should reminders say and when (feeds D-01-F)?
5. Will the app ship file upload from the camera/gallery in v1? (Affects D-01-H and the 100 MB limit.)
6. Minimum Android version and Play Store timeline (drives D-01-B and D-01-L).

Please send answers and any shape or behavior you find surprising; we will update this document and the matching `PLAN-B` module plans.

---

## 19. Document maintenance

Update this document whenever an endpoint, a field, an error code, or a rule changes, in the same change as the code (see [INSTRUCTIONS.md](../INSTRUCTIONS.md)). When a section 14 item is built, move it to section 15 and note the date.
