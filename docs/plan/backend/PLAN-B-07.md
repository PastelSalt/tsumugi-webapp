# PLAN-B-07 — Milestones

**Status:** Proposed · **Phase:** 3 · **Depends on:** [06](PLAN-B-06.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [08 Tasks](PLAN-B-08.md) · [09 Requirements](PLAN-B-09.md) · [13 Derived metrics](PLAN-B-13.md) · frontend [PLAN-A-04D](../frontend/PLAN-A-04D.md) (Work), timeline view in [PLAN-A-04B](../frontend/PLAN-A-04B.md)

## 1. Purpose and scope

Milestones are the checkpoints of a project: a title, a window (`start` to `due`), a phase, and the tasks that contribute to them. They carry the project's schedule, drive the timeline, and are one hop in the traceability chain (requirement → milestone → task).

**In scope:** milestone CRUD, completion, blocked flag, phase assignment, dependency (`afterId`), derived state and progress, timeline queries, reordering rules.
**Out of scope:** the tasks themselves (08), requirement links (09; a requirement holds `milestoneId`).

## 2. Data model

Fields per PLAN-B-03 section 3.5.

| Field | Rule |
| --- | --- |
| `projectId` | Required; immutable after creation |
| `title` | 1–160 chars |
| `description` | ≤ 2,000 chars |
| `start`, `due` | `YYYY-MM-DD`, required, `due ≥ start`; both within 20 years of today (sanity bound) |
| `phaseId` | Optional; must be a phase of the **same** project |
| `done` / `doneAt` | `doneAt` set by the server when `done` becomes true; cleared when reopened |
| `blocked` | Boolean flag; independent of `done` (a done milestone cannot be blocked: setting `done` clears it) |
| `afterId` | Optional dependency on another milestone in the **same** project; no self reference; the chain must be **acyclic** |

Derived, never stored: `state` (`Done | Overdue | Doing | Upcoming` per PLAN-B-13: done → `Done`; `due < today` → `Overdue`; `start ≤ today` → `Doing`; else `Upcoming`, with "today" in the user's time zone) and `progress` (`{ done, total }` of its non-deleted tasks).

## 3. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /milestones` | List | Filters: `projectId`, `state` (derived, repeatable), `done`, `due.gte`, `due.lte`, `phaseId`; sort `due` (default), `start`, `-updatedAt`; supports `expand=progress` |
| `POST /milestones` | Create | Body per section 2; validates project and phase membership |
| `GET /milestones/:milestoneId` | Read | Includes `state`, `progress`, `taskIds` summary count, `requirementIds` (those pointing at it) |
| `PATCH /milestones/:milestoneId` | Update | Partial; `If-Match` supported |
| `POST /milestones/:milestoneId/complete` | Mark done | Optional `{ completeOpenTasks: boolean }` (default false); returns warnings when open tasks remain |
| `POST /milestones/:milestoneId/reopen` | Mark not done | |
| `DELETE /milestones/:milestoneId` | Soft delete | Detaches tasks/requirements/documents/files (sets `milestoneId: null`); clears dependents' `afterId`; `204` |
| `POST /milestones/:milestoneId/restore` | Restore | Re-attaches the records from the same batch |
| `GET /projects/:projectId/timeline` | Timeline payload | Milestones for the project ordered by `start`, each with `state`, `progress`, dependency edges, and the project's date window; powers the Timeline view in one call |

## 4. Business rules

1. **Dates:** `due ≥ start`. Changing dates never changes task dates. A task's `due` outside its milestone's window is allowed and surfaced as a hint by the client (not an error).
2. **Completion:** completing a milestone with open tasks succeeds and returns `meta.warnings: [{ code: 'open_tasks', count }]`. With `completeOpenTasks: true`, all open tasks of the milestone are set `Done` in one transaction (each emits its own Change).
3. **Dependencies:** `afterId` forms a forest. Creating or updating it runs a cycle check (walk up to 50 steps). Violations return `422 milestone.dependency_cycle`. Deleting a milestone clears `afterId` on dependents. A milestone may not be completed before its `afterId` milestone (soft rule: warning `dependency_open`, not an error).
4. **Phases:** `phaseId` must exist in the project; if a project phase is removed with `moveMilestonesTo`, the service reassigns here (PLAN-B-06 section 4).
5. **Archived projects:** write attempts return `409 project.archived`.
6. **Limits:** at most 200 milestones per project.
7. **History:** create, date change, completion/reopen, blocked toggle, and deletion emit events recorded as Changes ("Marked the outline as locked" in the demo's wording style).

## 5. Timeline details

`GET /projects/:id/timeline` returns:

```json
{
  "data": {
    "window": { "start": "2026-09-01", "end": "2027-02-28" },
    "today": "2026-11-12",
    "phases": [ { "id": "…", "name": "Concept", "index": 0 } ],
    "milestones": [
      { "id": "…", "title": "…", "start": "…", "due": "…", "phaseId": "…", "state": "Doing",
        "progress": { "done": 1, "total": 3 }, "afterId": null, "blocked": false }
    ]
  }
}
```

`today` is computed in the caller's time zone so the client does not guess (the demo's fixed `DEMO_TODAY` disappears; PLAN-B-17). The window defaults to the project dates, widened to cover all milestones.

## 6. Authorization and integrity

Workspace scoping via the tenant guard; project existence and archive state via `loadProject`. All cross-record references (`phaseId`, `afterId`) are validated in the service so a milestone can never point into another project or workspace. Referential cleanup after delete is transactional.

## 7. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Project page "Work" milestone groups | `GET /milestones?projectId=…&expand=progress` |
| Timeline view (Projects) | `GET /projects/:id/timeline` |
| Home "Up next" (milestones due soon) | `GET /milestones?done=false&due.gte=…&due.lte=…` (via PLAN-B-13 aggregate) |
| Mark done / reopen | `complete`, `reopen` |
| Detail panel "What it becomes" | `taskIds`, `requirementIds` counts and links |

## 8. Implementation tasks

- [ ] Model, repository, service, controller, routes, Zod schemas, OpenAPI.
- [ ] `milestoneState()` and `milestoneProgress()` pure functions (shared with PLAN-B-13, unit tested against the demo selectors' cases).
- [ ] Dependency cycle check and tests.
- [ ] `complete` with optional task completion in a transaction.
- [ ] Timeline endpoint; phase id ↔ index translation.
- [ ] Delete detach and restore re-attach.
- [ ] Domain events and seed data.

## 9. Testing

State derivation across the four cases and time zones (a milestone due "today" is not overdue until the next day in the user's zone); cycle detection (direct, indirect, deep); complete with and without `completeOpenTasks`; deletion detaches without deleting tasks; restore re-attaches; phase membership; cross-project reference rejection; archive guard.

## 10. Acceptance criteria

1. For the seeded demo data, derived `state` and `progress` equal the values the demo selectors produce for the same date.
2. A dependency cycle cannot be created through any sequence of API calls.
3. Deleting a milestone leaves its tasks intact and unassigned; restoring puts them back.
4. The timeline for a project is returned in a single request and matches the project page's Work view.

## 11. Open questions

- Whether `afterId` should become a many-to-many predecessor list (needs a UI; deferred).
- Whether a milestone's `blocked` flag should be derived from blocked tasks (default: independent flag, as in the demo).
