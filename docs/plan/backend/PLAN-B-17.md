# PLAN-B-17 — Frontend Integration and Fixture Migration

**Status:** Proposed · **Phase:** 3 → 7 (delivered module by module) · **Depends on:** [02](PLAN-B-02.md), then each module · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [04 Authentication](PLAN-B-04.md) · [08 Tasks](PLAN-B-08.md) · [13 Derived metrics](PLAN-B-13.md) · frontend [PLAN-A-03](../frontend/PLAN-A-03.md), [PLAN-A-04](../frontend/PLAN-A-04.md), [PLAN-A-05](../frontend/PLAN-A-05.md)

## 1. Purpose and scope

The frontend is a finished static demo running on in-memory fixtures. This plan describes how to connect it to the real API **without a redesign and without breaking the demo until each part is ready**: the API client, the data layer replacement, the auth lifecycle, loading and error states, optimistic updates and Undo, the preview-only dialogs, and the cut-over order.

**In scope:** client-side changes in `client/` needed to consume the backend; retiring `data/fixtures.js`, `data/store.js`, and `DEMO_TODAY`; the demo mode that remains for the public landing and docs.
**Out of scope:** visual changes (none planned), new features, mobile app.

## 2. Principles

1. **Same screens, real data.** Components keep their props and layouts; the data source changes underneath.
2. **One seam.** Components read through hooks in `client/src/pages/workspace/data/`; only those files know whether data is fixtures or API. The current selector functions become server-backed query hooks.
3. **Server owns numbers.** Client-side derived values (progress, health, coverage, overdue, today lists) are deleted in favor of API fields (PLAN-B-13). The golden tests prove parity first.
4. **Demo mode survives.** A clearly labelled **demo mode** (fixtures, nothing sent) stays available for the landing page's "Try the demo" path and for contributors working without a backend, selected by `VITE_DEMO_MODE=true` (and a `/demo` entry route). It is the existing code path, kept behind the same hooks.
5. **Cut over per module** with a feature flag, never all at once.

## 3. Client architecture changes

### 3.1 API client (`client/src/lib/api/`)

| File | Responsibility |
| --- | --- |
| `client.js` | `request(method, path, { query, body, idempotencyKey, ifMatch })`: base URL from `VITE_API_BASE` (default `/api/v1`), `credentials: 'include'`, JSON handling, CSRF header from the session store, envelope unwrapping, error normalization to `ApiError { status, code, message, details, requestId }`, abort support, `304` handling |
| `errors.js` | `ApiError` and helpers (`isAuthError`, `isConflict`, `fieldErrors(details)`) |
| `session.js` | Holds `{ user, workspace, csrfToken, status }`; `bootstrap()` calls `GET /auth/session`; broadcasts changes (`useSyncExternalStore`, matching the existing store style) |
| `endpoints/*.js` | Thin typed functions per module: `projects.list(params)`, `tasks.create(body)`, … (generated types help editors; see PLAN-B-02 section 10) |
| `schema.d.ts` | Types generated from `openapi.json` (editor assistance only) |

Rules: no third-party HTTP library required; `fetch` is enough. Retries: only idempotent `GET`s, with backoff, never on `4xx`. Timeouts: 15 seconds, then a calm "taking longer than usual" state (matches the product's plain wording).

### 3.2 Server-state layer

Adopt **TanStack Query** (named in the original specification) for caching, request de-duplication, background refresh, and mutation lifecycles. It replaces `useStoreVersion` subscriptions in the workspace.

- Query keys mirror resources: `['projects', params]`, `['task', id]`, `['home']`, …
- Mutations invalidate precisely (e.g. completing a task invalidates `tasks` views, `home`, the project summary, and `insights`).
- Defaults: `staleTime` 30 s for lists, 5 min for vocab/templates, `refetchOnWindowFocus` on (cheap and keeps multi-device use fresh), `retry: false` for mutations.
- The existing `data/selectors.js` API surface is preserved as **hooks with the same names** where practical (`useTodayList`, `useProject(id)`), so page components change minimally.

### 3.3 Routing and auth lifecycle

- App boot: `session.bootstrap()` runs before rendering protected routes; a short, calm loading state is shown (no spinner flash under 200 ms).
- **Route guards** (client-side convenience only; the server is the authority): unauthenticated users on workspace routes are redirected to `/login?next=<path>`; authenticated users on `/login`/`/register` go to `/home`. `next` is validated against an allow-list of internal paths (no open redirects).
- `401` anywhere → clear session, show "You were signed out" and redirect; unsaved Quick add text is kept in memory for the retry.
- `403 auth.email_unverified` → the verification banner state already designed in PLAN-A-03.
- Auth pages: remove the demo banner and the "Continue as demo user" shortcut when real auth is enabled (kept in demo mode); wire each state in PLAN-B-04 section 8. Fields are no longer ignored; passwords are read **only** from the form and sent to the API (never stored, never put in URLs).
- Token links (`/verify-email?token=…`, `/reset-password?token=…`): the page reads the token then `history.replaceState` to remove it from the address bar and referrer exposure; `Referrer-Policy: no-referrer` on those pages.
- Theme and text settings: continue to apply immediately from `localStorage` for no-flash rendering, then reconcile with `GET /me` after sign-in; the server value wins (PLAN-B-05 section 9). The cookie/local-storage policy's storage inventory is updated accordingly.

## 4. Replacing fixtures: module by module

| Order | Module (PLAN) | Client area | Notes |
| --- | --- | --- | --- |
| 1 | 02 + 04 + 05 | Auth pages, session, Account page, theme sync | First real vertical slice; remove demo banner when ready |
| 2 | 06 | Projects list, New project dialog, project page header, templates, archive/delete/Undo | `GET /templates` replaces `data/templates.js` |
| 3 | 07 + 08 | Tasks (all views), Home lists, milestones/Work, Quick add, calendar | Needs server "today" (PLAN-B-13); remove `DEMO_TODAY` here |
| 4 | 09 | Specs view, requirement detail, criteria | Keys `REQ-###` replace fixture ids |
| 5 | 10 + 11 | Library, upload UI (real progress), document reader/editor, versions | Preview/download via presigned URLs |
| 6 | 12 | History view, detail "Why it exists / What it becomes" | Replace in-fixture link arrays with `GET …/links` |
| 7 | 13 | Home figures, Insights, palette search | Delete client-side derived selectors |
| 8 | Cleanup | Remove fixtures/store/session-only banners from real mode | Keep demo mode (section 2.4) |

Each step: add endpoint functions and hooks, switch the module's hooks to the API behind `VITE_API_MODULES` flags (e.g. `projects,tasks`), run the golden parity checks and the UX checklist, then remove the fixture path for that module in real mode.

## 5. UX behaviors that change (and how)

| Demo behavior | Real behavior |
| --- | --- |
| "Preview only" dialog on write actions | Real action with the standard toast; dialogs removed in real mode (kept in demo mode) |
| Session-only additions with a label (`store.js`) | Normal persisted records; the label and "lost on reload" copy are removed from real mode |
| In-memory Undo (20 steps) | Optimistic update + inverse API calls (PLAN-B-08 section 8); if an inverse fails (record changed elsewhere), show the plain message "That changed elsewhere, so it couldn't be undone." and refresh |
| Instant everything | Loading skeletons using existing patterns; **optimistic updates** for task status/priority/due/subtasks/checkboxes with rollback and an error toast on failure; **no** optimistic updates for creates that need server ids (spinner in the button, then navigate) except Quick add which shows the row immediately with a pending marker |
| Fixed demo date | `today` from API (`GET /home`) used everywhere dates are compared; any remaining client date logic uses the user's zone from preferences |
| Fake IDs (`project-garden`, `t1`) in URLs and `?select=` | Real ids; project pages use `/projects/<slug>` (the API supports `by-slug`) with id fallback; old demo URLs only work in demo mode |
| Reset sample data under `?dev` | Dev tools call `npm run db:seed`-equivalent only in non-production via a dev-only endpoint, or are hidden in real mode |
| Empty states | New accounts start empty: the first-run checklist and templates (PLAN-A-04L) are the default experience; the server tracks checklist state |

## 6. Error, loading, and offline states

- **Field errors:** `details[].path` maps to form fields (title, due, password…); copy is the server's user-safe message.
- **Conflicts (`409`, `412`):** specific, calm messages per `code` (a code → message table in `client/src/lib/api/messages.js`); `412` offers "Reload" with the current record from `details.current`.
- **Rate limit (`429`):** show `Retry-After` in plain words.
- **Offline / `503`:** workspace banner "Can't reach Tsumugi. Your last view is shown. Changes will not be saved." Writes are disabled rather than queued in v0.1 (no offline sync; recorded as a non-goal).
- **Document editing:** local draft buffer in memory + `sessionStorage` (not `localStorage`) per the privacy inventory; warn on navigation with unsaved changes; `412` on save shows the conflict with a copy of the user's text.
- **Accessibility:** loading and error messages use the existing live-region patterns; focus handling after mutations follows PLAN-A-05 (focus returns to the invoking control or the next logical item).

## 7. Shared code

- **Vocabulary and limits:** the client reads `GET /vocab` once (cached) and drops duplicate constants where practical; `status.js` keeps icons/tones keyed by the server's values.
- **Quick add parser:** stays client-side (PLAN-B-08 section 7); it queries active projects via the cached projects query instead of fixtures. If a second client appears, extract `packages/quickadd` (npm workspaces) and test with shared fixtures.
- **Markdown renderer:** unchanged and the only renderer of document bodies.
- **Route helpers:** `recordHref` logic comes from `href` fields returned by search/links endpoints; local helpers remain for in-app navigation.

## 8. Performance

- Code-splitting already exists per route group; add per-route data prefetch on hover/focus for project pages and the library.
- Use `select` in queries to avoid re-rendering whole lists; keep payloads compact with `expand` parameters (PLAN-B-02 section 6).
- Respect `ETag`/`304` for `home`, `insights`, project summaries.
- Maintain the existing bundle budget (check `vite build` size in CI; fail on large regressions).

## 9. Testing the integration

1. **Golden parity:** a script loads the demo fixtures, runs the old selectors, seeds the backend with the same data, calls the new endpoints, and diffs the numbers (PLAN-B-15 section 6.3). Required before each cut-over.
2. **Component tests** (Vitest + Testing Library) for hooks and key components with `msw` handlers generated from the OpenAPI document.
3. **E2E journeys** (PLAN-B-15 section 10) against a preview deployment.
4. **Manual UX walkthrough** per `docs/testing/ux-walkthrough-checklist.md` with real data: keyboard, screen reader, zoom, motion, dark mode.
5. A **demo-mode regression test** ensures the landing/demo path still works with no backend.

## 10. Implementation tasks

- [ ] `lib/api` client, errors, session store, messages table (Phase 2).
- [ ] TanStack Query provider and conventions; hooks facade (Phase 2–3).
- [ ] Auth pages wired; route guards; verification/reset flows; theme sync (Phase 2).
- [ ] Projects, tasks, home, quick add, calendar, undo migration (Phase 3).
- [ ] Specs, library, documents, history, insights, palette migration (Phases 4–7).
- [ ] Demo mode flag and `/demo` path; remove demo banners in real mode.
- [ ] Update `docs/cookie-and-local-storage-policy.md` storage inventory and the user guide wording ("saved" instead of "preview"); keep `LOG.md`, `CODEMAP.md`, `README.md` current.
- [ ] Delete dead code after the last cut-over (fixtures only in demo mode).

## 11. Acceptance criteria

1. With `VITE_DEMO_MODE=false`, the app uses only the API: no fixture import is reachable from workspace routes (verified by a build-time check or lint rule).
2. A user can complete the first-run journey (register → template → task → complete) with no "preview only" dialogs.
3. Every number on Home and Insights comes from the API and matches the golden parity check.
4. A forced `401`, `412`, `429`, and network failure each produce the designed, accessible message without losing the user's typed text.
5. Demo mode still works offline for the public landing.

## 12. Open questions

- Whether to keep a public demo at all once real sign-up exists (default: yes, as a no-account tour).
- Whether to convert the client to TypeScript later to benefit from generated types (not required).
- Offline support or queued writes (not in v0.1).
