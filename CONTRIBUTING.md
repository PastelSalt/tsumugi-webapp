# Contributing to Tsumugi

Thanks for your interest in Tsumugi, a Moeko Works project. This guide covers how to set up, what to check, and the documentation rules we follow.

## Setup

```bash
git clone https://github.com/PastelSalt/tsumugi-webapp.git
cd tsumugi-webapp
npm run setup   # installs Server/ and client/
npm run dev     # API on :3001 and the app on :5173; the database is built in
npm run seed    # optional demo account (demo@tsumugi.local / demo-password-1)
```

You need Node.js 20 or newer and npm. No separate database install is needed.

## Before you open a pull request

```bash
npm test        # server tests (in-memory database)
npm run lint    # client lint
npm run build   # client build (also checks the legal drafts)
```

All three must pass. Also look at the pages you changed in a browser, signed in and in the demo (`/home?demo`), at phone and desktop widths, and check that motion respects `prefers-reduced-motion`.

## Conventions

- Plain JavaScript and JSX; follow the style of the surrounding code.
- Visual language: Fredoka, warm paper canvas, flat colour (no gradients), pastel accents, Lucide icons, 12px minimum text, interactive targets of at least 24px.
- The individual workspace never shows team concepts (people, assignees, roles, access). A team workspace is a separate, future type.
- Keep changes small and focused, and preserve existing behaviour unless the change is the point.

## Documentation rules

Documentation is part of the change. See [INSTRUCTIONS.md](INSTRUCTIONS.md); in short, update these in the same pull request when they are affected:

- [`LOG.md`](LOG.md): what changed, which paths, and how it was validated.
- [`CODEMAP.md`](CODEMAP.md): structure, routes, responsibilities, data flow.
- [`README.md`](README.md): setup, scripts, status.

## Backend work

The backend lives in `Server/` (see [Server/README.md](Server/README.md)). Plans are in `docs/plan/backend/` as `PLAN-B-*` documents and each ends with an implementation status; update it when you build or change a module. Every endpoint needs a test that includes the "another user gets 404" case. Please discuss a design in an issue before large backend changes.

## Reporting issues

Open an issue with what you expected, what happened, and steps to reproduce. For anything security-sensitive, contact the maintainers privately rather than opening a public issue.
