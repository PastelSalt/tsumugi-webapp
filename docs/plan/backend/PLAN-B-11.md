# PLAN-B-11 — Documents

> **Implementation status (2026-11-16):** ✅ Done (MVP). Markdown documents with full version history, diff and Final protection work. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** ✅ Done (MVP) · **Phase:** 5 · **Depends on:** [06](PLAN-B-06.md), [10](PLAN-B-10.md); link storage from [12](PLAN-B-12.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [14 Security](PLAN-B-14.md) · frontend [PLAN-A-04I](../frontend/PLAN-A-04I.md) (Documents and the reader), [PLAN-A-04H](../frontend/PLAN-A-04H.md) (History)

## 1. Purpose and scope

Written project records (briefs, specs, scripts, decision notes, release notes) stored as **Markdown with full version history**. In the UI a document is just another file in the Library (a "File" with a body); in storage it is its own collection because its content is text, editable, and versioned.

**In scope:** document CRUD, versions, drafts and finalizing, version comparison (diff), restore-to-version, links, search text, size limits, Markdown safety.
**Out of scope:** rich-text editing, real-time co-editing, comments (all later, PLAN-B-18), uploaded `.docx`/PDF files (PLAN-B-10).

## 2. Data model

`documents` and `document_versions` per PLAN-B-03 section 3.9.

| Field | Rule |
| --- | --- |
| `projectId` | Required; immutable (moving uses `/move`, section 4.8) |
| `title` | 1–200 chars |
| `status` | `Draft | Final`; the Final flag is the document's deliverable marker (equivalent to `isFinal` on uploads; `isFinalFile` in the demo) |
| `tags`, `description`, `milestoneId` | As for files |
| `currentVersion` | Integer pointing at the latest version (denormalized for list speed) |
| Version `body` | Markdown source, ≤ 200 KB (≈ 200,000 characters), UTF-8, normalized to `\n` line endings, NUL bytes rejected |
| Version `summary` | ≤ 200 chars: the "what changed" sentence shown in History |
| Links | `requirementIds[]`, `taskIds[]` on the document (via `links`) |

`bodyBytes` on the document supports list display ("2.9 KB") without loading bodies.

## 3. Versioning model

- **Every save of the body creates a new immutable version** (`version = currentVersion + 1`). Edits that change only metadata (`title`, `tags`, status, links) do **not** create a body version but still emit a Change.
- To avoid a version per keystroke, the client **autosaves to a draft buffer** locally and saves a version explicitly (Save) or when idle after meaningful edits; the server also **coalesces**: a save by the same user within 10 minutes of the previous version, with the same base version, **updates that version in place** unless the request sets `{ createVersion: true }`. Finalizing always creates a version.
- Versions are retained indefinitely while the document exists (they are the preserved history; the spec's "preservation of project history" principle). A per-document cap of 500 versions applies; beyond it the oldest non-final versions are thinned (keep first, every Final, and the most recent 100).
- The history list for a document is derived from versions: `{ version, at, summary, bytes, final }`.

## 4. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /documents` | List | Filters: `projectId`, `status`, `tag`, `requirementId`, `taskId`, `q`; no bodies; sort `-updatedAt` (default), `title` |
| `POST /documents` | Create | Body: `projectId`, `title`, `body?` (default empty), `status?` (default `Draft`); creates version 1 and a Change |
| `GET /documents/:documentId` | Read | Includes the **current body** and link arrays; `ETag` on version; `If-None-Match` supported |
| `PATCH /documents/:documentId` | Update | Metadata and/or body. Body saves require `baseVersion` (the version the client edited) → `412 version_mismatch` with the current body if someone else saved since (single user, two tabs) so work is never silently lost |
| `DELETE /documents/:documentId` | Soft delete | Versions retained until purge |
| `POST /documents/:documentId/restore` | Restore | |
| `GET /documents/:documentId/versions` | Version list | Paginated; no bodies |
| `GET /documents/:documentId/versions/:version` | One version's body | |
| `GET /documents/:documentId/diff?from=3&to=4` | Compare | Returns the line diff in the demo's shape `[{ mark: '=' | '+' | '-', text }]`, computed with the `diff` library; both versions must exist; large diffs capped (5,000 lines) with `truncated: true` |
| `POST /documents/:documentId/versions/:version/restore` | Restore content of an old version | Creates a **new** version whose body equals the old one (history is append-only) |
| `POST /documents/:documentId/finalize` | Mark Final | Sets `status = Final`, creates a version with summary "Finalized", emits a Change; idempotent |
| `POST /documents/:documentId/unfinalize` | Back to Draft | |
| `POST /documents/:documentId/move` | Move to another project | Same rules as files |
| `GET /documents/:documentId/export?format=md` | Download Markdown | Streams the body as `text/markdown` attachment (small, so served by the API); `format=json` includes metadata |

The merged Library view is `GET /library` (PLAN-B-10).

## 5. Business rules

1. **Markdown is data, never code.** The server stores and returns source text only. It **does not render** HTML. The client renders with its safe renderer (`client/src/lib/markdown.jsx`, no raw HTML). As defense in depth, the server rejects bodies containing `<script`, `javascript:` URLs in links, and `data:text/html` targets with `422 document.unsafe_content` **only when** the strict mode flag is on (default on); ordinary HTML in code fences is allowed. The exact rule set is documented and shared as a test fixture with the client.
2. **Final documents are protected:** editing the body of a `Final` document returns `409 document.final`; the client offers "Edit a copy" (creates a Draft version) or `unfinalize`. This mirrors treating Final as a deliverable.
3. **Titles** need not be unique. A default title ("Untitled document") is applied if blank on create.
4. **Concurrency:** body saves are compare-and-set on `baseVersion`; the coalescing rule applies only when `baseVersion` equals the latest.
5. **Limits:** 500 documents per project, 200 KB per version, 500 versions per document.
6. **Links:** requirements/tasks must be in the same project (`422 link.cross_project`). A Final document linked to a requirement closes the requirement's file gap (PLAN-B-09).
7. **Archived projects:** writes return `409 project.archived`; reads and exports work.
8. **Move:** clears links to the old project's records and records Changes in both projects.
9. **History:** each new version, finalize/unfinalize, link change, and delete emits a Change that records `fromVersion`/`toVersion` for the History diff view ("Updated scope and goals in the Opening brief", v3 → v4).

## 6. Diff details

- Line-based diff (`diffLines`), whitespace-insensitive option (`?ignoreWhitespace=true`).
- Output shape matches the frontend fixtures so the History view needs no change: `diff: [{ mark: '=' | '-' | '+', text }]`, with long unchanged runs collapsed (`{ mark: '…', count }`) using three lines of context.
- Cached per `(documentId, from, to)` in memory for the lifetime of the instance only (cheap to recompute; no correctness impact).

## 7. Search support

Title, tags, description, and the **current version body** feed the workspace search (PLAN-B-13). Because bodies live in `document_versions`, a denormalized `searchText` (first 20,000 characters, markdown syntax stripped) is kept on the document and updated on every body save so text indexes never touch the versions collection.

## 8. Authorization

Tenant guard on `documents`, `document_versions` (via `documentId` and `workspaceId`), with workspace id duplicated on versions for direct scoping. A version belongs to its document's project; reading a version through a foreign document id returns `404`.

## 9. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Library rows for documents | `GET /library` |
| Reader (`/library?doc=`) | `GET /documents/:id` |
| Editor (new; Markdown textarea with preview) | `PATCH /documents/:id` with `baseVersion` |
| "Version N · updated 2 days ago" | `currentVersion`, `updatedAt` |
| History diff view | `GET …/diff`, `changes` with `fromVersion/toVersion` |
| Mark Final / Draft | `finalize`, `unfinalize` |
| Export | `…/export` |

## 10. Implementation tasks

- [ ] Models, repository, service, controller, routes, schemas, OpenAPI.
- [ ] Version creation with coalescing and compare-and-set.
- [ ] Safety checks (size, NUL, unsafe constructs) with shared test fixtures.
- [ ] Diff endpoint using `diff`, context collapsing.
- [ ] Finalize protection, restore-from-version, thinning job.
- [ ] `searchText` maintenance.
- [ ] Domain events and Changes with version references.
- [ ] Seed documents from the demo fixtures (the Markdown bodies in `fixtures.js`).

## 11. Testing

Version numbering under concurrent saves (exactly one wins; the other gets `412`); coalescing window behavior; finalize/edit protection; diff output equals the demo fixtures' diffs for the same texts; restore creates a new version without mutating history; unsafe content matrix; 200 KB boundary; thinning keeps first, finals, and most recent; export fidelity (round trip).

## 12. Acceptance criteria

1. Saving a document twice in a row with the correct `baseVersion` never loses text, and a stale save never overwrites newer text.
2. The History view for `Opening brief` can show v3 → v4 from real versions with the same line marks as the demo.
3. A Final document cannot be changed without an explicit unfinalize.
4. Restoring v2 yields a new latest version and leaves v3 and v4 intact.
5. No API response contains rendered HTML from a document body.

## 13. Open questions

- Whether to offer branching/duplicate ("Edit a copy" creates a new document or a new draft version). Default: new draft version.
- Whether version thinning thresholds are acceptable for creative-writing use (long manuscripts).
- Rich-text or block editing later; would require a new storage format and migration plan.

---

## Implementation status (MVP)

**✅ Done (MVP)** · local MVP, built 2026-11-16 · Markdown documents with full version history, diff and Final protection work.

**Built**

- Create; every body change creates a new immutable version; stale saves are rejected with `412` and the current text (`baseVersion`).
- Version list and read, line diff in the History shape, restore an old version as a new one, finalize/unfinalize with edit protection, Markdown export.
- Frontend: Edit document dialog (save new version, mark final, back to draft).

**Not built yet**

- Save coalescing, version thinning, move to another project, strict unsafe-content mode (bodies are stored as text and never rendered by the server), a dedicated documents list endpoint (use `/library`).
