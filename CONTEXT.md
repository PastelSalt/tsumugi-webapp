# Tsumugi Continuation Context

> Portable handoff for continuing work on another device or with another agent.
>
> **Last updated:** 2026-11-16

## How to resume

The product now runs end to end **locally**: an Express + MongoDB API in `Server/` and the React app, with real accounts, saved projects, tasks, requirements, files, documents, and history. The no-account sample workspace remains at `/home?demo`. Start it with `npm run setup` then `npm run dev` (see README). Read this file, then [`CODEMAP.md`](CODEMAP.md) for the file index and the newest entries of [`LOG.md`](LOG.md) for what changed last. Nothing is committed unless the owner asks.

Rules that apply to all work:

- MVP scope decided 2026-11-16: strictly MERN, local database, individual accounts only, no email, no third-party sign-in or services, no deployment. Team accounts are a separate matter (PLAN-B-18).
- Signed in, everything saves through the API; the workspace is loaded as one snapshot into `data/store.js` (live mode). Task changes are optimistic with Undo (Ctrl/Cmd+Z, 20 steps). In demo mode (`/home?demo`) nothing is saved: write actions open a **Preview** dialog and Quick add/templates are session-only.
- The individual workspace never shows team concepts (people, assignees, roles, access). A team workspace is a future, separate type.
- Keep `LOG.md`, `CODEMAP.md`, and `README.md` current with every change ([`INSTRUCTIONS.md`](INSTRUCTIONS.md)).
- Visual language: Fredoka, warm paper canvas, flat colour (no gradients), ink outlines for selected elements, pastel accents, Lucide icons, 12px minimum text, targets of at least 24px, restrained motion that respects `prefers-reduced-motion`.
- Run `npm run lint` and `npm run build` from `client/` after client changes, and `npm test` from the repo root after server changes; check changed pages in a browser at phone and desktop widths.
- Backend plans (`docs/plan/backend/PLAN-B-*`) each end with an implementation status. Keep them current when you build or change a module.

## Product and repository

- Product: **Tsumugi**, a creative and technical production-management platform by Moeko Works. Repository: `PastelSalt/tsumugi-webapp` (imported from the original class activity repository; its history was not carried over). The project is now developed as a Moeko Works product and is planned to be open source.
- Stack: Vite, React 19, JavaScript/JSX, GSAP (landing, auth, legal, restrained workspace motion), Lenis (landing only), Lucide, Fredoka.
- Routing is a small history-API router in `client/src/app/router.js` and a route table in `client/src/App.jsx` (not React Router). API client and session: `client/src/lib/api.js`, `session.js`. Server layout: see `Server/README.md`.
- Client commands run from `client/`: `npm run dev`, `npm run lint`, `npm run build`, `npm run preview`, `npm run check:legal`.

## Routes

| Route | Page |
|---|---|
| `/` | Landing |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Demo-mode auth |
| `/privacy-policy`, `/terms-of-service`, `/cookie-and-local-storage-policy` | Draft legal pages from `docs/*.md` |
| `/home` | Workspace Home |
| `/projects`, `/projects/:projectId` | Projects (cards, Timeline) and the project page (Overview, Work, Specs, Files, History) |
| `/tasks` | Tasks (Today, Upcoming, Calendar, All) |
| `/library` | Library and document reader (`?doc=`) |
| `/insights` | Insights |
| `/account` | Account and preferences |
| `/help` | Help, rendered from `docs/individual-workspace-guide.md` |

Old workspace paths redirect: `/dashboard` to `/home`, `/milestones` to `/projects?view=timeline`, `/requirements` and `/revisions` to `/projects`, `/assets` and `/documentation` to `/library`, `/reports` to `/insights`, `/settings` to `/account`. Demo project IDs: `project-garden`, `tsumugi-api`, `color-and-memory`, `atlas-zine`, `sketchbook-sprint`, `field-notes-2025` (archived). Unknown project IDs show a "project not found" state.

## Where things are

- Workspace code: `client/src/pages/workspace/` (shell, provider, pages, components, `quickadd/`, `data/`). Sample data is `data/fixtures.js`; every derived number lives in `data/selectors.js`; the demo date is fixed at 2026-11-12 in `data/format.js`.
- Plans: `docs/plan/frontend/PLAN-A-01` to `PLAN-A-04L`, each with an implementation-status section, and `PLAN-A-05` (UX plan: everything that does not need a person is built (W1 to W9, W11, W12, W13 partly, W15, W16, W19); what is left needs people: the walkthroughs in `docs/testing/ux-walkthrough-checklist.md`, a real dark-mode device check, the user sessions (W17), the Home title test (W18), and W14 only if sessions show the Quick add syntax is missed).
- Research behind the workspace restructure: [`RESEARCH.md`](RESEARCH.md).
- User-facing guide (single source for the Help page): [`docs/individual-workspace-guide.md`](docs/individual-workspace-guide.md).

## Decisions on record

- The workspace is organised by what the person is doing: five destinations (Home, Projects, Tasks, Library, Insights), Account in the rail footer menu, Quick add and the command palette (`Q`, `Ctrl/Cmd+K`) always reachable. There is no page footer; legal links are in the account menu.
- Ten record types became seven: assets and documents merged into **File**, revisions became **Changes**, deliverables became a **Final file** flag.
- About 15 status labels in one small vocabulary (`data/status.js`).
- Developer scaffolding (preview states, reset sample data) is hidden behind `?dev`, the account menu, or Account.
- Calendar is a Tasks view, not a sixth destination.
- The workspace has a Light/Dark/Follow-my-device theme (default follows the device; landing and auth stay light). The web follows the mobile app's design tokens (`tsumugi-mobile/docs/REFERENCE-WEB-ALIGNMENT.md`). Degrees A and B are done (tokens, 3:1 control borders via `--control-border`, tone variables, reduced-motion swap, text scale); the opt-in dark palette exists but has no switch. Degree C is done for the safe items (colour only for exceptions, quiet buttons, no duplicate titles, Home headline, two-line task rows, project Overview order, Library list default). Open: grouped lists with counts and sticky headers, in-place actions with Undo, quick-add chips, settings that apply at once, the tip, workspace motion, and the theme switch (degrees D to F).

## Known gaps and next steps

- **Next backend steps** (see the master plan, section 16): email verification and password recovery (needs an email provider), deployment (Vercel, Atlas, object storage), TypeScript, CI, pagination, OpenAPI, the authorization contract test across all routes, and moving the UI's derived numbers to the server.
- The local database cannot do transactions (single `mongod`), so cascades are not atomic. Rate limits are in memory.
- Account deletion, data export, change of email, session list, and "Recently deleted" screens are not built.
- Not built from the workspace plans: Account view tabs, a task row menu, bulk actions.
- Not yet done: user testing against the success measures in PLAN-A-04 section 14, a screen-reader pass, reduced-motion review, and checks at 390 and 1536px.
- Legal pages are drafts (`LEGAL_STATUS = 'draft'`, `noindex`); `npm run check:legal` warns about unresolved placeholders. Update them if the real service stores anything new.
- Open product questions are in RESEARCH.md section 8 (one individual workspace per account or several, converting to a team later, read-only sharing and export).
