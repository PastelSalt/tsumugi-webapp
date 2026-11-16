# PLAN-B-16 — Deployment, Operations, and Observability

> **Implementation status (2026-11-16):** ⬜ Not started. Deployment is intentionally out of scope for the local MVP. Only the local run story exists. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** ⬜ Not started · **Phase:** 1 (CI and preview deploy) and 7 (production) · **Depends on:** [01](PLAN-B-01.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [14 Security](PLAN-B-14.md) · [15 Testing and CI](PLAN-B-15.md) · [19 Background jobs](PLAN-B-19.md)

## 1. Purpose and scope

How the system gets from a pull request to production and stays healthy: environments, hosting layout on Vercel, Atlas and storage setup, configuration and secrets, scheduled functions, migrations, observability, backups and restore, cost guardrails, and the runbook. Implements PROJECT-SPECS sections 7.4 and 12.

## 2. Environments

| Environment | Purpose | Hosting | Data |
| --- | --- | --- | --- |
| **Local** | Daily development | `npm run dev` for client and server; local MongoDB (Docker Compose file provided) or Atlas dev | Seeded demo data; fake email (console) and fake or local S3 (MinIO in Compose) |
| **Preview** | One per pull request and `main` | Vercel Preview deployments | A shared **preview** Atlas database (data is disposable, reset weekly) and preview bucket |
| **Production** | Real users | Vercel Production | Dedicated Atlas **production** cluster/database, production bucket |

Hard rules: separate databases, buckets, credentials, and email domains per environment; preview never has production secrets (release criterion); production data is never copied to preview without anonymization.

`docker-compose.yml` (repo root) starts MongoDB as a **single-node replica set** (needed for transactions) and MinIO with a pre-created private bucket and CORS, so `npm run dev` works offline in minutes (PLAN-B-15 acceptance).

## 3. Hosting layout (Vercel)

- **One Vercel project, one domain** (Q1) serving the built client as static assets and the API as Functions under `/api/*`. Same-site hosting makes cookie sessions first-party and removes CORS in production (CORS config remains for local dev and previews).
- `vercel.json` (decided in Phase 1): rewrites `/api/(.*)` to the function entry; SPA fallback rewrites all non-file, non-`/api` paths to `index.html` (the client uses a history-API router); security headers for static assets; `functions` config with `maxDuration` (10 s default; export/cleanup routes may raise to 60 s on plans that allow it), `memory` 1024 MB, and region pinned **near the Atlas region** (Q-region below) to cut latency.
- **Entry point:** `api/index.ts` (repository root) re-exports `Server/src/platform/vercel.ts`, which creates the app once and handles requests. Build uses the Vercel Node runtime with `@vercel/node` bundling of the TypeScript source; if bundling problems appear, a prebuilt `dist/` is the fallback (decided in a Phase 1 spike).
- **Build:** install at the monorepo root with npm workspaces, build the client (`client/dist`), typecheck the server. Preview builds run `npm run check:legal` as part of the client build (already wired).
- **Portability:** the Express app has no Vercel-specific code; a `Dockerfile` for `Server/` is kept working (CI builds it) as the escape hatch if long-running needs arrive (D-12, D-17).

## 4. MongoDB Atlas

- **Cluster:** start with an M0/Flex for development and preview; **M10 or higher (or equivalent dedicated tier) for production** because backups, transactions at scale, and connection limits matter. Replica set (transactions required).
- **Region:** same region family as the Vercel function region and the storage bucket where possible; recorded in the Privacy Policy processor list (PLAN-B-14 section 10). *Open question Q-region:* EU vs US residency requirements for target users.
- **Users:** one least-privilege application user per environment (`readWrite` on that database only); a separate admin identity for migrations used from a developer machine or protected workflow, never in the function runtime.
- **Network:** IP allow-list is difficult with serverless egress. Choose one and document: Vercel Secure Compute / dedicated egress IPs, Atlas private endpoint (paid), or an allow-list of `0.0.0.0/0` **with** strong credentials, TLS, and monitoring as a documented, time-boxed exception (risk accepted by the owner). Decision recorded before production.
- **Connection management:** `maxPoolSize` 5 per instance; monitor connections against the tier limit; alert at 70% (risk R1).
- **Indexes:** created by `npm run db:indexes` during releases; Atlas Performance Advisor reviewed monthly.
- **Backups:** continuous cloud backup with point-in-time restore on production; retention 7 days of PITR plus daily snapshots for 35 days (Q7). Preview has none.
- **Restore rehearsal** (release criterion): restore the latest snapshot into a scratch cluster, run `check:integrity` and a read-only smoke test, record the timings and steps in the runbook. Repeat quarterly.

## 5. Object storage

- Default Cloudflare R2 (S3-compatible); alternatives allowed through env vars (Q3). Buckets: `tsumugi-prod`, `tsumugi-preview`, with **no public access**.
- Bucket CORS: allow `PUT` and `GET` from the exact app origins, headers `Content-Type`, `Content-Length`, `x-amz-*`, 10-minute max age.
- Lifecycle rules: delete `exports/` objects after 7 days; abort incomplete multipart uploads after 1 day; (optional) transition noncurrent versions after 30 days.
- Credentials: one access key per environment scoped to its bucket; rotated yearly or on suspicion (section 8).
- Versioning is **off** by default (the app keeps previous file versions deliberately; PLAN-B-10) — enable only if backup requirements demand it.

## 6. Configuration and secrets

Environment variables are defined in PLAN-B-01 section 4 and set in Vercel per environment (Production / Preview / Development scopes). `AUTH_SECRET` supports a **previous-secret** list (`AUTH_SECRET_PREVIOUS`) so rotation does not log everyone out. Config changes go through pull requests for non-secret values (`vercel.json`, feature flags in code) and through the Vercel dashboard or CLI for secrets. A `docs/operations/environment.md` page (created with this plan) lists every variable, its owner, and rotation cadence.

**Feature flags:** simple environment-driven flags in `config/flags.ts` (`FLAG_STRICT_MARKDOWN`, `FLAG_HIBP_CHECK`, `FLAG_MULTIPART_UPLOADS`, …), documented with defaults; no third-party flag service in v0.1.

## 7. CI/CD

| Stage | Trigger | Actions |
| --- | --- | --- |
| Pull request | `pull_request` | Lint, typecheck, tests, contract suites, audit, secret scan, OpenAPI diff, client build, Docker build (PLAN-B-15 section 11); Vercel creates a preview deployment |
| Merge to `main` | `push` | Same checks; Vercel Preview of `main`; E2E and k6 smoke against it |
| Release | Git tag `vX.Y.Z` (or manual dispatch) | Run migrations against production (`db:migrate`, with a dry run in preview first), run `db:indexes`, promote the tested deployment to Production (Vercel promotion), run post-deploy smoke tests, create release notes |
| Rollback | Manual | Vercel instant rollback to the previous deployment; migrations are written to be backward compatible for one release so code can roll back without data rollback (expand → deploy → contract pattern) |

Branch protection, required reviews for `Server/` and `docs/plan/backend/`, and signed tags are configured (PLAN-B-14 section 11). Deployments never run migrations from inside functions.

## 8. Scheduled functions (cron)

Vercel Cron calls protected routes `POST /api/internal/cron/<job>` with `Authorization: Bearer ${CRON_SECRET}` (constant-time compare; rejected otherwise; not part of the public OpenAPI). Each job is idempotent, bounded in time, and logs counts.

| Job | Schedule | Action |
| --- | --- | --- |
| `purge` | Daily 03:00 UTC | Hard-delete soft-deleted batches older than 30 days and their links, objects, and orphan intents (PLAN-B-03 section 7); finalize accounts past the 14-day deletion window |
| `storage-cleanup` | Hourly | Remove `pending`/`failed` uploads and expired exports; abort stale multipart uploads |
| `integrity` | Daily 04:00 UTC | Run `check:integrity`, alert on findings |
| `thin-versions` | Weekly | Thin over-cap document versions (PLAN-B-11) |
| `export-worker` | Every 5 min (later) | Process export jobs (PLAN-B-19) |
| `reminders` | Every 5 min (later) | Send due reminders (PLAN-B-19) |

Limits: if a job would exceed the function time limit it processes a bounded batch and exits; the next run continues. Jobs record progress in `jobs`/`counters` where needed.

## 9. Observability

- **Logs:** pino JSON to stdout, retained per the Vercel plan and **drained** to a log service (Axiom, Better Stack, or Datadog) for 30-day retention and querying; drains configured via Vercel. Redaction per PLAN-B-14.
- **Metrics** (derived from logs and Atlas): request rate, error rate by status class, p50/p95/p99 latency by route pattern, cold-start rate, rate-limit hits, login failures/lockouts, upload failures, job outcomes, Atlas connections/operations/slow queries, storage usage.
- **Tracing:** request id propagated into every log line; OpenTelemetry is optional later.
- **Uptime:** an external probe on `/api/v1/health/ready` every minute (UptimeRobot or Better Stack), plus a synthetic login/read check every 15 minutes in production.
- **Error tracking:** Sentry (or equivalent) for unexpected `5xx` with **PII scrubbing** and release tagging; no request bodies attached; disabled in local dev.
- **Dashboards:** one operations dashboard (traffic, errors, latency, DB, storage) and one security dashboard (auth failures, rate limits).

### 9.1 Alerts (first set)

| Alert | Condition | Severity |
| --- | --- | --- |
| API down | Health probe fails 3 times | Page |
| Error spike | `5xx` > 2% for 5 min | Page |
| Latency | p95 > 1 s for 10 min | Warn |
| DB connections | > 70% of tier limit | Warn |
| Login anomaly | Failures > 5× baseline for 10 min | Warn (possible credential stuffing) |
| Job failure | Any cron job fails or does not run | Warn |
| Integrity findings | Any | Warn |
| Storage/DB growth | > 80% of plan | Warn |
| Certificate/domain expiry | < 21 days | Warn |

Notifications go to email and a chat/push channel chosen by the owner (open question).

## 10. Capacity and cost guardrails

- Expected load for early users is small; the plan is dominated by fixed tier costs. Budgets recorded in `docs/operations/costs.md`: Vercel plan, Atlas tier, storage, email, logging, monitoring.
- Guardrails: per-user quota (1 GB), per-project record caps, rate limits, function duration limits, Atlas alerts on billing, storage lifecycle rules, and spend alerts on every provider.
- Load model and scale triggers: if sustained p95 degrades or connection saturation appears, move to a container host (Dockerfile ready) or a larger tier before adding complexity.

## 11. Disaster recovery

| Scenario | Target | Plan |
| --- | --- | --- |
| Bad deploy | RTO 15 min | Vercel rollback; migrations are backward compatible |
| Data corruption/deletion (human error) | RPO ≤ 5 min with PITR on production | Restore to a scratch cluster, extract records, repair or swap |
| Atlas outage | Best effort (provider SLA) | Status page; read-only maintenance page served by the client when `ready` fails |
| Storage outage | Best effort | Library degrades (downloads/uploads fail with `503`); other features keep working |
| Secret compromise | RTO 1 hour | Rotation steps (section 6), revoke all sessions, redeploy |
| Account loss at a provider | Documented | Keep admin recovery access for the owner on every provider; encrypted offline copy of critical config (not secrets in the repo) |

## 12. Runbook (`docs/operations/runbook.md`, created in this plan's tasks)

Contents: how to deploy and roll back; how to run migrations and indexes; rotating each secret; restoring from backup step by step; handling a data-subject request (export/delete) manually; revoking all sessions; enabling maintenance mode; reading logs by request id; common alerts and first actions; contact list; post-incident template.

## 13. Implementation tasks

- [ ] `docker-compose.yml` (Mongo replica set, MinIO), `.env.example` for local, `npm run dev` for client + server together.
- [ ] `vercel.json`, `api/index.ts`, deployment spike for TypeScript bundling, region pinning.
- [ ] GitHub Actions workflows (PR, main, release) and branch protection settings documented.
- [ ] Atlas projects/clusters per environment, users, network decision, backups enabled, alerts.
- [ ] Buckets, CORS, lifecycle, credentials per environment.
- [ ] Cron routes, `CRON_SECRET`, job implementations (purge, cleanup, integrity, thinning).
- [ ] Log drain, error tracking, uptime probes, dashboards, alerts.
- [ ] `docs/operations/{environment,costs,runbook}.md`; restore rehearsal recorded.
- [ ] Migration release step and rollback rehearsal.

## 14. Acceptance criteria

1. Opening a pull request produces a working preview deployment of client and API against the preview database and bucket.
2. A tagged release migrates, deploys, and passes smoke tests with no manual steps beyond approval.
3. A rollback restores the previous behavior within 15 minutes without data loss.
4. A restore from backup has been rehearsed and timed, with results in the runbook.
5. Every alert in section 9.1 is configured and test-fired once.
6. Cron jobs run on schedule, are idempotent, and fail loudly.
7. No production secret is present in preview, the repository, logs, or build output.

## 15. Open questions

- **Q-region:** data residency requirements (EU/US) and therefore Atlas/Vercel/storage regions.
- Atlas network access approach (private endpoint vs dedicated egress vs documented open allow-list).
- Log/monitoring vendors and who receives pages.
- Production domain and email sending domain (Q1, Q2).
- Whether to adopt a staging environment between Preview and Production (default: no, promote tested previews).

---

## Implementation status (MVP)

**⬜ Not started** · local MVP, built 2026-11-16 · Deployment is intentionally out of scope for the local MVP. Only the local run story exists.

**Built**

- Local run: `npm run setup`, `npm run dev` (API + web), `npm run seed`, `npm test` from the repo root; data in `Server/.data`, uploads in `Server/uploads`.

**Not built yet**

- Everything in this plan: Vercel, Atlas, object storage, CI/CD, cron jobs, observability, backups, runbook.
