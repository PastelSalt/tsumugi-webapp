# Tsumugi client (Moeko Works)

React 19 + Vite frontend for Tsumugi. See the [repository README](../README.md) for the product overview and [CODEMAP.md](../CODEMAP.md) for the file index.

## Commands

Run from this `client/` directory.

```powershell
npm install
npm run dev          # Vite dev server
npm run lint         # ESLint
npm run build        # runs the legal placeholder check, then builds to dist/
npm run check:legal  # placeholder check only
npm run preview      # preview the production build
```

## What is here

- Landing, sign-in and sign-up, draft legal pages, the individual workspace (Home, Projects, Tasks, Library, Insights, Account, Help), and the **no-account demo** of that workspace at `/demo` (sample data in `pages/workspace/data/fixtures.js`; a permanent feature, not a development aid).
- Signed in, the workspace runs on the API (see `../Server/README.md`). The demo at `/demo` runs on built-in placeholder data: nothing is saved, nothing is sent, and nothing is stored in the browser.
- Routes are handled by a small history-API router (`src/app/router.js`) and a route table in `src/App.jsx`; each route group is its own lazy chunk.

## Conventions

- Plain JavaScript and JSX, flat colour, Fredoka, Lucide icons, 12px minimum text.
- Motion uses GSAP (and Lenis on the landing page only) and respects `prefers-reduced-motion`.
- The Help page and the legal pages render Markdown from `../docs/` using `?raw` imports and `src/lib/markdown.jsx`.
- Plans live in `../docs/plan/frontend/`.
