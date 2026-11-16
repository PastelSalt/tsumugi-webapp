# PLAN-B-08 — Tasks and Subtasks

**Status:** Proposed · **Phase:** 3 · **Depends on:** [06](PLAN-B-06.md), [07](PLAN-B-07.md); link storage from [12](PLAN-B-12.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [09 Requirements](PLAN-B-09.md) · [13 Home and Insights](PLAN-B-13.md) · [19 Recurrence](PLAN-B-19.md) · frontend [PLAN-A-04E](../frontend/PLAN-A-04E.md) (Tasks), [PLAN-A-04L](../frontend/PLAN-A-04L.md) (Quick add)

## 1. Purpose and scope

Tasks are the unit of work: a title, a status, a priority, an optional due date, notes, subtasks, and links to the requirement, milestone, and files they relate to. The frontend's Home, Tasks (Today, Upcoming, Calendar, All), Quick add, and Undo all depend on this module.

**In scope:** task CRUD, status and priority, blocked flag, due dates, subtasks, manual ordering, bulk actions, Quick add create semantics, Today/Upcoming/Calendar queries, completion bookkeeping, task links.
**Out of scope:** recurrence and reminders (PLAN-B-19), assignees and comments (PLAN-B-18), Quick add **parsing** (stays on the client; see section 7).

## 2. Data model

Fields per PLAN-B-03 section 3.6.

| Field | Rule |
| --- | --- |
| `projectId` | Required; immutable (moving tasks between projects is an explicit action, section 4.7) |
| `milestoneId` | Optional; must be a milestone of the **same** project |
| `title` | 1–200 chars, single line; control characters stripped |
| `notes` | ≤ 20,000 chars (plain text/Markdown source; rendered on the client) |
| `status` | `To do | Doing | Done` |
| `priority` | `normal | high` |
| `due` | `YYYY-MM-DD` or `null` |
| `blocked` | Boolean flag; cleared automatically when the task becomes `Done` |
| `completedAt` | Set when `status` becomes `Done`, cleared otherwise |
| `subtasks` | ≤ 50 items `{ id, text (1–200), done }`, ordered |
| `order` | Double-precision rank for manual ordering within a project/status (fractional indexing; rebalanced when gaps shrink) |
| Links | `requirementIds[]`, `fileIds[]` (via `links`), `changeIds[]` (read-only, via `links`) |

Derived (never stored): `overdue` (`status ≠ Done` and `due < today` in the user's time zone), `dueSoon(days)`, `subtaskProgress { done, total }`.

## 3. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /tasks` | List | Filters: `projectId`, `milestoneId`, `status` (repeatable), `priority`, `blocked`, `overdue=true`, `due` / `due.gte` / `due.lte`, `noDue=true`, `requirementId`, `q`; sort `due` (nulls last, default), `-updatedAt`, `order`, `priority`; cursor pagination |
| `POST /tasks` | Create | Body: `projectId`, `title`, optional rest; `Idempotency-Key` recommended (Quick add sends one) |
| `GET /tasks/:taskId` | Read | Includes `requirementIds`, `fileIds`, `changeIds`, derived flags |
| `PATCH /tasks/:taskId` | Update | Partial; `If-Match` supported; link arrays handled per section 5 |
| `DELETE /tasks/:taskId` | Soft delete | `204`; links soft-deleted in the same batch |
| `POST /tasks/:taskId/restore` | Restore | Powers **Undo** for deletes |
| `POST /tasks/:taskId/complete` | Set Done | Idempotent; sets `completedAt` |
| `POST /tasks/:taskId/reopen` | Back to `To do` (or `Doing` if requested) | |
| `POST /tasks/:taskId/move-to-tomorrow` | Convenience: due = tomorrow (user's time zone) | Mirrors the demo's `moveToTomorrow` action |
| `PUT /tasks/:taskId/subtasks` | Replace subtasks | Preserves ids for unchanged items; one write |
| `PATCH /tasks/:taskId/subtasks/:subtaskId` | Toggle or edit one subtask | Avoids replacing the list for a checkbox click |
| `POST /tasks/:taskId/move` | Move to another project | Body: `{ projectId, milestoneId? }`; see rule 4.7 |
| `POST /tasks/bulk` | Bulk action | Body: `{ ids: [≤100], action: 'complete'|'status'|'priority'|'due'|'delete', value? }`; atomic; returns per-id result |
| `GET /tasks/views/today` | Today view | `{ overdue[], today[], doing[], doneToday[] }` (section 6) |
| `GET /tasks/views/upcoming` | Upcoming | `?days=7` (1–60): tasks **and** milestones due after today within the window, sorted (matches `upNext`) |
| `GET /tasks/views/calendar` | Calendar | `?month=2026-11` returns tasks and milestones grouped by date for the visible grid, including adjacent days |

## 4. Business rules

1. **Status semantics:** `Done` sets `completedAt` and clears `blocked`; any transition away from `Done` clears `completedAt`. A `blocked` task keeps its status (the flag is independent, as in the demo).
2. **Due dates:** date-only. Setting a past due date is allowed (it becomes overdue immediately). `due: null` clears it.
3. **Priority:** two levels, matching the UI. The server will not invent more.
4. **Subtasks:** capped; ids are stable; completing every subtask does **not** complete the task automatically (the demo does not either; a future preference may).
5. **Milestone membership:** the milestone must belong to the same project; deleting a milestone nulls this field (PLAN-B-07).
6. **Requirement/file links:** each requirement/file must belong to the same project (`422 link.cross_project` otherwise). Duplicates are ignored (set semantics).
7. **Moving between projects:** allowed only via `/move`; clears `milestoneId`, removes links to requirements and files of the old project, records a Change on both projects, and refuses if either project is archived.
8. **Order:** new tasks append (`order` = last + 1). `PATCH` may include `{ order: { before: id } }` or `{ after: id }`; the server computes the rank. Rebalance runs when the gap between neighbors falls below 1e-9.
9. **Archived projects:** writes return `409 project.archived`.
10. **Limit:** 5,000 non-deleted tasks per project in v0.1 (aggregate protection).
11. **History:** create, status change, due change, priority change, blocked toggle, link change, move, and delete emit events recorded as Changes (task-level wording follows the demo, e.g. "Added a dialogue proofing task").

## 5. Link handling

Reads present `requirementIds` and `fileIds`. Writes accept the same arrays on `POST`/`PATCH` as **full replacement sets**; the service diffs against current links, validates new ones, and applies add/remove inside one transaction through the Links service (PLAN-B-12). Convenience actions `POST /tasks/:id/links` and `DELETE /tasks/:id/links/:linkedId` are avoided to keep a single write path; the frontend already edits the set in its detail panel.

## 6. View queries (powering Home and Tasks)

All views use the caller's time zone (`ctx.timeZone`) for "today"; the response includes `today` so the client can label groups.

- **Today:**
  - `overdue`: open, `due < today`, sorted by `due`.
  - `today`: open, `due = today`.
  - `doing`: `status = Doing` and (`due` null or `due > today`), sorted by `due`.
  - `doneToday`: `Done` with `completedAt` today (the demo uses the due date; the server uses the real completion time, which is more accurate once data is real).
- **Upcoming:** union of open tasks and not-done milestones with `today < due ≤ today + days`, sorted ascending with `kind: 'task'|'milestone'`.
- **Calendar:** per-day grouping with a cap of 50 items per day and an `overflow` count.
- Optional `projectId` filter on all views (`all` is the default). Counts for the Home figures (`dueToday`, `overdue`, `doing`) are returned by `GET /home` (PLAN-B-13).

## 7. Quick add

Parsing (`#project`, `!`, `today|tomorrow|weekday`) stays **client-side** (`quickadd/parse.js`) so the live preview is instant and works offline; the result is submitted as a normal `POST /tasks` with `projectId`, `title`, `priority`, `due`. Rationale: one parser, no round trip per keystroke, no divergence risk between server and client.
Server support: `Idempotency-Key`, `GET /projects?q=` for `#project` lookup, and a lenient limit that treats a missing `projectId` as `422 task.project_required` with a helpful message. If a second client (mobile) needs the same parser, extract it to `packages/quickadd` and use it from both (PLAN-B-17 section 7).

## 8. Undo

The demo's 20-step undo is a client feature. The server supports it through reversible operations: field restoration via `PATCH` with the previous values (and `If-Match` to avoid clobbering newer edits), `restore` for deletes, and `reopen` for completion. No server-side undo stack in v0.1.

## 9. Authorization

Tenant guard plus project/milestone/requirement/file membership checks in the service. Foreign ids in `projectId`, `milestoneId`, `requirementIds`, or `fileIds` return `404`/`422` without revealing existence in other workspaces (a foreign id is treated as "not found" exactly like a nonexistent one).

## 10. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Home "What needs attention", "Up next" | `/tasks/views/today`, `/tasks/views/upcoming`, `GET /home` |
| Tasks: Today, Upcoming, Calendar, All | the three views and `GET /tasks` |
| Task detail panel: edit, subtasks, links | `PATCH /tasks/:id`, subtask routes |
| Row actions: complete, move to tomorrow, priority, blocked | `complete`, `move-to-tomorrow`, `PATCH` |
| Quick add dialog | `POST /tasks` with `Idempotency-Key` |
| Undo (Ctrl/Cmd+Z) | Inverse calls described in section 8 |
| Bulk selection (future) | `POST /tasks/bulk` behind a flag |

## 11. Implementation tasks

- [ ] Model, repository, service, controller, routes, schemas, OpenAPI.
- [ ] Pure helpers: `isOverdue`, `dueSoon`, `todayLists`, `upNext`, `calendarGrid` (shared with PLAN-B-13, tested against demo selector cases).
- [ ] Ordering (fractional rank) and rebalance.
- [ ] Subtask endpoints with id stability.
- [ ] Link set replacement via the Links service.
- [ ] Complete/reopen/move-to-tomorrow actions and bulk endpoint (transactional).
- [ ] View endpoints with time zone handling.
- [ ] Domain events, seed data, factories.

## 12. Testing

Time-zone matrix (UTC, UTC+13, UTC−11 around midnight) for overdue/today/tomorrow; every status transition and its side effects; subtask id stability; link validation (cross-project, duplicates, foreign ids); bulk atomicity (one invalid id fails the whole request, nothing changes); ordering stress (many inserts between two neighbors); view parity with the demo selectors for the seeded dataset; pagination with identical `due` values.

## 13. Acceptance criteria

1. Every task view in the frontend renders from the API with results identical to the demo selectors for equivalent data.
2. Completing, reopening, or moving a task never leaves stale `completedAt` or `blocked` flags.
3. Replaying a Quick add request with the same idempotency key creates one task.
4. A forged request linking a task to another user's requirement fails and reveals nothing.
5. Bulk actions are all-or-nothing.
6. 95th percentile of `GET /tasks/views/today` under 300 ms with 5,000 tasks in the workspace.

## 14. Open questions

- Whether completing all subtasks should offer to complete the task (a preference, default off).
- Whether tasks need `startDate` for scheduling (not in the demo; deferred).
- Whether to keep `Doing` limited to one per project (no; not in the product design).
