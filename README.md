<div align="center">

# 🧵 Tsumugi つむぎ

### Weaving ideas into finished work.

A creative and technical production-management platform, built by **Moeko Works**.

<p>
  <img alt="Status: pre-alpha" src="https://img.shields.io/badge/status-pre--alpha-f4a6c0?style=flat-square">
  <img alt="Frontend: React 19" src="https://img.shields.io/badge/react-19-61dafb?style=flat-square&logo=react&logoColor=white">
  <img alt="Bundler: Vite" src="https://img.shields.io/badge/vite-8-646cff?style=flat-square&logo=vite&logoColor=white">
  <img alt="Backend: planned" src="https://img.shields.io/badge/backend-planned-b8c0ff?style=flat-square">
  <img alt="License: MIT" src="https://img.shields.io/badge/license-MIT-a8e6cf?style=flat-square">
  <img alt="PRs welcome" src="https://img.shields.io/badge/PRs-welcome-a8e6cf?style=flat-square">
</p>

[Overview](#-what-is-tsumugi) ·
[Features](#-features) ·
[Getting started](#-getting-started) ·
[Roadmap](#-roadmap) ·
[Architecture](#-architecture) ·
[Documentation](#-documentation) ·
[Contributing](#-contributing)

</div>

---

## 🌸 What is Tsumugi?

*Tsumugi* (つむぎ) is spun silk: many loose threads drawn together into one cloth. That is the idea behind the product.

Most task managers answer one question: *what do I need to do?* Tsumugi also answers **why it exists** and **what it became**. It links objectives, requirements, milestones, tasks, files, and changes into one traceable production lifecycle, so you can follow any piece of work from the reason it started to the deliverable it produced.

It is built for people who make things, and for work that does not fit a single template:

| | |
|---|---|
| 💻 **Software** | Requirements → tasks → releases |
| ✍️ **Creative writing & visual novels** | Outline → chapters → revisions → final cut |
| 🎓 **Academic research** | Proposal → sources → analysis → publication |
| 🎬 **Multimedia** | Concept → assets → edits → delivery |
| 🌱 **Personal & mixed projects** | Whatever shape your work actually has |

> [!NOTE]
> Tsumugi is in **pre-alpha**. The frontend is a complete, click-through demo running on placeholder data, and the backend is the next thing being built. Nothing you type is saved yet. See the [roadmap](#-roadmap).

## ✨ Features

### Available in the current demo

- **Individual workspace** with five destinations: **Home**, **Projects**, **Tasks**, **Library**, and **Insights**, plus **Account** and **Help**.
- **Traceability** on every record: each item shows *Why it exists* and *What it becomes*, linking objectives → requirements → tasks → files → changes.
- **Projects** as cards or a timeline, with a project page split into Overview, Work, Specs, Files, and History.
- **Tasks** in Today, Upcoming, Calendar, and All views, with undo (`Ctrl/Cmd + Z`).
- **Quick add** (`Q`) with a small natural-language syntax, and a **command palette** (`Ctrl/Cmd + K`).
- **Library** of files and documents with a built-in reader.
- **Insights** showing progress, coverage, and what is overdue.
- **Landing page, demo-mode auth pages, and draft legal pages.**
- **Light, dark, or follow-my-device** theme, restrained motion that respects `prefers-reduced-motion`, and keyboard-friendly navigation.

### Coming next

- 🔐 Real authentication and sessions
- 🗄️ A persistent backend API and database
- 📎 File and asset storage
- 👥 A separate **team workspace** (people, roles, sharing)
- 🔔 Notifications and recurring tasks

## 🚀 Getting started

**Requirements:** [Node.js](https://nodejs.org/) (current LTS) and npm.

```bash
git clone https://github.com/PastelSalt/tsumugi-webapp.git
cd tsumugi-webapp/client
npm install
npm run dev
```

Then open the local address Vite prints (usually `http://localhost:5173`).

### Client scripts

Run these from `client/`.

| Command | What it does |
|---|---|
| `npm run dev` | Start the Vite development server |
| `npm run build` | Check legal drafts for unresolved placeholders, then build to `client/dist` |
| `npm run preview` | Preview the production build |
| `npm run lint` | Run ESLint |
| `npm run check:legal` | Run only the legal placeholder check |

### Try it out

| Key | Action |
|---|---|
| `Q` | Quick add a task, e.g. `Proof chapter one #garden fri !` |
| `Ctrl/Cmd + K` | Search or jump anywhere |
| `?` | Show all shortcuts |
| `Ctrl/Cmd + Z` | Undo a task change |

Add `?dev` to any URL for the developer-tools bar (preview states, reset sample data).

## 🗺️ Roadmap

| Phase | Focus | Status |
|---|---|---|
| **1. Frontend demo** | Landing, auth layouts, legal drafts, individual workspace | ✅ Done |
| **2. Backend foundation** | Express API, MongoDB models, validation, project structure by domain | 🔜 Next |
| **3. Real accounts** | Registration, login, sessions, password reset | ⬜ Planned |
| **4. Persistence** | Projects, tasks, requirements, changes saved for real | ⬜ Planned |
| **5. Files** | Object storage for assets and documents | ⬜ Planned |
| **6. Deploy** | Frontend and API on Vercel, managed database and storage | ⬜ Planned |
| **7. Teams** | Team workspace, roles, sharing, notifications | ⬜ Later |

Detailed backend plans will live in [`docs/plan/backend/`](docs/plan/backend/).

## 🏗️ Architecture

**Today**

- **Frontend:** React 19, Vite, plain JavaScript/JSX, GSAP and Lenis for motion, Lucide icons, Fredoka typeface.
- **Routing:** a small history-API router (`client/src/app/router.js`) with a route table in `client/src/App.jsx`; each route group is its own lazy chunk.
- **Data:** in-browser placeholder fixtures (`client/src/pages/workspace/data/`). Session-only additions are lost on reload by design.

**Target** (see [PROJECT-SPECS.md](PROJECT-SPECS.md))

- **Backend:** Node.js, Express, Mongoose, and schema validation, organized by business domain (auth, users, projects, milestones, tasks, requirements, assets, revisions, documentation, reports).
- **Data:** MongoDB Atlas for records, external object storage for binary files.
- **Deployment:** Vercel for the frontend and an initial serverless API.

### Repository layout

```text
.
├── client/            React + Vite frontend
├── Server/            Backend (package scaffold only, so far)
├── docs/              Legal drafts, user guide, plans, testing checklists
├── PROJECT-SPECS.md   Product specification and target architecture
├── RESEARCH.md        UX research behind the workspace design
├── CODEMAP.md         Index of the current source code
├── CONTEXT.md         Handoff notes for picking the work back up
├── INSTRUCTIONS.md    Documentation and development rules
└── LOG.md             Chronological change log
```

## 📚 Documentation

| Read this | To learn about |
|---|---|
| [PROJECT-SPECS.md](PROJECT-SPECS.md) | Product requirements and target architecture |
| [CODEMAP.md](CODEMAP.md) | What each file does and how data flows |
| [CONTEXT.md](CONTEXT.md) | Current state, decisions on record, known gaps |
| [RESEARCH.md](RESEARCH.md) | Why the workspace is structured the way it is |
| [docs/individual-workspace-guide.md](docs/individual-workspace-guide.md) | The user guide (also shown at `/help`) |
| [docs/plan/frontend/](docs/plan/frontend/) | Frontend plans (`PLAN-A-*`) with implementation status |
| [docs/testing/ux-walkthrough-checklist.md](docs/testing/ux-walkthrough-checklist.md) | Manual accessibility and UX checks |
| [client/README.md](client/README.md) | Client commands and conventions |
| [CONTRIBUTING.md](CONTRIBUTING.md) | How to contribute |
| [LOG.md](LOG.md) | Full history of changes |

> The Privacy Policy, Terms of Service, and Cookie & Local Storage Policy in [`docs/`](docs/) are **drafts** awaiting owner and legal review. They are not legal advice and are marked `noindex` in the app.

## 🤝 Contributing

Contributions, bug reports, and ideas are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) first; it covers setup, the checks to run, and the documentation rules this project follows.

## 💜 About Moeko Works

Tsumugi is released under the [MIT License](LICENSE) and made by **Moeko Works**, a small studio building gentle, well-crafted tools for makers. *Project Garden* is the product's working codename and appears in the demo's sample data.

---

<div align="center">

Made with care, one thread at a time. 🧵

</div>
