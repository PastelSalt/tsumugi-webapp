# PLAN-B-04 — Authentication and Sessions

> **Implementation status (2026-11-16):** 🟡 Partly done (MVP). Email-and-password accounts work locally without any email or third party. Email-based flows are intentionally not built. See [Implementation status](#implementation-status-mvp) at the end.

**Status:** 🟡 Partly done (MVP) · **Phase:** 2 · **Depends on:** [01](PLAN-B-01.md), [02](PLAN-B-02.md), [03](PLAN-B-03.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [05 Users and workspaces](PLAN-B-05.md) · [14 Security](PLAN-B-14.md) · frontend [PLAN-A-03](../frontend/PLAN-A-03.md) (the auth pages and their states)

## 1. Purpose and scope

Registration, email verification, login, logout, sessions, password recovery and change, account lockout, CSRF protection, and email delivery for these flows. The frontend pages and their states already exist in demo mode (PLAN-A-03); this module makes them real.

**In scope:** credential storage, session lifecycle, tokens, email templates, abuse controls, audit events.
**Out of scope:** profile and preferences (05), social sign-in (seam only; Q8), multi-factor authentication (listed as a future option in section 14).

## 2. Design decisions (from PLAN-B-00)

- **Server-side sessions in MongoDB with an opaque token in an HttpOnly cookie** (D-05). Matches the demo's recorded decision ("Use server-side sessions with secure cookies": simple revocation, no tokens in browser storage).
- **Argon2id** password hashing (D-06) with a per-user salt (built in) and a server-side **pepper** derived from `AUTH_SECRET` via HMAC before hashing.
- **Same-site deployment** (client and API on one registrable domain) so cookies are first-party and `SameSite=Lax` works (risk R2, Q1).

## 3. Data model

Owned collections: `sessions`, `email_tokens`, `audit_log` (fields in PLAN-B-03). Auth fields on `users` (`passwordHash`, `emailVerifiedAt`, `failedLogins`, `status`) are defined in PLAN-B-03 and written only by this module's service.

Token format: 32 random bytes (`crypto.randomBytes`) encoded base64url. Only `SHA-256(token)` (HMAC'd with `AUTH_SECRET`) is stored. A database leak therefore does not yield usable sessions or reset links.

## 4. Endpoints

All under `/api/v1/auth`. Public unless noted.

| Method and path | Purpose | Notes |
| --- | --- | --- |
| `POST /register` | Create account | Body: `email`, `password`, `displayName`, `acceptTerms: true`, `timeZone`. Creates user + workspace (PLAN-B-05), sends verification email, **signs the user in**. Returns `201`, or `409 auth.email_taken` (see section 4.1). |
| `POST /login` | Authenticate | Body: `email`, `password`. Sets session cookie, returns user summary + CSRF token. |
| `POST /logout` | End current session | Auth required; `204`; clears cookie. |
| `POST /logout-all` | Revoke every session | Auth required; keeps none (including current) unless `keepCurrent: true`. |
| `GET /session` | Who am I | Auth required; returns user summary, workspace summary, `csrfToken`, `emailVerified`, and `expiresAt`. Used by the client on load. |
| `POST /verify-email` | Confirm address | Body: `token`. Public; one-time. |
| `POST /resend-verification` | Resend email | Auth required; rate limited; always `202`. |
| `POST /forgot-password` | Start recovery | Body: `email`. **Always `202`** with the same body regardless of account existence. |
| `POST /reset-password` | Complete recovery | Body: `token`, `password`. Revokes all sessions, signs nobody in. |
| `POST /change-password` | Change while signed in | Auth required; body: `currentPassword`, `newPassword`; revokes other sessions. |
| `POST /change-email` | Start email change | Auth required; body: `newEmail`, `currentPassword`; sends confirmation to the **new** address, notice to the old. |
| `POST /confirm-email-change` | Finish change | Body: `token`. |
| `GET /sessions` | List my sessions | Auth required; returns label, created, last seen, approximate location label, `current` flag (never tokens). |
| `DELETE /sessions/:sessionId` | Revoke one session | Auth required; ownership checked. |

### 4.1 Anti-enumeration rules

- `login`: unknown email and wrong password return the **same** `401 auth.invalid_credentials` with the same timing (a dummy Argon2 verify is performed for unknown emails).
- `forgot-password`: same `202` response and similar timing whether or not the account exists.
- `register` with an existing email: returns `409 auth.email_taken`. This does leak existence, which is a conventional trade-off for usability on sign-up; mitigated by the rate limit, by `register` requiring the CAPTCHA seam when abuse is detected, and by making verification mandatory before anything is shared. (Alternative recorded for review: always return `202` and email the existing owner; rejected for v0.1 because the frontend sign-up states in PLAN-A-03 expect an immediate result.)

## 5. Business rules

### 5.1 Passwords

- Length 12–128; no composition rules (NIST guidance); reject passwords on a bundled list of the most common 10,000, and passwords equal to the email or display name.
- Optional k-anonymity check against Have I Been Pwned (`range` API), **fails open** on network error, behind a feature flag.
- Argon2id parameters: memory 19 MiB, iterations 2, parallelism 1 (OWASP minimum), configurable; `needsRehash` upgrades hashes at next login.
- Passwords never appear in logs, errors, or audit metadata.

### 5.2 Sessions

| Setting | Value |
| --- | --- |
| Idle timeout | 14 days sliding (extend `expiresAt` at most once per hour to avoid write storms) |
| Absolute lifetime | 60 days, then re-login |
| Cookie | `__Host-tsumugi_sid` (`Secure; HttpOnly; Path=/; SameSite=Lax`, no `Domain`) in production; plain `tsumugi_sid` in development |
| Rotation | New token on login, password change, and email verification; old token revoked |
| Concurrent sessions | Allowed; capped at 20 (oldest revoked) |
| Revocation | Immediate; `GET /session` reflects it; every request loads the session from the database |

### 5.3 Email verification

Token valid 24 hours, single use. Until verified the user can use the app but **cannot** export data, change email, or (future) share. A banner state exists in the frontend design (PLAN-A-03 states). Decision Q5 can tighten this.

### 5.4 Recovery

Token valid 30 minutes, single use; new request invalidates older tokens. Using a reset revokes **all** sessions and sends a "your password was changed" email. The reset page never reveals whether the token was ever valid beyond "expired or invalid".

### 5.5 Lockout and throttling

- Per-account: 5 consecutive failures → 15 minute lock (`423 auth.locked`, with `Retry-After`), doubling up to 24 hours; a successful login or completed reset clears it. Locking never reveals existence: unknown emails keep a shadow counter in `rate_limits`.
- Per-IP and per-email buckets on all auth routes (limits in PLAN-B-14 section 6).
- Login from a new device sends a notice email (optional, off in v0.1).

### 5.6 CSRF

Cookie sessions require CSRF defense on state-changing requests:

1. **Origin/Referer check:** `Origin` must equal an entry of `CLIENT_ORIGIN`; missing Origin on `POST|PATCH|DELETE` is rejected.
2. **Synchronizer token (double submit with HMAC):** `GET /session` and `POST /login` return `csrfToken = HMAC(sessionId, AUTH_SECRET)`; the client sends it as `X-CSRF-Token`. Compared in constant time.
3. `SameSite=Lax` as a third layer.

### 5.7 Account status

`pending` (unverified, allowed), `active`, `disabled` (login blocked), `deleting` (login blocked, shows recovery notice; PLAN-B-05 section 8).

## 6. Email

An `EmailService` interface (`send(template, to, data)`) with transports: `console` (dev: prints link, **only when `NODE_ENV=development`**), `resend` (production default), and an in-memory test transport. Templates are plain-text + minimal HTML, stored in `Server/src/modules/auth/emails/`, never include the password, and link to `APP_URL/verify-email?token=…` and `/reset-password?token=…` (matching the existing frontend routes). Tokens in URLs are acceptable here because they are single-use and short-lived; they are never logged, and the frontend removes them from the address bar after reading (`history.replaceState`) — recorded in PLAN-B-17.

Email set: verify, welcome, password reset, password changed, email-change confirm (new address), email-change notice (old address), account deletion scheduled, export ready (later).

## 7. Middleware

- `sessionLoader`: parses the cookie, hashes, finds an unexpired, unrevoked session, joins the user (status checks), attaches `req.auth = { userId, workspaceId, sessionId }`, extends the idle timeout (rate-limited), or leaves `req.auth` undefined.
- `requireAuth`: throws `401 unauthenticated` when absent.
- `requireVerified`: throws `403 auth.email_unverified` for gated actions.
- `requireCsrf`: described above; applied to all non-GET routes except `/auth/login`, `/auth/register`, `/auth/forgot-password`, `/auth/reset-password`, `/auth/verify-email` (these are protected by Origin check and rate limits instead because no session exists yet).

## 8. Frontend mapping (PLAN-A-03 states → API results)

| Frontend state | Trigger |
| --- | --- |
| Invalid credentials | `401 auth.invalid_credentials` |
| Locked | `423 auth.locked` + `Retry-After` |
| Unavailable | `503 unavailable` or network failure |
| Pending verification | `session.emailVerified === false` |
| Weak password / mismatch | `400 validation_failed` with `details[path=password]` |
| Reset link expired | `410 auth.token_expired` from `reset-password` |
| Success states | `200/202/204` as above |

## 9. Audit and security events

Written to `audit_log` and the security logger: registration, login success and failure (with reason code), lockout, logout-all, password change/reset, email change request/confirm, session revoke, verification. Entries hold a truncated IP (IPv4 /24, IPv6 /48), a short user-agent family, and **no secrets**. Users can read their own recent security events (`GET /auth/activity`, last 50) for the Account page.

## 10. Implementation tasks

- [ ] `AuthService` (register, login, logout, verify, reset, change); `SessionService`; `TokenService`; `PasswordService`; `EmailService` + templates; `AuditService`.
- [ ] Endpoints and Zod schemas in section 4, with OpenAPI.
- [ ] Middleware: session loader, requireAuth, requireVerified, CSRF.
- [ ] Lockout counters and rate-limit policies (shared with PLAN-B-14).
- [ ] Dummy-hash timing equalization and a timing test with tolerances.
- [ ] Common-password list file and loader.
- [ ] Session cleanup is automatic via TTL index; a periodic job trims over-cap sessions.
- [ ] Update `.env.example`, README setup, CODEMAP.

## 11. Testing

Unit: token generation/hash, password rules, lockout math, CSRF HMAC. Integration: full register → verify → login → session → logout flow; expired/used/replayed tokens; reset revokes sessions; lockout and unlock; two concurrent logins; revoking one session; cross-user session revocation returns `404`; CSRF failures; cookie flags in production mode. Security: no endpoint reveals account existence (response and timing compared), tokens absent from logs (log capture assertion).

## 12. Acceptance criteria

1. A new user can register, verify by email, log in, see sessions, and log out; every frontend state in PLAN-A-03 can be produced by a real response.
2. Database contents contain no plaintext passwords or usable session/reset tokens.
3. Five wrong passwords lock the account; a correct password afterwards still fails until the lock expires; the lock does not apply to other accounts.
4. After a password reset, previously issued sessions are rejected.
5. A cross-site `POST` without a valid `Origin` and CSRF token fails with `403`.
6. `login` for a nonexistent and an existing-but-wrong account are indistinguishable in body, status, and (within tolerance) timing.
7. Logs from the full test run contain no token, password, or full email.

## 13. Dependencies on other plans

PLAN-B-05 provides user/workspace creation called from `register`. PLAN-B-14 owns the rate-limit numbers and header policy. PLAN-B-16 owns provider credentials and DNS records (SPF, DKIM, DMARC). PLAN-B-17 updates the auth pages to remove the demo banner once endpoints are live.

## 14. Future options and open questions

- TOTP or passkeys (WebAuthn) as optional second factors; the `users` schema reserves `mfa` (not built).
- Social sign-in via an `identities` array (Q8).
- Q1 (single domain), Q2 (email provider), Q5 (verification gating) from PLAN-B-00.
- Whether to show approximate location in the session list (needs a geo-IP source; default: omit and show browser + OS only).

---

## Implementation status (MVP)

**🟡 Partly done (MVP)** · local MVP, built 2026-11-16 · Email-and-password accounts work locally without any email or third party. Email-based flows are intentionally not built.

**Built**

- Register, log in, log out, `GET /auth/session`, change password (signs out other devices) (`routes/auth.js`, `services/auth.js`).
- Passwords hashed with scrypt (12+ characters, common-password check); opaque session tokens stored only as SHA-256 hashes; `HttpOnly; SameSite=Lax` cookie with sliding 30-day expiry.
- Account lockout after 5 wrong passwords (15 minutes); the same error and work for unknown and wrong accounts (no account enumeration at login).
- Cross-site write protection by `Origin` check; in-memory rate limits on auth routes.
- Frontend login and register pages are wired (`client/src/pages/auth/AuthPage.jsx`, `lib/session.js`).

**Not built yet**

- Email verification, forgot/reset password, change email (need an email provider; deliberately out of scope for the local MVP).
- Sessions list and revoke, "sign out everywhere", CSRF token, audit log, Argon2id, `__Host-` cookie (needs HTTPS), persistent rate limits.

**Deviations and notes**

- **MVP decision:** no email. A forgotten password cannot be recovered yet; the recovery pages remain demo-only.
