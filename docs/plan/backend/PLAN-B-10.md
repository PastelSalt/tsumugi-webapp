# PLAN-B-10 — Files and Object Storage

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). Files are stored on this computer instead of object storage, as chosen for the local MVP. See [Implementation status](#implementation-status-mvp) at the end.


**Status:** 🟡 Partly done (MVP) · **Phase:** 5 · **Depends on:** [06](PLAN-B-06.md); link storage from [12](PLAN-B-12.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [11 Documents](PLAN-B-11.md) · [14 Security](PLAN-B-14.md) · [16 Operations](PLAN-B-16.md) · frontend [PLAN-A-04G](../frontend/PLAN-A-04G.md) (Library), [PLAN-A-04H](../frontend/PLAN-A-04H.md)

## 1. Purpose and scope

The Library's uploaded files and external links: metadata in MongoDB, bytes in S3-compatible object storage, with browser-direct uploads and downloads through short-lived presigned URLs. Also owns the "Final file" flag (the deliverable marker used by traceability), quotas, and storage cleanup.

**In scope:** upload intents, completion/verification, download and preview URLs, metadata edits, external links, final flag, tags, quotas, orphan cleanup, content safety checks.
**Out of scope:** Markdown documents and their versions (11), the link store (12). The merged "Library" read endpoint is defined here (section 3).

## 2. Design decisions

- **Bytes never pass through the API** (D-08). Vercel Functions limit request bodies to about 4.5 MB; presigned URLs also keep large transfers off function time.
- **Private bucket only.** Objects are never public; every access is through a presigned URL created after an authorization check.
- **Storage keys are opaque and unguessable:** `w/<workspaceId>/p/<projectId>/<fileId>/<random>` — never derived from the file name. The original name is metadata only and is sanitized on every response (`Content-Disposition` uses an RFC 5987 encoded, sanitized name).
- **Provider-agnostic:** one `StorageService` interface (`presignPut`, `presignGet`, `head`, `delete`, `copy`) with an S3 implementation (R2 by default) and an in-memory test implementation (Q3).

## 3. Data model

`files` collection per PLAN-B-03 section 3.8, plus `upload_intents`.

| Field | Rule |
| --- | --- |
| `projectId` | Required; immutable (moving files uses `/move`) |
| `name` | 1–200 chars; path separators and control characters removed |
| `kind` | `document | image | media | data | link` derived from MIME/extension on completion; user may override only among allowed kinds |
| `ext`, `mime`, `bytes` | Set from the **verified** object (`head`), never trusted from the client |
| `tags` | ≤ 20, 1–30 chars, normalized |
| `description` | ≤ 2,000 chars |
| `isFinal` | Deliverable flag |
| `milestoneId` | Optional, same project |
| `storage` | `{ key, etag, status: pending|ready|failed, checksum }` |
| `link` | `{ url, host }` only for `kind = link` |
| Links | `requirementIds[]`, `taskIds[]` |

### 3.1 Allowed uploads (allow-list, enforced at intent time **and** verified after upload)

| Kind | Extensions (MIME verified by magic bytes where feasible) | Max size |
| --- | --- | --- |
| document | `pdf, docx, doc, odt, rtf, txt, md, pptx, epub` | 50 MB |
| image | `png, jpg, jpeg, gif, webp, svg*` | 25 MB |
| media | `mp3, wav, ogg, flac, mp4, webm, mov, m4a` | 200 MB |
| data | `csv, tsv, json, xlsx, ods, zip` | 100 MB |

\* **SVG is served only as a download with `Content-Disposition: attachment` and `Content-Type: application/octet-stream`**, never inline, because SVG can carry script. HTML, JavaScript, executables, and archives containing executables are not accepted. Default per-user quota 1 GB, per-file cap 100 MB for v0.1 (Q3); constants live in `constants.ts`.

## 4. Upload flow

1. `POST /files/upload-intents` with `{ projectId, name, mime, bytes, checksumSha256? }` and an idempotency key. The server validates type/size against section 3.1, checks the quota, creates a `files` record with `storage.status = pending` and an `upload_intents` record (TTL 2 h), and returns `{ fileId, upload: { method: 'PUT', url, headers, expiresAt } }`. The presigned URL pins `Content-Type`, `Content-Length` (exact), and the key.
2. The browser `PUT`s the bytes **directly** to storage (progress is the browser's, matching the demo's progress row).
3. `POST /files/:fileId/complete` — the server `head`s the object: size must equal the declared size and be ≤ the cap, content type must match, checksum (when provided) must match. Success sets `storage.status = ready`, stores `etag`, `bytes`, `mime`, `kind`, sets `uploadedAt`, deletes the intent, and records a Change. Failure deletes the object, marks the record `failed`, and returns `422 file.verification_failed`.
4. Large files (> 50 MB) use S3 **multipart**: `POST /files/upload-intents` returns `upload: { multipart: { uploadId, partSize, urls: [...] } }`, and `complete` accepts `parts[]` (ETags). Single-part is the v0.1 default for simplicity; multipart is Phase 5b.
5. A cleanup job (PLAN-B-16) removes `pending` records/objects older than 2 hours and `failed` older than 24 hours.

## 5. Endpoints

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `GET /files` | List files and links | Filters: `projectId`, `kind`, `tag`, `isFinal`, `requirementId`, `taskId`, `q`; sort `-updatedAt` (default), `name`, `bytes`; excludes `pending/failed` unless `status=any` |
| `GET /library` | Merged Library list | Files **and** documents (PLAN-B-11) as one list with `type: 'file'|'document'` and common fields, matching the single "File" concept in the UI; same filters |
| `POST /files/upload-intents` | Start an upload | Section 4 |
| `POST /files/:fileId/complete` | Finish an upload | Section 4 |
| `POST /files/:fileId/abort` | Cancel a pending upload | Deletes object and record |
| `POST /files/links` | Add an external link | `{ projectId, name, url, description?, tags? }`; URL rules in section 6 |
| `GET /files/:fileId` | Read metadata | Includes `requirementIds`, `taskIds` |
| `PATCH /files/:fileId` | Edit metadata | `name`, `description`, `tags`, `isFinal`, `milestoneId`, link sets; cannot change bytes |
| `GET /files/:fileId/download` | Download URL | Returns `{ url, expiresAt }`, 5-minute presigned GET with `Content-Disposition: attachment`; audit entry |
| `GET /files/:fileId/preview` | Inline preview URL | Only for safe inline kinds (png, jpg, gif, webp, pdf, audio/video); 5-minute URL with the correct `Content-Type`; otherwise `415 file.no_preview` |
| `POST /files/:fileId/replace` | Upload a new version of the bytes | Same flow as a new upload but keeps the record, links, and id; previous object is kept 30 days for recovery and a Change records the replacement |
| `DELETE /files/:fileId` | Soft delete | Object retained until purge; `204` |
| `POST /files/:fileId/restore` | Restore | |
| `POST /files/:fileId/move` | Move to another project | Clears links to the old project's requirements/tasks; copies nothing in storage (key is unchanged; a `projectId` mismatch inside the key is harmless because access is checked by record) |
| `GET /files/usage` | Quota | `{ usedBytes, limitBytes, fileCount }` |

## 6. Business rules

1. **Final flag:** `isFinal` can be set on any `ready` file or link. A Final file is evidence for requirements it is linked to; clearing it reintroduces file gaps (PLAN-B-09 section 4.7). Toggling emits a Change.
2. **Links (external):** only `https:` and `http:` URLs, ≤ 2,000 chars, no credentials in the URL, no `javascript:`/`data:`; the host is stored for display. The server **never fetches** the URL (no SSRF surface in v0.1). Link previews are out of scope.
3. **Quotas:** `usedBytes` is the sum of `ready` non-deleted files (and the retained previous versions). Creating an intent that would exceed the quota fails with `413 file.quota_exceeded`.
4. **Names and tags:** sanitized; names need not be unique.
5. **Archived projects:** uploads, edits, and deletes return `409 project.archived`; downloads still work.
6. **Pending files** are invisible in the Library, never linkable, and never counted in projects' `counts`.
7. **Orphans:** a file whose project was purged is deleted with it; a storage object with no record (detected by `check:integrity` listing the bucket prefix) is reported and removed by the cleanup job after a 24-hour grace.
8. **Content safety:** magic-byte sniffing for allowed types; an optional antivirus hook (`ScanService`, off by default) can quarantine a file by flipping `storage.status` to `quarantined` (download blocked). Documented as a future provider integration.
9. **Limits:** 2,000 files per project.
10. **History:** upload completed, replaced, renamed, final toggled, linked/unlinked, moved, and deleted emit Changes.

## 7. Authorization and access control

- All routes workspace-scoped. Presigned URLs are created **only after** the file record is loaded through the tenant guard; there is no endpoint that accepts a raw storage key.
- URLs are short-lived (upload 15 minutes, download/preview 5 minutes) and are not logged.
- Storage credentials live only in server environment variables; the browser never sees them. The bucket policy blocks public access and restricts the key to the application's credentials; CORS on the bucket allows `PUT`/`GET` from `CLIENT_ORIGIN` only.

## 8. Frontend mapping

| UI element | Endpoint |
| --- | --- |
| Library list, filters, kind chips | `GET /library` |
| Upload progress row (`progress: 62` in the demo) | `upload-intents` → browser PUT progress → `complete` |
| File detail: tags, description, final | `PATCH /files/:id` |
| Preview / Download buttons | `preview`, `download` |
| "Add link" | `POST /files/links` |
| Storage usage (new) | `GET /files/usage` |
| Project page "Files" | `GET /files?projectId=…` |

## 9. Implementation tasks

- [ ] `StorageService` interface, S3/R2 implementation, in-memory fake.
- [ ] Model, repository, service, controller, routes, schemas, OpenAPI.
- [ ] Upload intents, completion verification (head, size, type, checksum), abort, cleanup job hooks.
- [ ] Download/preview URL endpoints with correct headers.
- [ ] Link files and URL validation.
- [ ] Quota accounting and `usage` endpoint.
- [ ] Merged `/library` view (coordinated with PLAN-B-11).
- [ ] Replace-bytes flow and previous-object retention.
- [ ] Bucket setup guide (CORS, private, lifecycle for `exports/`), `.env.example`.
- [ ] Domain events, seed data (metadata-only demo files), factories.

## 10. Testing

Fake-storage integration tests for the whole flow (intent → upload → complete → download); wrong size/type/checksum rejected and object removed; quota edge cases; SVG never inline; foreign file ids return `404` for every route; expired intents cleaned; link URL validation matrix; the merged Library ordering and pagination; load test of presigning (should be CPU-trivial).
Manual: real bucket smoke test per release (documented in the runbook).

## 11. Acceptance criteria

1. A 40 MB file uploads from the browser without touching an API function body and appears in the Library after `complete`.
2. A client that lies about size or type is rejected and leaves no orphan object.
3. No API response, log line, or audit entry contains a storage key's secret parts or a presigned URL.
4. Another user can never obtain a download URL for a file they do not own.
5. Deleting a project and purging it removes its stored objects.
6. The Library shows files and documents as one list with identical ordering to the demo's rules.

## 12. Open questions

- Q3 (provider, quotas); whether to offer image thumbnails (a derived object generated by a job; deferred, depends on PLAN-B-19).
- Whether to support folders. The demo has tags and kinds only; folders are not planned.
- Antivirus provider choice if the hook is enabled.

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, updated 2026-11-16 · Files are stored on this computer instead of object storage, as chosen for the local MVP.

**Built**

- Upload through the API to `Server/uploads/<workspace>/` with a type allow-list, a 100 MB cap, sanitized names, and random storage keys (`services/library.js`).
- Contents are checked against the extension (magic bytes; text types must be valid UTF-8 without null bytes), so a renamed script or executable is refused (`services/sniff.js`).
- 1 GB storage quota with `GET /files/usage`; replace a file's contents in place (`POST /files/:id/replace`); move a file to another project.
- Download as an attachment (inline only for safe types with a sandboxing CSP, SVG never inline, `nosniff`); external links (http/https only); metadata edits, Final flag, tags, link sets; delete and restore; purge removes stored files.
- Merged library list `GET /library`; frontend Add file dialog (upload, link, note), Download, Mark as final file.

**Not built yet**

- Object storage with presigned uploads and upload intents, a separate preview endpoint, thumbnails, antivirus hook.

**Deviations and notes**

- **Deviation:** local disk replaces S3/R2 (D-08) until the deployment phase.
