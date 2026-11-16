# PLAN-B-09 — Requirements and Acceptance Criteria

> **Implementation status (2026-11-16):** ✅ Done (MVP). Requirements, acceptance criteria and their rules are enforced on the server. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** ✅ Done (MVP) · **Phase:** 4 · **Depends on:** [06](PLAN-B-06.md), [07](PLAN-B-07.md), [08](PLAN-B-08.md); link storage from [12](PLAN-B-12.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [10 Files](PLAN-B-10.md) · [13 Coverage](PLAN-B-13.md) · frontend [PLAN-A-04F](../frontend/PLAN-A-04F.md) (Specs)

## 1. Purpose and scope

Requirements record what a project must achieve, with checkable acceptance criteria. They are the anchor of **traceability**: each requirement can be linked to the milestone it belongs to, the tasks that implement it, and the final files that satisfy it. This module also owns **gap detection** (a requirement without a task or without a final file), which the Specs view and Insights display.

**In scope:** requirement CRUD, human keys, type and status, verification, acceptance criteria, links to tasks/files/milestone, gap and coverage computation.
**Out of scope:** the link store itself (12), the tasks (08), the files (10).

## 2. Data model

Fields per PLAN-B-03 section 3.7.

| Field | Rule |
| --- | --- |
| `projectId` | Required; immutable |
| `key` | `REQ-###` allocated atomically per project (`counters`, `seq` starts at 1, zero-padded to 3, widening past 999); **never reused**, even after deletion (matches how people cite them); unique among non-deleted |
| `title` | 1–200 chars |
| `type` | `Functional | Non-functional` |
| `status` | `Open | Met` |
| `verified` | Boolean: someone has confirmed the requirement is actually satisfied |
| `milestoneId` | Optional, same project |
| `description` | ≤ 5,000 chars |
| `acceptance` | ≤ 30 items `{ id, text (1–300), met }`, ordered |
| Links | `taskIds[]`, `fileIds[]` (files and documents), `changeIds[]` (read-only) |

Derived: `criteria { met, total }` (as `criteriaProgress`), `links` with `gaps { task: boolean, file: boolean }` (as `requirementLinks`), and `complete` (`status = Met && verified`).

## 3. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /requirements` | List | Filters: `projectId`, `type`, `status`, `verified`, `milestoneId`, `hasGap=true`, `q`; sort `key` (default), `-updatedAt`, `title`; pagination |
| `POST /requirements` | Create | Allocates `key`; body: `projectId`, `title`, `type`, optional rest |
| `GET /requirements/:requirementId` | Read | Includes criteria progress, `taskIds`, `fileIds`, `changeIds`, `gaps`, `milestone` summary |
| `GET /requirements/by-key/:projectId/:key` | Read by key | For citations like `REQ-005` in notes and URLs |
| `PATCH /requirements/:requirementId` | Update | Partial; links replaced as sets (as in tasks); `If-Match` supported |
| `DELETE /requirements/:requirementId` | Soft delete | Links removed in the same batch; key is **not** recycled |
| `POST /requirements/:requirementId/restore` | Restore | |
| `PUT /requirements/:requirementId/acceptance` | Replace criteria | Preserves ids |
| `PATCH /requirements/:requirementId/acceptance/:criterionId` | Toggle or edit one criterion | Checkbox clicks |
| `POST /requirements/:requirementId/mark-met` | Set `status = Met` | Validates rule 4.2 |
| `POST /requirements/:requirementId/reopen` | Set `status = Open`, `verified = false` | |
| `POST /requirements/:requirementId/verify` | Set `verified = true` | Requires `Met` |
| `GET /projects/:projectId/coverage` | Coverage summary | `{ total, complete, withGaps, missingTask, missingFile }` plus the gap list (PLAN-B-13) |

## 4. Business rules

1. **Key allocation:** keys come from the atomic counter in the same transaction as the insert; a failed insert may skip a number, which is acceptable and documented.
2. **Marking met:** allowed only when **every** acceptance criterion is `met` (a requirement with **no** criteria may be marked met directly, as in the demo's "REQ-003"). Violations return `422 requirement.criteria_open` with the count of open criteria. This rule is enforced on `mark-met` **and** on `PATCH` that sets `status`.
3. **Auto-reopen:** adding an unmet criterion or un-ticking a met one to a `Met` requirement reopens it (`status = Open`, `verified = false`) and records a Change explaining why. Silent invalid states are never stored.
4. **Verification:** `verified = true` requires `status = Met`; reopening clears it. Only the owner can verify in v1; the field is shaped so a reviewer role can own it later (PLAN-B-18).
5. **Milestone link:** `milestoneId` must be in the same project; deleting the milestone nulls it.
6. **Link validity:** linked tasks/files must be in the same project (`422 link.cross_project`).
7. **Gaps** (the traceability warnings the frontend shows):
   - `gaps.task` = no linked, non-deleted task.
   - `gaps.file` = no linked file/document that is **Final** (`isFinal` or document `status = Final`).
   A requirement with a gap can still be marked `Met`; the gap is information, not a blocker (consistent with the demo's lens).
8. **Archived projects:** writes return `409 project.archived`.
9. **Limit:** 2,000 requirements per project.
10. **History:** create, status/verification changes, criteria edits, link edits, milestone changes, and delete are recorded as Changes (e.g. "Marked transcript storage as not yet verified").

## 5. Coverage and gap computation

One pure function `computeCoverage(requirements, links)` is the **only** implementation (also used by Home and Insights, PLAN-B-13):

- `total` = non-deleted requirements in scope.
- `complete` = those with `status = Met` and `verified = true`.
- `withGaps` = those with a task gap **or** a file gap.
- `missingTask`, `missingFile` = counts for each gap kind.

Calculated in a single aggregation with `$lookup` through `links` (indexed both ways), scoped to the project or workspace. A cached snapshot can be added if a workspace grows large (PLAN-B-13 section 8).

## 6. Authorization

Tenant guard plus project/milestone/task/file membership checks. `by-key` requires the `projectId` in the path so a key cannot be probed across projects. A foreign id returns `404`.

## 7. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Specs view list, filters (type, status, gaps) | `GET /requirements?projectId=…` |
| Requirement detail with "Why it exists / What it becomes" | `GET /requirements/:id` |
| Criteria checkboxes | `PATCH …/acceptance/:criterionId` |
| "Mark as met", "Verify" | `mark-met`, `verify` |
| Coverage figures in Insights and Home | `/projects/:id/coverage` or `GET /insights` |
| Task/Library link pickers | `taskIds`, `fileIds` on `PATCH` |

## 8. Implementation tasks

- [ ] Model, repository, service, controller, routes, schemas, OpenAPI.
- [ ] Counter-backed key allocation with retry and tests under concurrency.
- [ ] Status/criteria rules (marking met, auto-reopen) as a small state machine with a table-driven test.
- [ ] Link set replacement through the Links service; gap computation.
- [ ] Coverage aggregation and endpoint.
- [ ] Domain events, seed data, factories.

## 9. Testing

Concurrent creates produce unique, gap-free-or-explained keys; mark-met rule matrix (no criteria, all met, some open); auto-reopen on criteria edits; verification rules; gap calculation parity with the demo (`requirementLinks`, `coverage`) on the seeded data; cross-project link rejection; deleted tasks stop counting as implementing work; key never reused after delete/restore.

## 10. Acceptance criteria

1. Creating 50 requirements in parallel yields 50 unique keys.
2. A requirement can never be stored as `Met` with open criteria, nor as `verified` while `Open`.
3. For the seeded demo project, the Specs view's gaps and Insights coverage numbers equal the demo selectors' results.
4. Deleting a task immediately reintroduces the corresponding "no task" gap.
5. `GET /requirements/by-key/:projectId/REQ-005` returns the same record as by id.

## 11. Open questions

- Whether `Non-functional` requirements should support measurable targets (value + unit), as the demo's "under 300 ms" implies. Default: free text in acceptance criteria.
- Whether gaps should also include "no milestone". Default: no (matches the demo).
- Import of requirements from Markdown/CSV (deferred to a later plan).

---

## Implementation status (MVP)

**✅ Done (MVP)** · local MVP, built 2026-11-16 · Requirements, acceptance criteria and their rules are enforced on the server.

**Built**

- Create with atomic `REQ-###` keys that are never reused; update; delete (`services/requirements.js`).
- Cannot be `Met` with open criteria (`422 requirement.criteria_open`); unticking a criterion reopens a Met requirement; verification only when Met.
- Task and file links (both directions); coverage and gaps via `GET /insights`.
- Frontend: Add requirement, tick criteria, Mark met / verified, Link work.

**Not built yet**

- `by-key` route, per-project coverage endpoint, restore for deleted requirements.
