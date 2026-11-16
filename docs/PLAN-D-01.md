# PLAN-D-01 — Backend Handoff for the Mobile App (Flutter / Android)

**Revision:** 2 · **Status:** Handoff, current as of 2026-11-16 · **Series:** PLAN-D is the mobile-app series (PLAN-A frontend, PLAN-B backend, PLAN-C owner actions).
**Audience:** whoever works on `tsumugi-mobile` (Flutter / Dart, Riverpod, go_router). This document says what the backend does today, exactly how to talk to it, how the current mobile code maps onto it, and what has to change on each side.
**Mobile repository reviewed:** `../tsumugi-mobile` at commit `d98db05` ("Add reference sheet for aligning the website with the mobile app"), 2026-11-16: `README.md`, `CONTEXT.md`, `pubspec.yaml`, `lib/core/data/*`, `lib/core/settings/preferences.dart`, `lib/core/quickadd/parse.dart`, the Android manifests, and the privacy test. **Nothing in the mobile repository was changed.**
**Source of truth:** the running code in `Server/` (routes in `Server/src/routes/`, rules in `Server/src/services/`) and its tests. Where this document and the code disagree, the code wins; please tell us. Design intent is in [PLAN-B-00](plan/backend/PLAN-B-00.md) and the module plans.

> **What the backend is.** A **local MVP**: one computer, no HTTPS, no email, no hosting. It is enough to build and test the app against. Section 15 lists what mobile still needs from the backend before release.

---

## 0. Sanity check of revision 1 (what was wrong, what was verified)

Revision 1 was written before the mobile repository was available. It has now been checked three ways: against the mobile code, against the live API (39 scripted HTTP claims), and against the Dart models (every field the snapshot returns, for two accounts).

### 0.1 Corrections (revision 1 was wrong or unfit for this app)

| # | Revision 1 said | Reality | Fixed in |
|---|---|---|---|
| 1 | The app is Kotlin (Compose, OkHttp, Room, Keystore) | It is **Flutter / Dart**: Riverpod state, go_router, `flutter_markdown_plus`, bundled Fredoka. Android is the only runner | Sections 2, 4.2, 10, 11, 13 |
| 2 | "The mobile repo was not reviewed" | Reviewed (see header) | Header |
| 3 | The app can simply start calling the API | The app has an **owner decision on record (2026-11-14, "play-demo")**: no backend, no network code, no persistence, no `INTERNET` permission in release, enforced by `test/privacy_test.dart` (it bans `http`, `dio`, `shared_preferences`, `sqflite`, `hive`, `isar`, `firebase_*`, `path_provider`, `url_launcher`, `dart:io` imports in `lib/`, and checks the manifest). Connecting to a backend **reverses that decision** | Section 3, and [PLAN-C-01](PLAN-C-01.md) item C1-27 |
| 4 | Snapshot can feed the app's `Fixtures.fromJson` directly | The snapshot has **no `templates` key**, and `Fixtures.fromJson` reads `j['templates'] as List`, so it would throw. Templates come from `GET /templates` | Section 6.1, 10 |
| 5 | Requirement ids can be shown to people | The app prints `requirement.id` as the label (`records.dart:212`, `record_sheets.dart:312`). With the real backend `id` is a 24-character ObjectId; the readable label is the new field **`key`** (`REQ-001`), which the Dart `Requirement` model does not have yet | Sections 5.5, 10.3 |
| 6 | "Use the server's `today`" in general terms | The app hard-codes `demoToday = '2026-11-12'` and `demoNow` as **constants** in `lib/core/data/format.dart`, used by `selectors.dart`, `quickadd/parse.dart`, and the tests. They must become values supplied by the snapshot | Section 8, 10.3 |
| 7 | Preferences map one-to-one | The app has `themeMode`, `textScale`, `reduceMotion`, `weekStartsSunday` (and a vibration setting). The server stores `theme`, `weekStart`, `motion`, `timeZone`, `shortcuts`, `firstRunDismissed`. **`textScale` and vibration have no server field** | Section 10.4 |
| 8 | Recommended Room, OkHttp, EncryptedSharedPreferences, "WebView" Markdown advice | Replaced with Flutter equivalents (Dio + cookie jar, secure storage, a local database, `flutter_markdown_plus`) | Sections 4.2, 10, 13 |
| 9 | Rate limit and snapshot claims | Unchanged and verified (below) | — |
| 10 | The web parity tool is current | `tsumugi-mobile/tool/export_fixtures.mjs` reads `../CTINASSL_Activity/client`; the website now lives in `../tsumugi-webapp/client` | Section 10.7 |

### 0.2 Verified (revision 1 claims that stand)

**Live HTTP check, 39 claims, 39 passed** (script run against the running API, 2026-11-16): `/health` public and everything else 401 without a session; `POST /auth/logout` is 204 without a session; register 201 with the time zone saved; cookie is `tsumugi_sid`, `HttpOnly`, `SameSite=Lax`, `Path=/`, **not** `Secure` in development; responses carry `Cache-Control: no-store` and `X-Request-Id`; a foreign `Origin` header gives 403 while a request with no `Origin` is fine (native apps send none); wrong password gives `auth.invalid_credentials`; weak password is 400 with `details[0].path = "password"`; malformed id is 400, missing id is 404; unknown body field is 400; repeated `status` query works; `/page/tasks` needs `limit`, returns `meta.nextCursor`/`hasMore`, and a bad cursor is `400 invalid_cursor`; requirement keys start at `REQ-001`; marking a requirement met with open criteria is `422 requirement.criteria_open` with `details.open`; a bulk call with a foreign id is 404 and changes nothing; finishing a repeating task creates the next one (+7 days); trace returns `why`/`becomes`/`gaps`; `/calendar.ics` is `text/calendar`; an empty document still has `body: ""`, `isDoc: true`; multipart upload is 201 with `downloadable: true` and no `body` field; download is an attachment; a stale document save is `412 version_mismatch` with `details.current`; editing a Final document is `409 document.final`; delete then restore through `/trash`; session list marks the current device; account deletion needs the password and `DELETE` and kills the cookie.

**Dart model check:** the snapshot of the seeded demo account (6 projects, 9 milestones, 15 tasks, 9 requirements, 18 library items, 10 changes) and of a fresh account were checked field by field against the exact casts in `models.dart` (`Project`, `Milestone`, `Task`, `Subtask`, `Requirement`, `Criterion`, `WorkFile`, `Change`, `DiffLine`, `ProjectTemplate`): **0 type problems**. Extra fields the server sends (`recurrence`, `seriesId`, `key`, `isDoc`, `downloadable`, `url`, `today`, `now`, subtask and criterion `id`s) are ignored by `fromJson`, so they do no harm. The app's rule "a document is a `WorkFile` with a non-null `body`" (`f.body != null`) holds for the API: documents always carry `body` (possibly `""`), files and links never do. The change type `Project` (new in the API) is already handled by `selectors.dart`.

### 0.3 What this revision adds
A mobile-specific integration guide (section 10), a screen-by-screen map of every demo action to a real endpoint (section 11), real response samples to test against (`docs/samples/`, section 20), and the owner decision it depends on (C1-27).

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
| Ids | 24-character hex strings (MongoDB ObjectIds). Opaque. **Readable labels are separate fields** (`key` on requirements, `slug` on projects) |
| Dates | Calendar dates `YYYY-MM-DD` in the **person's time zone**; display datetimes are local `YYYY-MM-DDTHH:mm:ss` without offset; instants (sessions, activity) are UTC ISO-8601 |
| Versioning | Path prefix `/v1`. Additive changes (new optional fields, new endpoints) will not bump it |
| Rate limits | In-memory, per IP, on auth and export routes (section 13) |
| Machine-readable spec | **None yet** (no OpenAPI). Use this document, `docs/samples/`, and the tests |

---

## 2. The mobile app today (what the backend has to fit)

From the mobile repository's own docs and code:

- **Stack:** Flutter (Dart 3), Material 3, `flutter_riverpod`, `go_router` (`StatefulShellRoute`), `flutter_markdown_plus`, `lucide_icons_flutter`, `intl`, bundled Fredoka. Package `tsumugi_mobile`, Android id `com.moekoworks.tsumugi_mobile`. Android only; iOS runner is future work.
- **Screens:** Welcome, demo sign-in/register/forgot/reset, Home, Tasks (Today, Upcoming, Calendar, All), Quick add sheet, Projects, project page (Overview, Work, Specs, Files, History), Library and document reader, Insights, Account, Help, Search, three legal drafts, launcher shortcuts (`tsumugi:///tasks`, Today, Search).
- **Data layer:** immutable Dart records in `lib/core/data/models.dart` that mirror the website's fixtures; `selectors.dart` derives every number (progress, health, overdue, coverage) from the lists; `workspace_store.dart` loads `assets/data/fixtures.json` (generated from the website) and keeps **session-only changes as an in-memory overlay** (`SessionState`: added records, `taskOverrides`, `deletedTaskIds`, 20-step Undo). Nothing is persisted.
- **Today:** a constant, `demoToday = '2026-11-12'` (`format.dart`).
- **Status:** all screens exist; 242 automated tests; run on a Galaxy A05s (Android 15); TalkBack pass and usability sessions not done.
- **Real inside the session:** complete, reopen, change status, reschedule, block, edit title and notes, tick subtasks, delete a task (with Undo), Quick add, templates, theme/text size/reduce motion/week start. **Still a "Preview only" sheet:** editing a project, the reader's Edit button, milestone and requirement writes, New note, sign-in.

This is close to the backend's shape by design: the app was ported from the same website fixtures the API reproduces.

---

## 3. Decision required before any networking (play-demo)

`mobile/CONTEXT.md` records a rule that applies to "all future work": the app never gets a backend or online service, never saves anything on the device, and requests no permissions; `test/privacy_test.dart` enforces it. A backend-connected app **contradicts that rule**, so the owner has to lift or narrow it (item **C1-27** in [PLAN-C-01](PLAN-C-01.md)). Suggested narrowing, so the privacy promise stays checkable:

1. The **release** manifest gains `INTERNET` (only). No other permissions.
2. Networking and storage code lives in one folder (for example `lib/core/net/` and `lib/core/store/`); `privacy_test.dart` is updated to allow `dio`/`cookie_jar` and the chosen storage package **only there**, and still bans analytics and Firebase unless that is decided too.
3. **Demo mode stays.** The Welcome screen's "Continue as demo user" keeps running on bundled fixtures with no network (as the website keeps `/home?demo`), so the play-demo promise still holds for people who never sign in.
4. Privacy copy changes: the bundled legal drafts and Account's "this demo stores nothing" text must say what is stored (session, cached workspace) and where.

---

## 4. Authentication and sessions

### 4.1 How it works today
The server issues a **session cookie**: name `tsumugi_sid`, `HttpOnly`, `SameSite=Lax`, path `/`, `Secure` only in production. The value is an opaque random token; the server stores only its SHA-256 hash. A session lasts **30 days and slides** (extended at most once an hour). Logging out, changing the password (other devices only), or "sign out everywhere" ends sessions immediately.

### 4.2 What the Flutter app should do now
- Use **Dio** with a **cookie manager** (`dio_cookie_manager` + `cookie_jar`, using a persistent jar). The default persistent jar writes cookies to a file; to keep the session token out of plain storage, back the jar's `Storage` with `flutter_secure_storage` (Android Keystore) instead of a plain file. Check the current package documentation for the exact `Storage` interface.
- Do **not** send an `Origin` header (Dart's `HttpClient` does not). The cross-site check only applies when `Origin` is present.
- On launch call `GET /auth/session`: `200` → signed in (body is the user), `401` → show Welcome/sign-in.
- On any `401` from another endpoint, treat the session as ended: clear the cache, go to sign-in, keep unsent edits (section 12).
- Send the device's IANA time zone at registration (`timeZone`, for example `Asia/Taipei`; obtainable with a package such as `flutter_timezone`). If the person travels, update with `PATCH /me { "preferences": { "timeZone": "…" } }`.

### 4.3 Not available yet (matters for mobile)
- **No bearer/refresh tokens** (cookie works from Dio, but tokens in the Keystore are the usual mobile pattern): proposed as D-01-A (section 15).
- **No email:** no verification, recovery, or change of email. A forgotten password cannot be recovered. The app's recovery screens stay demo-only.
- **No social sign-in.**

### 4.4 Endpoints
| Method and path | Body | Result |
|---|---|---|
| `POST /auth/register` | `{ email, password, displayName, timeZone?, acceptTerms: true }` | `201` user; sets cookie. `409 auth.email_taken` if the email exists |
| `POST /auth/login` | `{ email, password }` | `200` user; sets cookie. `401 auth.invalid_credentials` (same for unknown email and wrong password), `423 auth.locked` after 5 wrong passwords (15 min) |
| `POST /auth/logout` | none | `204`; clears cookie (also `204` with no session) |
| `GET /auth/session` | none | `200` user, or `401` |
| `POST /auth/change-password` | `{ currentPassword, newPassword }` | `204`; **all other sessions end** |
| `GET /auth/sessions` | none | `[{ id, current, createdAt, lastSeenAt, device }]` |
| `DELETE /auth/sessions/:id` | none | `204` (sign out one device) |
| `POST /auth/logout-all` | `{ keepCurrent?: boolean }` | `204` |
| `GET /auth/activity` | none | recent account events (last 50) |
| `GET /me`, `PATCH /me` | `{ displayName?, preferences? }` | user |
| `GET /workspace`, `PATCH /workspace` | `{ name }` | `{ id, name, type: "individual" }` |
| `GET /me/export` | none | JSON file download (all the person's data, no secrets) |
| `POST /me/delete` | `{ password, confirm: "DELETE" }` | `204`; **permanently** deletes the account, data, and files |

**User object** (`docs/samples/api-user.json`)
```json
{ "id": "…", "email": "a@b.co", "displayName": "Ada", "workspaceId": "…",
  "preferences": { "theme": "system|light|dark", "weekStart": "monday|sunday", "shortcuts": true,
                   "motion": "system|reduced", "timeZone": "Asia/Taipei", "firstRunDismissed": false } }
```
**Password rules:** 12–128 characters, not the email or display name, not a common password. The server returns `400` with `details[0].path = "password"` (or `newPassword`) and a message. The web form shows the same three hints (length, mixed case, number or symbol); only the length is enforced.

---

## 5. Data model (what the app receives)

All records are returned in the **same shape the app's models already expect** (they come from the same website fixtures). Ids are strings.

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

`GET /vocab` returns these lists and limits.

### 5.2 Project
`id, name, slug, category, kind, status, tone, tags[], description, objective, start, end (dates), phases[] (names), phaseIndex, updatedAt (date), lastOpenedAt (local datetime), archived (bool), archivedAt (date)?` — matches the Dart `Project` (extra: `slug`). `objective` is the root of traceability.

### 5.3 Milestone
`id, projectId, title, description, start, due, phase (index), done, blocked, afterId?` — matches `Milestone`.

### 5.4 Task
`id, projectId, milestoneId?, title, notes, status, priority, due (date)?, blocked, subtasks[{ id, text, done }], requirementIds[], fileIds[], changeIds[], recurrence?{ freq, interval }, seriesId?` — matches `Task`; `recurrence`/`seriesId` and subtask `id` are new and ignored by the current `fromJson`.

### 5.5 Requirement
`id, key ("REQ-001"), projectId, title, type, status, verified, milestoneId?, description, acceptance[{ id, text, met }], taskIds[], fileIds[]`
**The Dart model has no `key`.** Add it and show `key` wherever the app shows `requirement.id` today. `key` is unique per project and never reused.

### 5.6 Library item (file, link, or document)
Common: `id, projectId, name, kind, ext, bytes, tags[], description, isFinal, milestoneId?, requirementIds[], taskIds[], updatedAt (date)`
- **Uploaded file:** also `downloadable: true`, no `body`. **Link:** `kind: "link"`, `ext: "link"`, `url`, `host`.
- **Document (Markdown):** `status`, `version`, `body` (possibly `""`), `isDoc: true`, `kind: "document"`, `ext: "md"`. The app's existing rule `body != null` identifies documents correctly.

### 5.7 Change (History entry)
`id, projectId, at (local datetime), summary, recordType (Project|Milestone|Task|Requirement|File), recordId, reviewed, requirementIds[], taskIds[], fromVersion?, toVersion?, diff?[{ mark: "=" | "+" | "-", text }]`
`diff` is present on document changes in the snapshot (up to the 30 newest) and always available from the diff endpoint. The app's `selectors.dart` already handles the `Project` record type.

### 5.8 Relationships (traceability)
`objective → requirement → milestone → task → change → final file`. Many-to-many links are exposed as id arrays; to change them `PATCH` the record with the full new array. Both ends must be in the **same project** (`422 link.cross_project`). A requirement is "covered" when it has a linked task **and** a linked **Final** file or document.

### 5.9 Templates
`GET /templates` → `[{ kind, label, category, text, phases[], milestone?, tasks[] }]`, exactly the Dart `ProjectTemplate`. **Not part of the snapshot.**

---

## 6. Endpoint reference (data)

All require a session (including `/vocab`, `/templates`, `/metrics/definitions`). Bodies are strict: unknown fields are `400`. `{id}` is a 24-hex id. Success bodies are `{ "data": … }`.

### 6.1 Loading everything
| Call | Notes |
|---|---|
| `GET /workspace/snapshot` | The whole workspace: `{ today, now, projects, milestones, tasks, requirements, files, changes }`. **Recommended first load** (section 10). Sample: `docs/samples/api-snapshot.demo.json` |
| `GET /templates` | Merge into the app's `Fixtures`/`WorkspaceData` (the snapshot omits them) |
| `GET /home` | `{ today, figures{dueToday,overdue,doing}, attention{overdue,today,doing}, upNext[], recentProjects[] }` |
| `GET /insights?projectId=` | `{ today, progress[], coverage{total,complete,withGaps,missingTask,missingFile}, overdue[] }` |
| `GET /search?q=&limit=` | `[ { type, id, title, subtitle, href } ]`; `href` is a **web** route, so map `type` + `id` to the app's routes instead (the app already has its own search over the snapshot) |
| `GET /vocab`, `GET /metrics/definitions` | Vocabulary and the plain-language rule for each metric |

### 6.2 Projects
| Call | Body / notes |
|---|---|
| `GET /projects?archived=false\|true\|any&status=&q=` | List (default hides archived) |
| `POST /projects` | `{ name (required), templateKind?, kind?, category?, status?, tone?, tags?, description?, objective?, start?, end?, phases?, phaseIndex? }`. With `templateKind` the server also creates the starter milestone and tasks (what the app's New project sheet does locally) |
| `GET /projects/:id`, `PATCH /projects/:id` | Patch fields as above plus `archived: boolean`. Archived projects are read-only (`409 project.archived`) except to unarchive |
| `DELETE /projects/:id` | `204`; soft delete of the project **and everything in it** |
| `GET /projects/recent?limit=`, `GET /projects/by-slug/:slug` | Convenience lookups |
| `GET /projects/:id/summary` | `{ today, progress{done,total,pct}, health, counts, nextMilestone, coverage }` |
| `GET /projects/:id/coverage` | `{ coverage, gaps[{ code, … }] }` |
| `GET /projects/:id/timeline` | Milestones with derived `state` and `progress`, plus `window` and `phases` |
| `POST /projects/:id/open` | Marks "recently opened" (GETs never write). Call when the person opens a project |

### 6.3 Milestones
`GET /milestones?projectId=&done=` · `POST /milestones { projectId, title, start, due, description?, phase?, afterId? }` · `PATCH /milestones/:id { title?, description?, start?, due?, phase?, done?, blocked?, afterId? }` · `DELETE /milestones/:id` (tasks, requirements, files are kept and detached). Rules: `due ≥ start`; `phase` must exist; no dependency cycles; `done: true` clears `blocked`.

### 6.4 Tasks
| Call | Notes |
|---|---|
| `GET /tasks?projectId=&milestoneId=&status=&priority=&q=` | `status` may repeat |
| `GET /page/tasks?limit=&cursor=&projectId=&status=` | Paginated (section 7) |
| `POST /tasks` | `{ projectId, title (required), notes?, status?, priority?, due?, blocked?, milestoneId?, subtasks?[{text,done}], recurrence?{freq,interval 1–30}, requirementIds?, fileIds? }` |
| `GET /tasks/:id`, `PATCH /tasks/:id` | Any create field. `status: "Done"` clears `blocked`; leaving `Done` clears completion. The response is the full updated task |
| `DELETE /tasks/:id`, `POST /tasks/:id/restore` | Soft delete and undo (the app's Undo can call restore) |
| `POST /tasks/:id/move` | `{ projectId, milestoneId? }` |
| `POST /tasks/bulk` | `{ ids[1..100], action: "complete"\|"status"\|"priority"\|"due"\|"blocked"\|"delete", value? }`; a foreign id means nothing changes (`404`) |

**Repeating tasks:** finishing a task with `recurrence` creates the next occurrence on the server (new due date from the rule, never in the past; month ends clamp). **Refetch after completing a repeating task.** The app has no recurrence UI yet; the field is ignored until it adds one.

### 6.5 Requirements
`GET /requirements?projectId=` · `GET /requirements/by-key/:projectId/:key` · `POST /requirements { projectId, title, type?, status?, verified?, milestoneId?, description?, acceptance?[{text,met}], taskIds?, fileIds? }` · `PATCH /requirements/:id` · `DELETE /requirements/:id`.
Rules to mirror in the UI: `Met` needs **every** criterion met (none defined is allowed) or `422 requirement.criteria_open`; un-ticking a criterion on a `Met` requirement **reopens** it and clears `verified`; `verified` only while `Met` (`422 requirement.not_met`).

### 6.6 Library: files, links, documents
| Call | Notes |
|---|---|
| `GET /library?projectId=` | Files, links, and documents in one list (what the app's `files` list is) |
| `POST /files` | `multipart/form-data` (section 9) |
| `POST /files/links` | `{ projectId, name, url (http/https), description?, tags? }` |
| `PATCH /files/:id` | `{ name?, description?, tags?, isFinal?, milestoneId?, requirementIds?, taskIds? }` |
| `POST /files/:id/replace`, `POST /files/:id/move` | multipart `file` (same extension) / `{ projectId }` |
| `GET /files/:id/download[?inline=1]` | Streams the file (section 9) |
| `DELETE /files/:id`, `GET /files/usage` | Soft delete; `{ usedBytes, limitBytes, fileCount }` |
| `POST /documents` | `{ projectId, title?, body?, description?, tags?, milestoneId? }` → version 1 |
| `GET /documents/:id` | Includes the current `body` |
| `PATCH /documents/:id` | Metadata, or `{ body, baseVersion, summary? }` to save text (below) |
| `POST /documents/:id/finalize` / `unfinalize` | Final documents cannot be edited (`409 document.final`) |
| `GET /documents/:id/versions`, `…/versions/:n`, `POST …/versions/:n/restore`, `GET …/diff?from=&to=`, `GET …/export` | History, restore as a new version, line diff, Markdown download |
| `POST /documents/:id/move`, `DELETE /documents/:id` | |

**Saving document text:** send `baseVersion` = the `version` you loaded. If another device saved since, you get `412 version_mismatch` with `error.details.current = { version, body }`: show both texts or reload; never silently overwrite. Maximum 200 KB. Every save is a new immutable version.

### 6.7 History and recovery
| Call | Notes |
|---|---|
| `GET /changes?projectId=&recordId=&limit=` | Newest first |
| `GET /page/changes?limit=&cursor=&projectId=` | Paginated, no diffs |
| `PATCH /changes/:id` | `{ reviewed: boolean }` (the only editable field) |
| `GET /records/:type/:id/trace` and `/links` | `type`: `task`, `requirement`, `file`, `milestone`. `{ why[], becomes[], gaps[] }` |
| `GET /trash` | Deleted in the last 30 days |
| `POST /trash/:type/:id/restore` | `type`: `project`, `task`, `milestone`, `requirement`, `file`, `document`. A child of an archived or deleted project is refused (`409`) |
| `GET /calendar.ics` | iCalendar of open dated tasks and milestones |

---

## 7. Pagination

Only `GET /page/tasks` and `GET /page/changes` are paginated; other lists return everything. Query `limit` (1–100, required) and `cursor`. Response `{ data: [...], meta: { nextCursor: string|null, hasMore: boolean } }`. Pass `nextCursor` back unchanged. Cursors are signed and **only valid until the server restarts**; on `400 invalid_cursor` start again. Pages never repeat or skip records.

---

## 8. Time zones and "today"

- Task and milestone dates are plain `YYYY-MM-DD` strings. Show them as-is; never convert through the device zone (Dart's `DateTime.parse('…T00:00:00')` in `format.dart` already avoids this: keep it).
- "Today", "overdue", and "due today" are decided **on the server** in the account's `preferences.timeZone`. The snapshot, `/home`, and `/insights` return `today`. **Replace the constants `demoToday`/`demoNow` with a value read from the snapshot** (section 10.3) so the app and the web agree. For relative times ("2 h ago") the app currently uses `demoNow`; use the device clock there, but compare against `Change.at`/`lastOpenedAt`, which are local datetimes **without an offset** in the account's zone: when the phone's zone differs from the account's, "2 h ago" can be off by the difference. Prefer the snapshot's `now` (UTC) converted to the account's zone, or show dates only.
- Set `timeZone` at registration and keep it current with `PATCH /me`.

---

## 9. Files

- **Upload:** `POST /files` as `multipart/form-data` with parts `file`, `projectId`, optional `description`, optional `tags` (comma-separated). In Dio use `FormData` with `MultipartFile.fromFile(path, filename: 'name.ext')` (a plain file name, never a path).
- **Allowed types** (by extension, and the contents must match): documents (`pdf docx doc odt rtf txt md pptx epub`), images (`png jpg jpeg gif webp svg`), audio/video (`mp3 wav ogg flac mp4 webm mov m4a`), data (`csv tsv json xlsx ods zip`). Otherwise `422 file.type_not_allowed` / `file.content_mismatch`.
- **Limits:** 100 MB per file (`413 file.too_large`), 1 GB per account (`413 file.quota_exceeded`). Files go **through the API** today, so show progress (Dio's `onSendProgress`) and expect slow uploads on mobile data.
- **Download:** `GET /files/:id/download` returns an attachment; `?inline=1` for images, PDF, audio, video. SVG never inline. Links (`kind: "link"`) have no file: open `url` (this needs a launcher package such as `url_launcher`, which `privacy_test.dart` bans today).
- **Sample data caveat:** seeded demo files are metadata only (`downloadable: false`).

---

## 10. Integrating with the Flutter app

### 10.1 Layering
Keep the app's models, selectors, and widgets. Replace **where the data comes from**:

| Today | With the backend |
|---|---|
| `fixturesProvider` (asset JSON, overridden in `main()`) | `workspaceRepositoryProvider`: loads the snapshot + templates from the API (and from the local cache when offline), builds the same `Fixtures`/`WorkspaceData` |
| `SessionNotifier` overlay (`taskOverrides`, `deletedTaskIds`, `_history` Undo) | Optimistic local change + API call; replace the local record with the server's response; on error roll back. Keep the 20-step Undo as UI behavior that calls `PATCH`/`restore` |
| `demoToday`, `demoNow` constants | `todayProvider` (from `snapshot.today`) used by `selectors.dart`, `parse.dart`, `format.dart`. Tests keep a fixed value |
| Welcome "Continue as demo user" and demo sign-in | Welcome "Continue as demo user" stays (fixtures, no network). Real sign-in/register call `/auth/*` |

### 10.2 Packages and Android setup
- **HTTP:** `dio` + `dio_cookie_manager` + `cookie_jar` (persistent, ideally on top of `flutter_secure_storage`).
- **Local cache** (optional but recommended for offline start): `drift`/`sqflite`, or simply store the last snapshot JSON in app-private storage with `path_provider`. Both are currently banned by `privacy_test.dart` and need C1-27.
- **Release manifest:** add `<uses-permission android:name="android.permission.INTERNET"/>` to `android/app/src/main/AndroidManifest.xml` (it is only in the debug manifest today).
- **Cleartext for local development only:** in `android/app/src/debug/AndroidManifest.xml` add `android:usesCleartextTraffic="true"` on `<application>` (or a debug-only network security config). Never in release; production uses HTTPS (section 15, D-01-B).
- **Base URL:** compile-time `--dart-define=API_BASE=http://10.0.2.2:3001/api/v1` so one build setting changes it.

### 10.3 Model changes (small)
- `Requirement`: add `String key` (parse `j['key']`); display `key` instead of `id` in `records.dart` and `record_sheets.dart`.
- `Fixtures.fromJson`: accept a snapshot (`today`, `now`, no `templates`) plus templates from a second call; or add `Fixtures.fromApi(snapshot, templates)`.
- `Task`: optionally add `recurrence` (`{freq, interval}`) and `seriesId`; `WorkFile`: optionally `url`, `downloadable`, `isDoc`; `Subtask`/`Criterion`: keep `id` so edits can be sent.
- `Project`: optionally `slug`. Quick add's `#project` matching in `parse.dart` tries `p.id.contains(tag)` first, which is meaningless with ObjectIds; it falls back to the squashed project **name**, which works.
- Ids: nothing may assume readable ids (`project-garden`, `t1`). The parity and golden tests use fixtures and can keep doing so.

### 10.4 Preferences
| App setting | Server | Notes |
|---|---|---|
| `themeMode` (System/Light/Dark) | `preferences.theme` (`system\|light\|dark`) | Map directly |
| `reduceMotion` | `preferences.motion` (`system\|reduced`) | `true` ↔ `reduced` |
| `weekStartsSunday` | `preferences.weekStart` (`monday\|sunday`) | Map directly |
| `textScale` (0.9–1.3) | none | Keep local, or ask for a server field |
| vibration | none | Keep local, or ask for a server field |
| time zone | `preferences.timeZone` | Set from the device |
| `shortcuts`, `firstRunDismissed` | exist | Web only; the app can ignore them |

Until a local store exists, preferences reset on restart today; with the backend they can load from `GET /me` after sign-in.

### 10.5 Write flow
1. Apply the change to the in-memory state (as `SessionNotifier` does now).
2. `PATCH`/`POST`/`DELETE`. 3. Replace the local record with the response (the full record, same shape). 4. On failure roll back and show the server's `message` in the existing toast.
**Do not retry creates automatically** (no idempotency keys yet; a retried `POST` can duplicate). After a network error on a create, refetch and check. `PATCH`, `DELETE`, and restore are safe to repeat.

### 10.6 Session and routing
- On a `401` anywhere: clear state, `go('/login')` (use `go`, not `push`, on shell routes, as the app's own notes already require).
- The launcher shortcuts (`tsumugi:///tasks`, Today, Search) keep working; deep links from outside the app need HTTPS app links (D-01-B).

### 10.7 Tests and tools
- Add a contract test that parses `docs/samples/api-snapshot.demo.json` + `api-templates.json` through the new `Fixtures.fromApi` (copy the samples into `test/fixtures/`).
- `tool/export_fixtures.mjs` points at `../CTINASSL_Activity/client`; the website is now `../tsumugi-webapp/client`. Update the path (the website's selectors are unchanged, so `web_parity.json` stays valid). When the app moves to API data, the parity test can compare the Dart selectors against the server's `/insights` and `/home` numbers.
- Update `privacy_test.dart` per section 3 and keep a test that **demo mode makes no network calls**.

---

## 11. Screen-by-screen: demo action → backend

| Mobile screen / action (today) | Backend call |
|---|---|
| Welcome, sign-in, register | `POST /auth/login`, `POST /auth/register`; forgot/reset stay demo until email exists |
| Home (headline, Today, Up next, recent projects) | Derive from the snapshot, or `GET /home` |
| Tasks: complete/reopen, status, reschedule, block, priority, edit title/notes, subtasks, delete + Undo | `PATCH /tasks/:id` (full record back), `DELETE /tasks/:id`, `POST /tasks/:id/restore` for Undo |
| Quick add | `POST /tasks` (parse `#project`, day word, `!` locally as now) |
| New project from template | `POST /projects { name, templateKind }` |
| Edit project (was Preview only) | `PATCH /projects/:id`; archive via `archived: true` |
| Milestone write (was Preview only) | `POST/PATCH/DELETE /milestones` |
| Requirement writes: mark met/verified, link work (was Preview only) | `PATCH /requirements/:id` |
| Add file / New note / reader Edit (was Preview only) | `POST /files` (multipart), `POST /files/links`, `POST /documents`, `PATCH /documents/:id` with `baseVersion`, `finalize`/`unfinalize` |
| Reader versions/compare | `GET /documents/:id/versions`, `…/diff` (the snapshot's `Change.diff` also works) |
| Project History | `changes` in the snapshot; `PATCH /changes/:id` for "reviewed" |
| Insights | Derive from the snapshot, or `GET /insights` |
| Account: theme, week start, reduce motion | `PATCH /me { preferences }` |
| Account: sign out, devices | `POST /auth/logout`, `GET /auth/sessions`, `DELETE /auth/sessions/:id` |
| Account: delete account, export | `POST /me/delete`, `GET /me/export` (needed for store policies) |
| Search | Local over the snapshot (as now); `GET /search` is optional |
| Calendar view | Local from the snapshot; `GET /calendar.ics` for export |
| Legal and Help | Bundled assets (unchanged); legal text must be updated (section 3) |

---

## 12. Offline and conflicts

The server has **no sync protocol**: no change feed, no ETags, no `If-Match`. Except for document text (`baseVersion`), concurrent edits are **last write wins**. A workable approach until sync exists: cache the last snapshot; keep an outbox of pending writes; send in order when online; on `404` for a record deleted elsewhere drop that write and tell the person; on `409`/`422` show the message and keep the item for the person to fix; on `401` keep the outbox and ask them to sign in. Keep `PATCH` bodies minimal. Never store the password.

---

## 13. Limits and rate limiting

| Limit | Value |
|---|---|
| `POST /auth/login` | 30 per 15 minutes per IP; account locks 15 minutes after 5 wrong passwords (`423`) |
| `POST /auth/register` | 20 per hour per IP |
| `POST /auth/change-password` | 10 per 15 minutes; `GET /me/export` 10 per hour; `POST /me/delete` 5 per hour |
| Strings | titles 200; project name 120; milestone title 160; tags 30 characters × 20; subtasks 50; acceptance criteria 30; phases 20; document 200 KB; notes 20,000 |
| Bulk | 100 ids per request |

`429` carries `Retry-After`. The limiter is in memory, per server process, by IP (many phones behind one NAT share a bucket). Numbers will be revisited for deployment. Conventions (status codes, error codes, strict bodies, `404` for anything not yours) are in sections 14 and 17.

---

## 14. Conventions every call follows

- Bodies are JSON (`Content-Type: application/json`, 1 MB limit) except file uploads. **Unknown fields are `400`.** `PATCH` is partial; arrays replace the whole list; send `null` to clear a nullable field; omit to leave it.
- Malformed ids are `400`; a well-formed id that is missing **or belongs to someone else** is `404`, never `403`.
- `Cache-Control: no-store` everywhere; `X-Request-Id` on every response (include it in bug reports); `204` for deletes and some actions.
- Branch on `error.code`, not the English `message`.

| Code | Meaning |
|---|---|
| 200 / 201 / 204 | OK / created / done, no body |
| 400 | Invalid input; `details[]` is `[{ path, code, message }]` |
| 401 | Not signed in, expired, or wrong credentials |
| 403 | Cross-site (only when an `Origin` header is sent) |
| 404 | Not found **or not yours** |
| 409 | State conflict (archived project, final document, duplicate, email taken) |
| 412 | Stale document save (`version_mismatch`) |
| 413 / 422 / 423 / 429 | Too large / breaks a rule / account locked / rate limited |

**Error codes:** `validation_failed`, `invalid_json`, `unauthenticated`, `forbidden`, `not_found`, `duplicate`, `payload_too_large`, `rate_limited`, `internal_error`, `version_mismatch` · `auth.invalid_credentials`, `auth.locked`, `auth.email_taken` · `project.archived`, `project.deleted`, `project.bad_dates` · `milestone.bad_dates`, `milestone.bad_phase`, `milestone.dependency_cycle` · `requirement.criteria_open` (`details.open`), `requirement.not_met` · `link.cross_project`, `link.relation_not_allowed` · `task.same_project` · `document.final`, `document.bad_body` · `file.missing`, `file.type_not_allowed`, `file.content_mismatch`, `file.too_large`, `file.quota_exceeded`, `file.bad_url`, `file.no_download`, `file.type_changed`, `file.same_project` · pagination: `400` with `details[0].code = "invalid_cursor"`.

---

## 15. Gaps for mobile and proposed backend work

Nothing below exists yet. "Owner needed" means it also depends on a [PLAN-C-01](PLAN-C-01.md) item.

| ID | Need | Why mobile needs it | Proposed work | Depends on |
|---|---|---|---|---|
| D-01-A | **Token auth** | Short-lived access token + rotating refresh token in the Keystore is the usual mobile pattern | `POST /auth/token`, `/auth/refresh`, `/auth/revoke`; `Authorization: Bearer`; per-device sessions already listable | none |
| D-01-B | **HTTPS and a public address** | Release builds must use TLS; Android app links need a domain | Deployment (PLAN-B-16) | C1-02, C1-03 |
| D-01-C | **Delta sync** | Avoid downloading the whole workspace each time | `GET /sync?since=` returning changed and deleted records | none |
| D-01-D | **Idempotency keys** | Safe retries of creates on flaky networks | `Idempotency-Key` header on `POST` creates | none |
| D-01-E | **ETag / If-Match** | Detect conflicting edits instead of last-write-wins | `version` on records, `412` on stale writes | none |
| D-01-F | **Push notifications** | Reminders, "due today" (the app removed its reminders setting because the demo forbids notifications) | FCM device tokens, a job runner, reminder scheduling (PLAN-B-19) | Firebase project (owner) |
| D-01-G | **Email flows** | Password recovery and verification; deep links | Email service (PLAN-B-04) | C1-01 |
| D-01-H | **Direct-to-storage uploads** | Large files over mobile data | Presigned uploads (PLAN-B-10) | C1-04 |
| D-01-I | **OpenAPI document** | Generate and type-check a Dart client | Generate from the Zod schemas; publish `openapi.json` | none |
| D-01-J | **Mobile-sized endpoints** | Smaller list payloads | `fields=`/`expand=`, image thumbnails | none |
| D-01-K | **App compatibility signal** | Old app versions after API changes | `X-Client-Version` request header, a minimum-version response, deprecation policy | none |
| D-01-L | **Play requirements** | Data-safety form, in-app account deletion | `/me/delete` and `/me/export` exist; needs a published privacy policy | C1-14 |
| D-01-M | **`textScale` and vibration preferences** | Account settings that the app has but the server does not store | Add the two fields to `preferences` | none |
| D-01-N | **Server `now` in the account's zone** | Correct "x hours ago" when the phone and account zones differ | Include a zoned `nowLocal` (or offsets on datetimes) in the snapshot | none |

---

## 16. What changed in the backend (catch-up)

Everything below exists and is covered by the 39-test suite (`npm test --prefix Server`), including an automated check that **no route lets one account see another's data**.

- **Accounts:** register, log in/out, session, change password, preferences, devices, activity log, export, account deletion, workspace rename.
- **Core records:** projects (templates, archive, delete/restore, summary, coverage, timeline, slug/recents), milestones (dependencies, phases), tasks (subtasks, links, repeating, bulk, move, delete/restore, pagination), requirements (atomic `REQ-###` keys, criteria and the "met" rules, links, by-key).
- **Library:** uploads with content checks and quota, links, Final flag, replace, move, download, Markdown documents with versions, diff, restore-as-new-version, finalize, move, export.
- **Traceability and history:** validated links, trace endpoint, History with reviewed flag, document diffs.
- **Insights:** Home, Insights, project summary, search, metric definitions.
- **Safety:** Recently deleted (30-day restore), purge, strict validation, `404` for anything not yours, locked-down headers, upload content checks, integrity checker.
- **Operations:** server lint, GitHub Actions CI, optional `HOST` so an emulator or phone can reach the local API.

---

## 17. Derived numbers

Use the server's definitions so mobile and web agree (also `GET /metrics/definitions`). The app's `selectors.dart` already implements them (and its parity test checks them against the website):

| Metric | Rule |
|---|---|
| Open task | status is not `Done` |
| Overdue task | open and `due < today` |
| Due today | open and `due == today` |
| Project progress | done tasks ÷ all tasks, whole percent; "no tasks yet" (not 0%) when there are none |
| Milestone state | `Done` if done; else `Overdue` if `due < today`; else `Doing` if `start ≤ today`; else `Upcoming` |
| Project health | `At risk` if any open task of the project is overdue, else `On track` (shown for Active projects) |
| Coverage | complete = `Met` and verified; a gap = no linked task, or no linked Final file/document |

---

## 18. Running the backend for mobile development

```bash
npm run setup     # once, from the tsumugi-webapp repo root
npm run seed      # demo account: demo@tsumugi.local / demo-password-1
```

By default the API listens on `127.0.0.1` only. For the emulator or a phone create `Server/.env` with `HOST=0.0.0.0` and run `npm run dev --prefix Server` (port 3001; the web app is not needed).

| Where the app runs | Base URL |
|---|---|
| Android emulator | `http://10.0.2.2:3001/api/v1` |
| Phone on the same Wi-Fi | `http://<computer's LAN IP>:3001/api/v1` (allow Node through the Windows firewall for private networks) |
| Phone over USB | `adb reverse tcp:3001 tcp:3001`, then `http://localhost:3001/api/v1` (`adb` is at `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`) |

`HOST=0.0.0.0` exposes the API, with no HTTPS, to everyone on the network: use it only on a network you trust and turn it off afterwards.

```bash
curl http://localhost:3001/api/v1/health
curl -i -c jar.txt -H 'Content-Type: application/json' \
  -d '{"email":"demo@tsumugi.local","password":"demo-password-1"}' http://localhost:3001/api/v1/auth/login
curl -b jar.txt http://localhost:3001/api/v1/workspace/snapshot
```

Reset everything: stop the API, delete `Server/.data` and `Server/uploads`. Test accounts: the seed (six projects, 15 tasks, 9 requirements, documents with versions, history) or any freshly registered account (empty; use templates).

---

## 19. Security notes for the app

- Production **must** use HTTPS only; never ship a build that allows cleartext.
- Keep the session cookie (or later tokens) in encrypted storage; never log cookies, passwords, or auth request bodies (Dio `LogInterceptor` off or redacted in release).
- The server re-checks every request; a different account's ids always return `404`.
- User text (titles, notes, Markdown) is stored as plain data and never rendered by the server. The app renders it with `flutter_markdown_plus`, which does not render raw HTML by default: keep it that way.
- Account deletion and export exist (`/me/delete`, `/me/export`); Google Play will likely require surfacing them in the app and linking a published privacy policy (the legal pages are still drafts; see PLAN-C-01 C1-14).

---

## 20. Samples and keeping this document true

- **Real responses:** [`docs/samples/`](samples/README.md): `api-snapshot.demo.json`, `api-templates.json`, `api-user.json`, `api-home.demo.json`. Use them in the app's tests. They are samples, not fixtures: regenerate when the API shape changes (log in as the demo account, save each response).
- **Re-run the checks** when the API changes: `npm test --prefix Server` for behavior; to re-check shapes against the Dart casts, compare `docs/samples/` against `lib/core/data/models.dart`.
- Update this document whenever an endpoint, field, error code, or rule changes, in the same change as the code ([INSTRUCTIONS.md](../INSTRUCTIONS.md)). When a section 15 item is built, move it to section 16 and note the date.

---

## 21. Open questions for the mobile side

1. **Lift or narrow the play-demo rule?** (C1-27; everything networked depends on it.)
2. Offline scope for v1: read-only cache, or full offline writes with an outbox? (Decides how soon D-01-C and D-01-E are needed.)
3. Token auth (D-01-A) before the first internal build, or cookies for now?
4. Should `textScale` and vibration sync across devices (D-01-M), or stay per-device?
5. Which screens need pagination or smaller payloads (D-01-J)? How big do lists get?
6. Notifications: what should reminders say and when (D-01-F)? Does the app bring back the removed "reminders" setting?
7. File upload from camera/gallery in v1? (Affects D-01-H, the 100 MB limit, and permissions.)
8. Minimum Android version and Play Store timeline (D-01-B, D-01-L).
9. Add recurrence UI (the backend has repeating tasks; the app has none)?

Send answers and anything surprising; we will update this document and the matching `PLAN-B` module plans.
