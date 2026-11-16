# PLAN-B-13 — Home, Insights, and Search (Derived Metrics)

**Status:** Proposed · **Phase:** 7 (core helpers built earlier inside 06–09) · **Depends on:** [06](PLAN-B-06.md)–[12](PLAN-B-12.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** frontend [PLAN-A-04A](../frontend/PLAN-A-04A.md) (Home), [PLAN-A-04J](../frontend/PLAN-A-04J.md) (Insights), command palette in [PLAN-A-04L](../frontend/PLAN-A-04L.md)

## 1. Purpose and scope

Every number and label the person sees that is **not a stored field**: Home figures and lists, Insights cards, project progress and health, coverage, overdue lists, recents, and workspace search (the command palette). One module owns the **definitions** so the same metric can never be computed two ways (PROJECT-SPECS section 4.1: "documented calculation, not manually entered percentages"; section 4.9: "avoid metrics that cannot be calculated reliably").

**In scope:** metric definitions, aggregation endpoints, "today" and time-zone handling, recents, search, caching policy.
**Out of scope:** the underlying records (06–12), exports and scheduled reports (not planned for v0.1).

## 2. Metric definitions (the documented calculations)

All metrics exclude deleted records and, unless stated, records of archived projects. "Today" is the caller's calendar day in `ctx.timeZone`. Each definition is implemented once in `shared/metrics/` as a pure function with unit tests, and is mirrored in the **user guide** (`docs/individual-workspace-guide.md`) so the UI text and the code agree.

| Metric | Definition |
| --- | --- |
| **Open task** | `status ≠ Done` |
| **Overdue task** | Open and `due < today` |
| **Due today** | Open and `due = today` |
| **Doing** | `status = Doing` |
| **Task progress (project)** | `done / total` tasks of the project; `pct = round(done/total*100)`, or `null` when `total = 0` |
| **Milestone progress** | `done / total` tasks assigned to the milestone |
| **Milestone state** | `Done` if done; else `Overdue` if `due < today`; else `Doing` if `start ≤ today`; else `Upcoming` |
| **Project health** | `At risk` if any open task of the project is overdue; else `On track` |
| **Coverage** | `{ total, complete, withGaps }` over requirements, where `complete = Met ∧ verified` and a gap is no linked task or no linked Final file (PLAN-B-09 section 5) |
| **Overdue records** | Overdue tasks and overdue milestones, combined |
| **Up next (n days)** | Open tasks and not-done milestones with `today < due ≤ today + n` |
| **Recents** | Latest `lastOpenedAt` projects, recently updated files, and recent changes, merged by time |

If a metric cannot be computed from stored data (for example, "time spent"), it is **not offered**.

## 3. Endpoints

| Method and path | Purpose | Response |
| --- | --- | --- |
| `GET /home` | Everything Home needs in one call | `{ today, figures { dueToday, overdue, doing }, attention { overdue[], today[], doing[], doneToday[] }, upNext[], recentProjects[], recents[], firstRun }` with record summaries (id, title, project, due, status) — **no N+1 for the client** |
| `GET /insights` | Insights page | `{ progress[], coverage, overdue[], projectsAtRisk[] }`, optionally `?projectId=` |
| `GET /projects/:projectId/summary` | Derived values for one project | `progress`, `health`, `counts`, `nextMilestone`, `coverage` |
| `GET /search` | Workspace search | Section 6 |
| `GET /recents` | Recently used records | `?limit=6` (max 20); mixes Projects, Files, Changes as in the demo `recents()` |
| `GET /metrics/definitions` | Machine-readable definitions (names, formulas as text) | For the Help page and tests |

Individual list endpoints (tasks, requirements, …) stay in their modules; this module composes **summaries** and never duplicates their writes.

## 4. Home response detail

- `today` — `YYYY-MM-DD` in the caller's zone; the client stops guessing the date.
- `attention` buckets come from the same functions as `GET /tasks/views/today` (PLAN-B-08 section 6).
- `upNext` defaults to 7 days, mixed tasks and milestones.
- `recentProjects` — up to 4 non-archived by `lastOpenedAt`.
- `firstRun` — checklist state and whether to show it (PLAN-B-05).
- A hard cap of 10 items per bucket with `overflow` counts keeps the payload small.

## 5. Insights response detail

- **Progress card:** per active project `{ projectId, name, done, total, pct, health }`.
- **Coverage card:** workspace and per-project coverage with the list of requirements that have gaps (id, key, title, which gap).
- **Overdue card:** `overdueRecords` with type and project.
- Projects with `total = 0` return `pct: null` and are labelled "no tasks yet", never `0%`.

## 6. Search

### 6.1 Scope

Searches titles, names, keys, tags, and descriptions of projects, tasks, requirements, files, documents, and milestones, plus document `searchText` (PLAN-B-11). Power the command palette (`Ctrl/Cmd+K`) and the Library/Tasks `q` filters.

### 6.2 Approach (decision at the start of Phase 7)

| Option | Pros | Cons | Decision |
| --- | --- | --- | --- |
| MongoDB **text indexes** per collection | Works on any Mongo, no extra service | One text index per collection, weak ranking, no typo tolerance | **Default for v0.1** |
| **Atlas Search** | Ranking, typo tolerance, autocomplete | Atlas-specific, extra config | Upgrade path if text indexes feel poor |
| External engine | Best quality | Another service to run and secure | Rejected for v0.1 |

The `SearchService` interface hides the choice (`search(ctx, query, { types, projectId, limit })`).

### 6.3 Endpoint behavior

`GET /search?q=chapter&types=task,file&projectId=…&limit=20`

- `q` 1–100 characters, trimmed; `types` whitelist; `limit` ≤ 50.
- Each source collection is queried in parallel, scoped by workspace and `deletedAt`, then merged by score with a small boost for recent and for exact title prefix; `projectName` is attached.
- Response items: `{ type, id, title, subtitle, projectId, href }` where `href` is the **frontend route** logic from `recordHref` (kept server-side so the palette needs no per-type switch; routes are listed in `shared/routes.ts`).
- Archived projects are excluded unless `?archived=true`.
- User queries are **never** passed as raw regex or `$where`; text-search strings are escaped/quoted.

### 6.4 Privacy

Search queries are not stored or logged (only a hashed length bucket for metrics). Results never include records from other workspaces.

## 7. Time and zone handling

- `ctx.timeZone` comes from preferences (PLAN-B-05). "Today" is computed once per request with `Intl`/`date-fns-tz` (or Temporal when stable) and passed down; functions never call `new Date()` internally (they receive a `clock`), which makes them testable with the demo's fixed date.
- Edge cases covered by tests: daylight-saving transitions, users at UTC+14 and UTC−12, midnight boundaries, and zone changes mid-day.

## 8. Performance and caching

- All aggregates run through indexed queries (`PLAN-B-03` section 4) and use `$group`/`$facet` where it saves round trips. Targets: `GET /home` and `GET /insights` p95 < 300 ms for 5,000 tasks.
- **No cache in v0.1** beyond HTTP `ETag` on responses (hash of the payload) so unchanged polls return `304`.
- If measurements demand it: a `metrics_snapshots` collection keyed by `(workspaceId, day)`, invalidated by domain events, or short-lived per-instance memoization keyed by workspace version. Added only with a measured need and documented here.
- Pagination is not needed (bounded buckets) but caps are enforced.

## 9. Authorization

Tenant guard on every query. Aggregation pipelines start with `$match: { workspaceId, deletedAt: { $exists: false } }`, enforced by the same helper (`scopedAggregate`). Search results are filtered the same way; a record's existence is never inferred from counts across workspaces.

## 10. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Home headline, figures, lists | `GET /home` |
| Project cards: progress bar, health | `GET /projects?expand=summary` |
| Insights page cards | `GET /insights` |
| Command palette results | `GET /search` |
| Tasks/Library text filter | `q` on module list endpoints |
| Help page "how numbers are calculated" | `GET /metrics/definitions` (and the guide) |

## 11. Implementation tasks

- [ ] `shared/metrics/` pure functions with a clock parameter, ported from `selectors.js` and verified against it.
- [ ] `HomeService`, `InsightsService`, `SummaryService`.
- [ ] Aggregation pipelines and index checks.
- [ ] `SearchService` with MongoDB text indexes, scoring, href builder.
- [ ] Metric definitions endpoint and a docs page update.
- [ ] ETag support on summary endpoints.
- [ ] Performance test with a generated 5,000-task workspace.

## 12. Testing

Golden tests: the seeded demo workspace at the demo's fixed date must reproduce the **same figures** as the frontend selectors (`figures()`, `projectProgress()`, `coverage()`, `overdueRecords()`, `todayList()`, `upNext()`, `recents()`); time-zone matrix; search relevance and injection attempts (regex metacharacters, operators); cross-workspace isolation; performance budgets in CI (non-blocking warning, blocking in release gate).

## 13. Acceptance criteria

1. Home and Insights render from the API with numbers identical to the demo selectors for equivalent data.
2. Every metric on screen has a definition in `GET /metrics/definitions` and the user guide.
3. The palette returns results across all record types in under 300 ms (p95) and never returns another user's record.
4. Changing the user's time zone changes "today" buckets correctly without altering stored data.
5. No metric displays `0%` for a project with no tasks.

## 14. Open questions

- Atlas Search upgrade decision (after measuring text-index quality).
- Whether to offer a weekly summary email/report later (depends on PLAN-B-19).
- Whether health should consider overdue milestones too. Default: tasks only, as in the demo.
