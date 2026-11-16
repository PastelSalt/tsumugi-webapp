# PLAN-B-06 — Projects, Phases, and Templates

> **Implementation status (2026-11-16):** ✅ Done (MVP). Projects, templates, archive, delete and restore all work end to end. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** ✅ Done (MVP) · **Phase:** 3 · **Depends on:** [03](PLAN-B-03.md), [05](PLAN-B-05.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [07 Milestones](PLAN-B-07.md) · [08 Tasks](PLAN-B-08.md) · [12 Traceability](PLAN-B-12.md) · frontend [PLAN-A-04B](../frontend/PLAN-A-04B.md) (Projects), [PLAN-A-04C](../frontend/PLAN-A-04C.md) (Project page), [PLAN-A-04L](../frontend/PLAN-A-04L.md) (templates)

## 1. Purpose and scope

The central record: a project holds an objective, a category and kind, a status, dates, tags, and an ordered list of **phases** (its workflow). This module also owns project **templates**, archiving, recents, and the whole-project delete/restore cascade.

**In scope:** project CRUD, phases, status, archive/unarchive, delete/restore cascade, "open" tracking, templates and create-from-template, project-level counts.
**Out of scope:** milestones (07), tasks (08), requirements (09), files and documents (10, 11), derived progress and health values (13 defines the rules; this module exposes them on the project resource).

## 2. Data model

Fields as defined in PLAN-B-03 section 3.4. Constraints:

| Field | Rule |
| --- | --- |
| `name` | 1–120 chars, trimmed; need not be unique (slug is) |
| `slug` | Generated; unique per workspace among non-deleted; immutable (history kept for redirects) |
| `category` | Free label from a suggested list (`Software`, `Creative`, `Research`, `Multimedia`, `Other`); ≤ 40 chars |
| `kind` | `software | creative | research | multimedia | blank` (drives icon and template defaults) |
| `status` | `Planning | Active | On hold | Done` (Archived is `archivedAt`) |
| `tone` | One of the pastel tones; default derived from `kind` |
| `tags` | ≤ 20 tags, each 1–30 chars, case-insensitive unique, normalized |
| `description` | ≤ 5,000 chars |
| `objective` | ≤ 1,000 chars. **The root of the traceability chain**; the project page's "Why it exists" |
| `start`, `end` | `YYYY-MM-DD`; `end ≥ start` when both present |
| `phases` | 1–20 items `{ id, name (1–40) }`, unique names within the project |
| `phaseIndex` | Integer within `[0, phases.length)`: the current phase |

## 3. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /projects` | List | Filters: `status`, `kind`, `tag`, `q`, `archived=false|true|any` (default `false`); sort: `name`, `-updatedAt` (default), `-lastOpenedAt`, `end`; cursor pagination |
| `POST /projects` | Create | Body per section 2; optional `templateKind` (section 7); `Idempotency-Key` recommended |
| `GET /projects/:projectId` | Read | Includes derived `progress`, `health`, `counts`, `nextMilestone` (summary), per PLAN-B-13 rules. Accepts slug or id: `GET /projects/by-slug/:slug` is a separate route to avoid ambiguity |
| `PATCH /projects/:projectId` | Update | Partial; `If-Match` supported; archived projects reject edits except unarchive |
| `DELETE /projects/:projectId` | Soft delete with cascade | `204`; returns `Deleted-Batch` header; see section 6 |
| `POST /projects/:projectId/restore` | Restore | Whole batch; `409` on slug collision with a suggested slug in `details` |
| `POST /projects/:projectId/archive` | Archive | Sets `archivedAt`, keeps data intact and read-only |
| `POST /projects/:projectId/unarchive` | Unarchive | |
| `POST /projects/:projectId/open` | Record "opened" | Sets `lastOpenedAt` (kept off `GET` so reads stay safe; the client calls it when the project page mounts, debounced) |
| `PUT /projects/:projectId/phases` | Replace the phase list | Body: ordered list of `{ id?, name }`; existing ids preserved; see section 5 |
| `POST /projects/:projectId/phase` | Move to a phase | Body: `{ phaseIndex }` or `{ phaseId }` |
| `GET /projects/recent` | Recents | Up to `limit` (default 4, max 12) non-archived by `lastOpenedAt` (Home's "Recent projects") |
| `GET /templates` | Available templates | Static catalogue (section 7); no auth required to browse |
| `GET /projects/deleted` | Recently deleted | Within retention; for the restore screen |

## 4. Business rules

1. **Status transitions** are free among `Planning`, `Active`, `On hold`, `Done`, but setting `Done` while open tasks exist returns a `200` with a `warnings: [{ code: 'open_tasks', count }]` meta entry (the UI shows the confirmation seen in the demo); it never blocks, because real projects finish with leftover work.
2. **Archived projects** are read-only: any write to the project or its children returns `409 project.archived` except `unarchive` and `restore`. Archiving does not change `status`.
3. **Phase index consistency:** shrinking the phase list clamps `phaseIndex`; renaming a phase keeps its `id`; deleting a phase referenced by milestones (`milestone.phase`) is rejected with `422 project.phase_in_use` listing the milestone ids, unless the request includes `moveMilestonesTo: <phaseId>`.
4. **Dates:** changing `start`/`end` never moves milestones or tasks automatically.
5. **Slug:** generated on create from `name`; collisions get `-2`, `-3`. Renaming does not change it.
6. **Objective rule:** an empty objective is allowed but surfaced as a gap in Insights ("objective missing") per the frontend's emphasis on traceability.
7. **Limits:** at most 200 active projects per workspace in v0.1 (protects aggregate queries); configurable constant.
8. **Recording history:** create, status change, archive/unarchive, objective edit, and phase moves each emit a domain event; the Changes module records them (PLAN-B-12).

## 5. Phase handling details

- `PUT /phases` is a full replace so reorder, rename, add, and remove are one atomic call. Items with an existing `id` are matched; new items get ids; items missing from the request are removed (subject to rule 3).
- Phase ids are stable strings (`ph_` + short random) so milestone references survive renames and reorders; `milestone.phase` stores the **index in the current API** (frontend compatibility) but is persisted as `phaseId` and translated at the edge by the service. Decided now to avoid drift when phases are reordered; the translation is covered by tests.

## 6. Delete and restore cascade

`DELETE /projects/:id` runs in one transaction: soft-delete the project and all of its milestones, tasks, requirements, files, documents (+ versions), changes, and links under one `deletedBatchId`. Stored objects are **not** deleted until the purge job (so restore works). Response `204`; the UI shows "Deleted. Undo" using the returned batch id for 30 days.

Restore reverses the batch exactly. If it exceeds a safe transaction size (over 10,000 records), the operation falls back to the job runner (PLAN-B-19); until then the per-project record cap makes this unreachable.

## 7. Templates

Templates are **code, not data** (`Server/src/modules/projects/templates.ts`), mirroring `client/.../data/templates.js` so the client can be switched to `GET /templates` without visual change.

| `kind` | Phases | Starter content |
| --- | --- | --- |
| `software` | Discovery, Design, Build, Test, Ship | One milestone ("First release") and a few starter tasks and requirements |
| `creative` | Concept, Outline, Draft, Review, Release | Milestone "Outline locked" and starter tasks |
| `research` | Question, Method, Collection, Analysis, Report | Milestone "Protocol ready" and starter tasks |
| `multimedia` | Brief, Production, Edit, Review, Master | Milestone "First cut" and starter tasks |
| `blank` | Plan | Nothing |

`POST /projects` with `templateKind` creates the project, phases, milestones, tasks, and requirements in **one transaction**, tags starter records `source: 'template'` (shown as sample content the person can delete, as in the demo), and records one Change ("Created from the Software template"). Idempotency key required for this path. Template starter dates are relative to the project's `start` (or today in the user's time zone).

## 8. Derived values exposed on the project resource

Computed by PLAN-B-13's shared functions, never stored:

| Field | Rule |
| --- | --- |
| `progress` | `{ done, total, pct }` where `pct = round(done/total*100)` or `null` when `total = 0` (matches `projectProgress`) |
| `health` | `At risk` if any open task is overdue, else `On track` (matches `projectHealth`) |
| `counts` | Active (non-deleted) `tasks`, `milestones`, `requirements`, `files` (including documents), `changes` |
| `nextMilestone` | Earliest-due non-done milestone summary or `null` |

List endpoints include these only with `?expand=summary` to keep default list reads cheap.

## 9. Authorization

Workspace-scoped through the tenant guard; a foreign or deleted project id returns `404`. Children of an archived project reject writes with `409`. Routes for child modules check the project exists in the workspace **before** touching the child (shared `loadProject(ctx, projectId)` helper that also returns the archived flag).

## 10. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Projects list, cards, timeline | `GET /projects?expand=summary`, `GET /milestones` (07) |
| New project dialog and templates | `GET /templates`, `POST /projects` |
| Project page header, overview | `GET /projects/:id` |
| Phase strip | `phases`, `phaseIndex`, `POST /projects/:id/phase` |
| Archive / delete with undo | `archive`, `DELETE`, `restore` |
| Home "recent projects" | `GET /projects/recent` |
| Recently deleted screen (new) | `GET /projects/deleted` |

## 11. Implementation tasks

- [ ] Model, repository, service, controller, routes, Zod schemas, OpenAPI.
- [ ] Slug generator with collision handling and history.
- [ ] Phase service (replace, move, translate indexes/ids).
- [ ] Template catalogue and transactional create-from-template.
- [ ] Archive guard helper used by other modules' write paths.
- [ ] Cascade delete/restore using PLAN-B-03 utilities.
- [ ] Domain events for the Changes module.
- [ ] Seed data entries and factories.

## 12. Testing

Unit: slug generation, phase replace/clamp, tag normalization. Integration: create/read/update/list filters and sorting; every template; archive blocks child writes; delete cascades and restores with identical counts and links; slug collision on restore; `If-Match` conflicts; the cross-workspace `404` matrix; cap enforcement.

## 13. Acceptance criteria

1. Creating a project from each template yields the documented phases and starter records in one atomic call; a forced failure leaves nothing behind.
2. Archiving makes every child write return `409 project.archived`; unarchiving restores write access.
3. Deleting then restoring a project returns every child and link, and the project list and counts match the pre-delete state.
4. Phase edits never orphan milestones, and renames keep milestone references intact.
5. `progress` and `health` on the project match the demo selectors for the seeded data.

## 14. Open questions

- Q4 (multiple workspaces) may require moving projects between workspaces; not planned.
- Whether `kind` should become a free-form label once the custom workflow builder arrives (PLAN-B-00 section 1.2).
- Cover images/icons from the spec: deferred; the `tone` colour covers the visual need in the frontend.

---

## Implementation status (MVP)

**✅ Done (MVP)** · local MVP, built 2026-11-16 · Projects, templates, archive, delete and restore all work end to end.

**Built**

- Create (blank or from a template), list, read, update, `open` tracking (`routes/work.js`, `services/projects.js`); `GET /templates`.
- Archive makes a project read-only for all its records (`409 project.archived`); unarchive.
- Delete cascades to all children and restores exactly (`POST /projects/:id/restore`); `GET /projects/deleted`.
- Slug generation with collision handling; status and phase changes recorded in History.

**Not built yet**

- `by-slug` route, `GET /projects/recent`, `expand=summary`, `PUT /phases` with the `phase_in_use` rule, per-workspace project cap, `If-Match`.

**Deviations and notes**

- Progress and health are exposed by `GET /insights` and computed by the existing frontend selectors on the snapshot, not stored on the project.
