# PLAN-B-14 — Security and Privacy

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). The local-security basics are in place; the hosted-deployment items are not. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** 🟡 Partly done (MVP) · **Phase:** 1 → 7 (cross-cutting) · **Depends on:** all modules · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [01 Foundation](PLAN-B-01.md) · [04 Authentication](PLAN-B-04.md) · [05 Privacy duties](PLAN-B-05.md) · [10 Files](PLAN-B-10.md) · [16 Operations](PLAN-B-16.md) · legal drafts in `docs/`

## 1. Purpose and scope

The security requirements that apply to the whole backend (PROJECT-SPECS section 12), turned into concrete controls, owners, and checks. Module plans cite this plan instead of repeating it. It covers threat model, authorization, transport and headers, input handling, rate limiting, secrets, dependencies, logging, privacy, incident response, and the release security review.

## 2. Assets and threats

| Asset | Why it matters |
| --- | --- |
| Account credentials and sessions | Account takeover |
| Workspace content (projects, tasks, requirements, documents, change history) | Confidential creative and academic work |
| Uploaded files | May be unpublished or sensitive (interview transcripts, drafts) |
| Personal data (email, name, time zone) | Privacy law obligations |
| Infrastructure secrets | Full compromise |

STRIDE summary of the main threats and the controls that answer them:

| Threat | Examples | Controls (section) |
| --- | --- | --- |
| Spoofing | Credential stuffing, session theft, phishing resets | 4 (auth), 6 (rate limits), PLAN-B-04 |
| Tampering | Modifying another user's record by id, forged cross-site requests, tampered cursors | 3 (authorization), 5 (CSRF), PLAN-B-02 signed cursors |
| Repudiation | "I never deleted that" | Change history, audit log (PLAN-B-12, B-04 section 9) |
| Information disclosure | IDOR, verbose errors, logs with secrets, public buckets, account enumeration | 3, 7, 8, 9 |
| Denial of service | Login floods, huge uploads, expensive queries | 6, caps and limits in every module |
| Elevation of privilege | Bypassing archive/read-only, role seam misuse later | 3, PLAN-B-18 |

Out of scope: nation-state attackers, physical access, compromise of the hosting provider.

## 3. Authorization (backend is the only authority)

1. Every protected route runs `requireAuth` and uses `ctx` from the session; `workspaceId` is never read from client input (PLAN-B-05 section 2).
2. **Tenant guard** (PLAN-B-03 section 2.4) injects `workspaceId` into every read/write/aggregate; direct model access outside repositories is a lint error.
3. **Foreign or missing records return `404`**, never `403`, so ids cannot be probed. `403` is reserved for known-allowed-in-general actions (e.g. unverified email).
4. **Referenced ids** (`projectId`, `milestoneId`, `requirementIds`, `fileIds`, …) are validated against the workspace **and** the project; mismatches are `404`/`422` as defined per module.
5. **Mass assignment** is impossible: strict Zod schemas reject unknown or server-controlled fields.
6. **Archive/read-only** states are enforced in services, not the UI.
7. **Contract test:** an automated test walks every route in the OpenAPI document with two users and asserts that user B cannot read, update, delete, link to, or download any record of user A (PLAN-B-15 section 6). New routes cannot merge without being covered.
8. `canAccess(ctx, record, action)` is the single seam for future roles (PLAN-B-18).

## 4. Authentication and session controls

Detailed in PLAN-B-04. Summary of mandatory controls: Argon2id hashing with pepper; opaque random session tokens stored only as HMAC hashes; `__Host-` `HttpOnly; Secure; SameSite=Lax` cookie; rotation on privilege change; idle and absolute lifetimes; revocation lists via database lookup; lockout and throttling; anti-enumeration behavior; email verification before sensitive actions; re-authentication (password) for email change, account deletion, and "sign out everywhere".

## 5. Transport, headers, CORS, CSRF

| Control | Rule |
| --- | --- |
| HTTPS | Required in production; HSTS (`max-age=31536000; includeSubDomains`); `trust proxy` configured so secure cookies and IPs are correct |
| Same-site hosting | Client and API served from one registrable domain; cookies are first-party |
| CORS | Exact allow-list from `CLIENT_ORIGIN`; `credentials: true`; no wildcard; preflight cached 10 minutes |
| CSRF | Origin check + HMAC synchronizer token header + `SameSite=Lax` (PLAN-B-04 section 5.6) on every state-changing authenticated request |
| Headers | `helmet` defaults; `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'` for API responses (they are JSON); `X-Content-Type-Options: nosniff`; `Referrer-Policy: no-referrer`; `Cross-Origin-Resource-Policy: same-site`; `Cache-Control: no-store` on authenticated responses |
| Client CSP | The Vercel-served client sets its own strict CSP (script/style self, `img-src 'self' data: <storage origin>`, `connect-src 'self' <storage origin>`), recorded in PLAN-B-16 |
| Cookies in docs | The Cookie & Local Storage Policy lists the session cookie and the CSRF token; update it when the first cookie ships |

## 6. Rate limiting and abuse controls

Implemented as a MongoDB-backed fixed/sliding window (`rate_limits`, TTL) because serverless instances share no memory; the same interface can move to Redis/Upstash later. Limits are per IP **and** per identity where one exists. Numbers are starting values and live in `constants.ts`.

| Route group | Limit | Penalty |
| --- | --- | --- |
| `POST /auth/login` | 10 / 15 min per IP, 5 failures per account (lockout) | `429` / `423` |
| `POST /auth/register` | 5 / hour per IP | `429` |
| `POST /auth/forgot-password`, `resend-verification` | 3 / hour per email, 10 / hour per IP | `202` stays uniform; sending is skipped |
| `POST /auth/reset-password`, `verify-email` | 10 / 15 min per IP | `429` |
| Authenticated reads | 600 / 5 min per user | `429` |
| Authenticated writes | 240 / 5 min per user | `429` |
| `POST /files/upload-intents` | 60 / hour per user | `429` |
| `POST /me/export` | 1 / 24 h per user | `429` |
| Search | 60 / min per user | `429` |

All limited responses carry `Retry-After` and `RateLimit-*` headers. A CAPTCHA/Turnstile hook (off by default) can gate `register` and `forgot-password` if abuse appears; it must be privacy-conscious and documented in the cookie policy before enabling.

Additional abuse limits are structural: record caps per project, bounded arrays, payload limits, and pagination caps defined in each module plan.

## 7. Input handling

- **Validation** at the edge for every route (PLAN-B-02 section 4); strict schemas; length caps from `limits.ts`.
- **Injection:** all queries use Mongoose with typed filters. No string concatenation into queries; no `$where`; user-supplied keys never become operators (`$`-prefixed or dotted keys rejected by a sanitizing step and by strict schemas). Search strings are quoted for text search.
- **Stored text** (titles, notes, Markdown) is stored verbatim as data and **never rendered by the server**; the client renders it safely (escaped, no raw HTML). Control characters are stripped from single-line fields.
- **File uploads:** allow-list, size caps, server-side verification, magic-byte sniffing, SVG attachment-only, no inline HTML, private bucket (PLAN-B-10).
- **URLs** provided by users are stored as data; the server never fetches them (no SSRF in v0.1). Any future link-preview feature must run through an allow-listed fetcher with private-range blocking.
- **Path traversal:** storage keys are generated, never built from names.
- **Open redirects:** none; email links point only to `APP_URL`.
- **Prototype pollution/JSON bombs:** JSON body limit 1 MB, depth limit 20 via the parser reviver and schema bounds.
- **Regular expressions:** no user-controlled regex; reviewed for catastrophic backtracking.

## 8. Secrets and configuration

- All secrets in environment variables managed by Vercel (encrypted), never in the repository, build logs, or the client bundle. `.env.example` has placeholders only.
- Separate secrets per environment (development, preview, production) and per service (database user for the app has `readWrite` on its database only; the storage key can only access its bucket).
- Rotation procedure documented in PLAN-B-16 (rotate `AUTH_SECRET` by supporting a previous-key list for a grace period so sessions survive; rotate storage and database credentials with zero downtime where possible).
- Repository secret scanning (GitHub secret scanning and push protection) enabled; a pre-merge CI step runs `gitleaks`.
- Atlas network access: allow-list the Vercel egress approach recommended at deploy time (or use Atlas private networking); never `0.0.0.0/0` for production without compensating controls recorded in PLAN-B-16.

## 9. Logging, audit, and error exposure

- Structured logs with request ids; redaction list for `authorization`, `cookie`, `set-cookie`, `password*`, `token*`, `x-csrf-token`, presigned URLs (PLAN-B-01 section 8).
- `audit_log` records security-relevant events with truncated IPs (PLAN-B-04 section 9); retained 12 months (Q7).
- Errors return the standard envelope; **no stack traces, query details, collection names, or internal ids** reach the client in any environment except local development.
- Alerts (PLAN-B-16): spike in `401`/`429`, lockouts, `5xx` rate, upload failures, integrity check failures.

## 10. Privacy and compliance

- **Data minimization:** only the fields in PLAN-B-03; no third-party analytics or trackers in v0.1; any addition updates the Privacy Policy and Cookie policy first.
- **Rights:** access/portability via export, correction via editing, erasure via account deletion with a 14-day grace (PLAN-B-05 section 8). Procedures and response times are documented in the runbook.
- **Retention:** records and sessions until deleted; soft-deleted records 30 days; logs 30 days; audit 12 months; backups 35 days. These numbers are **defaults pending Q7** and must match the published policies.
- **Children:** the Terms/Privacy drafts decide minimum age; the registration endpoint requires `acceptTerms` and stores `termsVersion` and timestamp.
- **Processors:** keep a list in `docs/` (Vercel, MongoDB Atlas, object storage provider, email provider) for the Privacy Policy; ensure data processing terms and regions are chosen deliberately (Q-region in PLAN-B-16).
- The legal documents remain **drafts** until reviewed; `LEGAL_STATUS` and `npm run check:legal` already prevent publishing placeholders.

## 11. Dependency and supply-chain hygiene

- Lockfile committed; `npm ci` in CI; `npm audit --omit=dev` fails the build on high/critical.
- Dependabot weekly, grouped; security updates reviewed within 7 days (critical within 48 hours).
- Minimal dependencies (PLAN-B-01 section 9); no postinstall scripts from unfamiliar packages (`npm config ignore-scripts` in CI except the allow-listed Argon2 prebuilt).
- GitHub Actions pinned by commit SHA; least-privilege `GITHUB_TOKEN`; branch protection on `main` (required checks, no force push).
- Optional SBOM generation (`cyclonedx`) attached to releases.

## 12. Release security review checklist (Phase 7 gate)

- [ ] Authorization contract test covers 100% of routes.
- [ ] Every endpoint has a rate-limit decision (limited or explicitly exempt, with reason).
- [ ] Penetration-style manual pass: IDOR on every id parameter, CSRF without token, forged `Origin`, session fixation, replayed reset/verify tokens, upload of disallowed types and oversized files, malformed cursors, NoSQL operator injection in every body field and query parameter.
- [ ] Secrets scan clean; production secrets differ from preview.
- [ ] Headers verified on the deployed URL (Mozilla Observatory/securityheaders grade A).
- [ ] Cookies verified (`__Host-` prefix, flags) on the deployed domain.
- [ ] Bucket confirmed private; CORS restricted; lifecycle rules applied.
- [ ] Backup restore rehearsed (PLAN-B-16).
- [ ] Incident response contacts and steps written (section 13).
- [ ] Privacy and Cookie policies match what the system actually stores.

## 13. Incident response (minimum viable)

1. Detect (alerts, user report, security.txt contact).
2. Contain: revoke sessions (`sessions` collection wipe for affected users or all), rotate secrets, disable the affected route via a feature flag, or place the site in maintenance mode.
3. Assess: audit log and request logs by request id; determine data exposure.
4. Notify affected users and regulators as legally required (guidance placed in the runbook).
5. Fix, add a regression test, document in `LOG.md` without sensitive details.

Publish `/.well-known/security.txt` with a contact (to be added to `CONTRIBUTING.md` before the repository goes public).

## 14. Implementation tasks

- [ ] Security middleware stack and header tests (Phase 1).
- [ ] Mongo-backed rate limiter and per-route policy table (Phase 2).
- [ ] Sanitizer for `$`/dotted keys and JSON depth (Phase 1).
- [ ] Authorization contract test harness (Phase 1, extended each phase).
- [ ] Secret scanning, Dependabot, CI audit, pinned actions (Phase 1).
- [ ] Redaction tests; security logger; audit log service (Phase 2).
- [ ] Policy alignment pass with legal drafts at every phase end.
- [ ] Release checklist execution and report (Phase 7).

## 15. Acceptance criteria

1. The contract test proves cross-user access is impossible on every route.
2. Rate limits trigger as specified and survive across serverless instances.
3. No test, log, or response contains a secret, token, password, or stack trace.
4. The deployed site earns an A grade on a headers scan and sets only the documented cookies.
5. The security checklist in section 12 is completed and recorded in `LOG.md`.

## 16. Open questions

- Q7 retention values; legal basis wording; minimum age.
- Whether to add TOTP/passkeys before public launch (PLAN-B-04 section 14).
- Whether to use a managed WAF (Vercel Firewall) rules in addition to app-level limits.

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, built 2026-11-16 · The local-security basics are in place; the hosted-deployment items are not.

**Built**

- Hashed passwords and session tokens, `HttpOnly; SameSite=Lax` cookie, `Origin` check, lockout and in-memory rate limits.
- Strict validation, tenant guard with `404` for foreign records, no stack traces, upload allow-list and `nosniff`, user search text always escaped.
- Tests proving another user gets `404` on the main routes (`Server/test/work.test.js`).

**Not built yet**

- Full header set (helmet/HSTS/CSP), CSRF token, persistent rate limiter, audit log, secret scanning, dependency audit in CI, the all-routes authorization contract test, release security checklist.
