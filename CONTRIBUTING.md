# Contributing to Tsumugi

Thanks for your interest in Tsumugi, a Moeko Works project. This guide covers how to set up, what to check, and the documentation rules we follow.

## Setup

```bash
git clone https://github.com/PastelSalt/tsumugi-webapp.git
cd tsumugi-webapp/client
npm install
npm run dev
```

You need Node.js (current LTS) and npm.

## Before you open a pull request

From `client/`:

```bash
npm run lint
npm run build
```

Both must pass. Also look at the pages you changed in a browser at phone and desktop widths, and check that motion respects `prefers-reduced-motion`.

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

The backend in `Server/` is not built yet. Plans go in `docs/plan/backend/` as `PLAN-B-*` documents; please discuss a design in an issue before large backend changes.

## Reporting issues

Open an issue with what you expected, what happened, and steps to reproduce. For anything security-sensitive, contact the maintainers privately rather than opening a public issue.
