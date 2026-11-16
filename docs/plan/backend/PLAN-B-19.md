# PLAN-B-19 — Notifications, Recurrence, and Background Jobs (Future Design)

**Status:** Design only (the minimal job runner is built in Phase 5–6 for exports and cleanup) · **Phase:** Later · **Depends on:** [08](PLAN-B-08.md), [16](PLAN-B-16.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [05 Export](PLAN-B-05.md) · [10 Files](PLAN-B-10.md) · [18 Teams](PLAN-B-18.md) · PROJECT-SPECS section 14 (notifications, background processing)

## 1. Purpose and scope

Everything that must happen **outside a single request**, given that Vercel Functions are stateless and short-lived (D-12): a small, safe **job runner**, plus the features built on it — notifications and reminders, recurring tasks, account exports, file post-processing, and scheduled maintenance.

**In scope:** the `jobs` collection and runner, scheduled triggers, notification model and delivery channels, preferences and quiet hours, recurring task rules, reminder scheduling, export generation, thumbnails/scanning hooks.
**Out of scope:** persistent WebSockets or live collaboration, a general-purpose workflow engine, mobile push specifics (a later client decision).

## 2. Constraints that shape the design

- No long-lived processes: work is a **record in MongoDB** processed by short invocations triggered by Vercel Cron (or another scheduler) and, if ever needed, by a queue provider.
- Each invocation has a hard time limit; jobs must be **chunked, resumable, idempotent**.
- Delivery is **at-least-once**; handlers must tolerate duplicates.
- If volume or latency outgrows cron-polling, move the runner to a container (the Dockerfile exists, PLAN-B-16) or a managed queue (Upstash QStash, SQS) without changing job handlers.

## 3. Job runner (built first, minimal)

### 3.1 Model (`jobs`)

| Field | Purpose |
| --- | --- |
| `type` | Handler name (`export.build`, `storage.cleanup`, `reminder.send`, `recurrence.generate`, …) |
| `payload` | Small JSON (ids, not content; ≤ 16 KB) |
| `status` | `queued | running | succeeded | failed | dead` |
| `runAt` | Earliest time to run (used for reminders) |
| `attempts`, `maxAttempts` | Retry budget (default 5) |
| `lockedBy`, `lockedUntil` | Lease so two invocations never run the same job |
| `lastError` | Truncated, no secrets |
| `workspaceId`, `userId` | Scope and ownership (for audit and deletion) |
| `uniqueKey` | Optional idempotency key (unique index) to prevent duplicates |
| `createdAt`, `finishedAt` | Timestamps; finished jobs TTL-deleted after 14 days |

Indexes: `{ status, runAt }`, `{ lockedUntil }`, unique `{ uniqueKey }` (sparse), `{ workspaceId, type }`.

### 3.2 Runner behavior

`POST /api/internal/cron/jobs` (secured by `CRON_SECRET`, PLAN-B-16 section 8) runs every minute (or five): claims up to N due jobs with `findOneAndUpdate` (`status: queued`, `runAt ≤ now` → `running`, lease 60 s), executes handlers until a 8-second budget is used, then returns. Failed jobs back off exponentially (30 s, 2 min, 10 min, 1 h, 6 h) and become `dead` after `maxAttempts` (alert in PLAN-B-16). Expired leases are reclaimed. Handlers receive an `AbortSignal` for the time budget and must checkpoint progress in `payload.cursor` for long work.

### 3.3 Safety

Handlers are registered in code (no dynamic code from the database), receive only ids, and re-load records through tenant-scoped repositories using the job's `workspaceId`. All job side effects are idempotent (guarded by `uniqueKey` or by checking state first).

## 4. Export generation

Turns the inline JSON export of PLAN-B-05 into a real job: `export.build` collects records in pages, writes a ZIP to the `exports/` prefix in the bucket (streamed multipart; no whole-file memory), writes a manifest, stores the export record with a 7-day expiry, and sends "your export is ready" (a signed 24-hour link). Status polling is `GET /me/export/:id`. One active export per user; failures leave no partial objects (cleanup handler).

## 5. Notifications

### 5.1 Principles

Quiet by default, **opt-in** per kind, never nagging; consistent with the product tone. In the individual workspace the only notifications are the user's own reminders and account/security emails.

### 5.2 Kinds (initial)

| Kind | Trigger | Channels | Default |
| --- | --- | --- | --- |
| Task reminder | `remindAt` reached | In-app, email | On for tasks with a reminder the user set |
| Due-today digest | Morning in the user's zone | Email | **Off** |
| Overdue nudge | Weekly summary of overdue work | Email | **Off** |
| Security events | New sign-in, password change, deletion request | Email | **On** (non-optional for critical ones) |
| Export ready | Job finished | In-app, email | On |
| Team (PLAN-B-18) | Assigned, mentioned, review requested | In-app, email | On in team workspaces |

### 5.3 Model

`notifications`: `userId`, `workspaceId`, `kind`, `target { type, id }`, `title` (short, plain), `createdAt`, `readAt`, `channelsSent[]`, `dedupeKey` (unique per user to prevent duplicates). TTL 90 days. `notification_preferences` live on `users.preferences.notifications` (per kind and channel, `quietHours { start, end }`, digest time), validated by a strict schema.

### 5.4 Endpoints

`GET /notifications` (cursor, `unread=true`), `POST /notifications/:id/read`, `POST /notifications/read-all`, `GET /notifications/unread-count`, preference updates through `PATCH /me`. In-app delivery is **polling** (`unread-count` every 60 s when the tab is focused; `ETag` makes it cheap) because WebSockets are out of scope; SSE can be reconsidered on a container host.

### 5.5 Email delivery

Reuses `EmailService` (PLAN-B-04 section 6) with batching, per-user rate limits (max 10 emails/day outside security mail), unsubscribe link (one-click `List-Unsubscribe` header, token-based), and bounce/complaint handling via the provider webhook (`POST /webhooks/email`, signature verified) that suppresses an address and flags it in the account.

## 6. Reminders

- Tasks gain `remindAt` (instant in UTC, set from a local date/time + zone) and optional `remindBefore` presets (at due time, 1 day before). A reminder creates a `reminder.send` job with `runAt = remindAt` and `uniqueKey = reminder:<taskId>:<remindAt>`; changing or clearing the reminder cancels the queued job; completing the task cancels it.
- Quiet hours defer the send to the end of the window. Reminders for deleted tasks or archived projects are skipped.

## 7. Recurring tasks

### 7.1 Model

`recurrence` embedded on a task: `{ rule: { freq: 'daily'|'weekly'|'monthly'|'yearly', interval, byWeekday[], byMonthDay, until?, count? }, mode: 'on_complete' | 'fixed', timeZone, lastGeneratedFor }` (a deliberately small subset of RFC 5545, validated; no custom RRULE strings from clients).

### 7.2 Behavior

- **`on_complete`** (default, simplest and what most people mean): completing the task creates the next occurrence with the next due date computed from the rule and the **completion date** (or the previous due date for `fixed`), copying title, notes, subtasks (reset), priority, links to requirements, and milestone. Done in the **same transaction** as completion, so there is no gap and no job needed.
- **`fixed`** (calendar-based, e.g. every Monday): a scheduled `recurrence.generate` job creates the next occurrence ahead of time (rolling window of one occurrence) even if the previous is unfinished; a task never has more than one open future occurrence.
- Each occurrence is a normal task linked by `seriesId`; editing offers "this one" or "all future" (the future series edit updates the rule and the next open occurrence only).
- Time-zone and DST correctness is tested with the controllable clock (PLAN-B-15); month-end rules ("31st") clamp to the last day.
- The Changes module records generation as a `system` source Change.

### 7.3 Endpoints

Recurrence is set through `PATCH /tasks/:id` (`recurrence` object) with extra read fields `seriesId` and `nextOccurrence`; `POST /tasks/:id/skip` (skip this occurrence) and `DELETE /tasks/:id/series` (stop recurring). Today/Upcoming/Calendar views (PLAN-B-08 section 6) include generated occurrences automatically; the calendar can also **preview** future occurrences computed on read (not stored) for the visible month.

## 8. Other background work

| Handler | Purpose |
| --- | --- |
| `storage.cleanup` | Expired intents, failed uploads, stale multipart uploads (PLAN-B-10) |
| `purge.batch` | Hard-delete soft-deleted batches and expired accounts, chunked per workspace |
| `integrity.check` | Nightly graph/link integrity report (PLAN-B-12) |
| `versions.thin` | Document version thinning (PLAN-B-11) |
| `file.thumbnail` | Generate image/PDF thumbnails into derived objects (needs an image library or external service; optional) |
| `file.scan` | Antivirus hook (provider-dependent; optional) |
| `email.send` | Retryable email delivery with backoff (so request paths never wait on the provider) |

The first five are available at launch as cron-invoked functions (PLAN-B-16 section 8); `email.send` moves to the job runner when email volume warrants.

## 9. Observability and operations

Metrics: queue depth by type, oldest queued age, failure/dead counts, processing time, reminder lateness. Alerts: dead job, oldest queued > 10 minutes, runner not executing (PLAN-B-16). `GET /api/internal/jobs/stats` (cron-secret protected) for debugging. Dead jobs are inspectable and re-queueable through a script (`npm run jobs:retry -- <id>`), never through the public API.

## 10. Security and privacy

- Cron/runner routes require `CRON_SECRET`; they are not in the public OpenAPI and are rate-limited by IP allow-listing where the platform supports it.
- Payloads contain ids only; no content or secrets; email bodies are rendered at send time from current data.
- Notification text uses record titles (user-authored) as inert text.
- Unsubscribe and preference changes take effect immediately; suppressed addresses never receive non-security mail.
- Account deletion cancels the user's queued jobs and removes notifications and exports.
- Update the Privacy Policy (email categories, retention of notifications) before shipping.

## 11. Frontend implications (when scheduled)

A notifications menu with unread count and read states, reminder controls in the task detail, recurrence controls and series edit prompts, a preferences section in Account, and "export ready" feedback. All copy follows the product's plain tone; no urgency or guilt language.

## 12. Implementation phases

1. **Phase 5–6 (needed earlier):** jobs collection, runner endpoint, `storage.cleanup`, `purge.batch`, `integrity.check`, `export.build`.
2. **Later A:** reminders and in-app/email notifications with preferences and unsubscribe.
3. **Later B:** recurring tasks (`on_complete` first, then `fixed`).
4. **Later C:** thumbnails/scanning, digests, team notifications (with PLAN-B-18).

## 13. Testing

Runner lease and reclaim behavior with a controllable clock; concurrent runners never double-execute; retry/backoff/dead lifecycle; handler idempotence (run twice, same result); reminder scheduling, cancel on edit/complete, quiet hours; recurrence rule table tests across time zones/DST/month ends; export job produces a valid, complete archive and cleans up on failure; notification dedupe and preference enforcement; unsubscribe and bounce handling.

## 14. Acceptance criteria

1. A job claimed by two invocations at once runs exactly once.
2. A failed job retries with backoff and ends as `dead` with an alert after the budget.
3. An export of a large workspace completes across multiple invocations and yields a valid ZIP.
4. A reminder fires once at the right local time (within the runner's cadence), is skipped for completed tasks, and respects quiet hours.
5. Completing a recurring task creates exactly one next occurrence with the correct date, including month-end and DST cases.
6. No notification or email is sent to a user who disabled that kind or unsubscribed (except mandatory security mail).

## 15. Open questions

- Runner cadence (1 vs 5 minutes) given Vercel Cron limits on the chosen plan, or moving to a queue provider.
- Push notifications (web push) after the app is installable; needs a service worker and consent UX.
- Whether to support "snooze" for reminders in the first release.
- Calendar feeds (ICS) for tasks and milestones (a natural, low-risk follow-up; needs signed, revocable feed tokens).
