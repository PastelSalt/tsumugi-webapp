# PLAN-B-12 — Changes, Links, and Traceability

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). Validated links and recorded History work; the dedicated trace endpoints are not built. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** 🟡 Partly done (MVP) · **Phase:** 6 (link service needed earlier, delivered with Phase 3) · **Depends on:** [03](PLAN-B-03.md) and event emitters in 06–11 · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [08 Tasks](PLAN-B-08.md) · [09 Requirements](PLAN-B-09.md) · [10 Files](PLAN-B-10.md) · [11 Documents](PLAN-B-11.md) · [13 Insights](PLAN-B-13.md) · frontend [PLAN-A-04H](../frontend/PLAN-A-04H.md) (History)

## 1. Purpose and scope

The feature that makes Tsumugi different: **explicit, validated relationships** between records, plus an **immutable history** of what changed. This module owns two collections, `links` and `changes`, and the service used by every other module to read and write relationships. It also answers the traceability questions from PROJECT-SPECS section 6.

**Questions this module must answer:**

1. Why does this task exist? (task → requirements → milestone → project objective)
2. Which requirement does it address, and is it satisfied?
3. What changed while it was worked on, and which file resulted?
4. For any requirement: what implements it, what proves it, and what is missing?

**In scope:** link validation and storage, link read models (id arrays, trace graph), change recording through domain events, the History feed, reviewed flags, integrity checks.
**Out of scope:** the content diff (11), derived dashboards (13).

## 2. The link service (shared dependency)

`LinksService` is the **only** code that reads or writes `links`. Other modules call it; none touch the collection.

### 2.1 Operations

| Function | Purpose |
| --- | --- |
| `setLinks(ctx, record, relation, targetIds)` | Replace the set of targets for one record and relation; diffs, validates, applies adds/removes in the caller's transaction; returns `{ added, removed }` |
| `getLinks(ctx, record, relation?)` | Targets of a record (batched variant `getLinksFor(ctx, type, ids[])` avoids N+1) |
| `removeAllFor(ctx, record, batchId)` | Soft-delete a record's links (delete cascade) |
| `restoreBatch(ctx, batchId)` | Undelete links with a batch |
| `trace(ctx, record, depth)` | Walk the graph (section 6) |

### 2.2 Allowed relations (closed set)

| Relation | Endpoints | Presented as |
| --- | --- | --- |
| `implements` | Task ↔ Requirement | `task.requirementIds`, `requirement.taskIds` |
| `satisfies` | File or Document ↔ Requirement | `file.requirementIds`, `requirement.fileIds` |
| `attached` | File or Document ↔ Task | `task.fileIds`, `file.taskIds` |
| `affects` | Change ↔ Requirement or Task | `change.requirementIds`, `change.taskIds` (system-managed) |

Anything outside the table is rejected at the service with `422 link.relation_not_allowed`. Single-parent relations remain foreign keys (`milestoneId`, `projectId`; PLAN-B-03 section 6).

## 3. Validation rules (the "validated by the backend" requirement)

1. **Same workspace** (tenant guard) and **same project** for both ends → else `422 link.cross_project`.
2. Both ends exist and are not deleted → else `404` (foreign ids are indistinguishable from missing).
3. Relation allowed for the pair of types (section 2.2).
4. No duplicates (unique index) and no self links.
5. Endpoint records are not in an archived project.
6. At most 200 links per record and relation (protects detail panels and aggregations).
7. `affects` links are written only by the Changes recorder, never by clients.

## 4. Changes

### 4.1 What a Change is

An **immutable history entry**: what happened, to which record, when, and with what version transition. Matches the frontend's `change` shape (`at`, `summary`, `recordType`, `recordId`, `reviewed`, `fromVersion`, `toVersion`, `requirementIds`, `taskIds`, `diff`). Only `reviewed` can change afterwards.

| Field | Source |
| --- | --- |
| `at` | Server time (UTC) |
| `summary` | Generated from the event by templates (section 4.3), ≤ 200 chars |
| `recordType`, `recordId` | The changed record |
| `action` | `created | updated | deleted | restored | status | linked | unlinked | finalized | uploaded | moved` |
| `fields[]` | Names of changed fields (never values; avoids copying private content into history) |
| `fromVersion`, `toVersion` | For documents (content) and optionally record `version` |
| `source` | `user` or `system` (template creation, cascades) |
| `reviewed` | Boolean, toggled by the user |
| Links (`affects`) | Requirements and tasks related to the changed record **at the time** |

Diffs are **not stored**; they are derived on demand from document versions (PLAN-B-11 section 6), so the Change stays small and cannot leak old content.

### 4.2 Recording mechanism

Services publish typed **domain events** on the in-process bus (`shared/events.ts`) **inside the same transaction as the write** (the bus collects events during the transaction and the Changes recorder inserts rows in the same transaction on commit-ready; if the transaction aborts, nothing is recorded). This keeps history exactly consistent with state without a cross-module import.

Event catalogue (each module plan lists what it emits): `project.created|updated|statusChanged|archived|deleted`, `milestone.*`, `task.created|updated|statusChanged|dueChanged|linked|moved|deleted`, `requirement.*`, `file.uploaded|replaced|finalToggled|…`, `document.versionCreated|finalized|…`.

Noise control: events fire only for **meaningful** fields (title, status, due, priority, blocked, objective, links, final, version). Cosmetic changes (tags, order) and rapid repeats of the same field on the same record within 5 minutes by the same user are **coalesced**: no new row is created and the first Change is kept unchanged (Changes stay immutable, so the first summary stands). This is documented behavior, and the first Change's `fields[]` is not extended.

### 4.3 Summary wording

Template per event, written in the plain, past-tense style of the demo ("Updated scope and goals in the Opening brief", "Marked the outline as locked"). Record titles are interpolated **at record time** and truncated, then treated as inert text everywhere (no markup).

## 5. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /changes` | History feed | Filters: `projectId`, `recordType`, `recordId`, `requirementId`, `taskId`, `reviewed`, `action`, `at.gte`, `at.lte`; sort `-at`; pagination; grouped-by-day grouping is a client concern (the response includes `dayGroup` keys computed in the caller's time zone for convenience) |
| `GET /changes/:changeId` | One change | With resolved record titles and, for document changes, a link to the diff endpoint |
| `PATCH /changes/:changeId` | Mark reviewed | Only `{ reviewed: boolean }` is accepted |
| `POST /changes/review` | Mark many reviewed | `{ ids: [≤100] }` atomic |
| `GET /records/:type/:id/trace` | Traceability graph | Section 6 |
| `GET /records/:type/:id/links` | Linked records with titles and statuses | Powers the "Why it exists / What it becomes" panels in one call |
| `GET /projects/:projectId/trace` | Whole-project trace | Objective → requirements → milestones → tasks → files, with gaps (section 7) |

Creation of changes is **never** exposed; `POST`/`DELETE` on `/changes` do not exist. (A manual "add a note to history" feature is deferred.)

## 6. Trace read model

`trace(record, depth)` returns a bounded graph (default depth 3, max 4, max 200 nodes):

```json
{
  "data": {
    "root": { "type": "Task", "id": "…", "title": "…" },
    "why":  [ { "type": "Requirement", "id": "…", "key": "REQ-001", "status": "Open" },
              { "type": "Milestone", "id": "…" },
              { "type": "Project", "id": "…", "objective": "…" } ],
    "becomes": [ { "type": "File", "id": "…", "isFinal": true }, { "type": "Change", "id": "…" } ],
    "gaps": [ { "code": "requirement_has_no_final_file", "recordId": "…" } ]
  }
}
```

- "**Why it exists**" walks upward: Task → Requirements → Milestone → Project objective.
- "**What it becomes**" walks downward: Requirement → Tasks → Changes → Final files.
- The walk uses batched `links` lookups per level (no per-node queries) and is bounded to protect latency.

## 7. Gaps catalogue (single source for Specs, Home, Insights)

| Code | Meaning |
| --- | --- |
| `requirement_has_no_task` | No linked non-deleted task |
| `requirement_has_no_final_file` | No linked Final file/document |
| `task_has_no_requirement` | Open task linked to no requirement (informational; hidden by default in the UI) |
| `milestone_has_no_tasks` | Milestone without tasks |
| `project_has_no_objective` | Empty objective |

Returned by `GET /projects/:id/trace` and aggregated by PLAN-B-13. New codes require updating this table.

## 8. Integrity and repair

`npm run check:integrity` (and a nightly job in PLAN-B-16) reports: links with a missing or deleted endpoint, links across projects, duplicate links, `affects` links without a change, changes pointing at purged records (allowed; shown as "(deleted record)"), and requirements with duplicate keys. The repair mode removes dangling links and writes an audit entry.

## 9. Authorization and privacy

Tenant guard on both collections. Change summaries contain record titles, so deleting a record does **not** erase its history (preservation principle); account deletion and project purge do. Users cannot edit or delete changes. Change reads respect project archive and delete state the same way records do.

## 10. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Project page "History" | `GET /changes?projectId=…`, day groups, reviewed toggle |
| Diff view for documents | `changes` with versions + `GET /documents/:id/diff` |
| Detail panel "Why it exists / What it becomes" | `GET /records/:type/:id/links` |
| Landing "traceability" story (static) | unchanged |
| Specs gaps | `GET /projects/:id/trace` or `/requirements?hasGap=true` |
| Recents on Home (changes included) | `GET /home` (PLAN-B-13) |

## 11. Implementation tasks

- [ ] `LinksService` (validation, set replacement, batched reads, cascade helpers) — **delivered during Phase 3** so Tasks can use it.
- [ ] Domain event bus with transaction-aware collection.
- [ ] Changes recorder, summary templates, coalescing rules.
- [ ] Endpoints in section 5; reviewed flags; day grouping with time zones.
- [ ] Trace and links read models; gap catalogue.
- [ ] Integrity checker and repair mode.
- [ ] Seed changes derived from the demo's `changes` fixtures.

## 12. Testing

Link validation matrix (every illegal pair, cross-project, duplicates, self, archived, foreign ids); set replacement idempotence; transactional event recording (a failed write records no Change); coalescing behavior; trace correctness on the demo graph (REQ-005 reaches its tasks, the design notes file, and its changes); N+1 guard (query-count assertion on `getLinksFor`); integrity checker finds deliberately corrupted data.

## 13. Acceptance criteria

1. Every relationship the frontend shows is stored as a validated link or foreign key; text-only references do not exist.
2. A link between records of different projects or workspaces cannot be created by any request.
3. Each meaningful change in tasks, requirements, files, documents, and projects produces exactly one Change in the same transaction, or none if it rolls back.
4. `GET /records/Task/:id/trace` for a demo task returns the same requirement, milestone, and objective chain as the demo's panels.
5. The integrity checker reports clean after the full test and seed runs.

## 14. Open questions

- Whether to allow a manual "note" Change (a person's own history entry). Default: no for v0.1.
- Whether Change summaries should be regenerated when records are renamed. Default: no; history records what was true at the time.
- Whether a Final file should be linked to a **milestone** as the milestone's deliverable (the demo uses `milestoneId` on files; kept as a foreign key).

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, built 2026-11-16 · Validated links and recorded History work; the dedicated trace endpoints are not built.

**Built**

- Links service with the closed relation set, same-project and existence validation, set replacement, batched reads (`services/links.js`).
- Changes recorded by the services with plain summaries and linked requirements/tasks; History list, reviewed flag, document diffs from stored versions (`services/changes.js`, `shape.js`).
- Frontend History and the "Why it exists / What it becomes" panels run on real links.

**Not built yet**

- `GET /records/:type/:id/trace` and `/links`, gap-catalogue endpoint, change coalescing, atomic recording with the write (no transactions locally), integrity checker.

**Deviations and notes**

- Services call `recordChange()` directly; the in-process event bus described in the plan is not implemented.
