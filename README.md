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
> Tsumugi is in **pre-alpha, local MVP**. It runs on your own computer: a MongoDB database stored in this folder, an Express API, and the React app. Accounts, projects, tasks, requirements, files, and documents are saved for real. There is no email, no sign-in with other services, and no hosted deployment yet. See the [roadmap](#-roadmap).

## ✨ Features

### Working now (local MVP)

- **Real accounts** with email and password, saved on your computer. Each account has its own individual workspace.
- **Individual workspace** with five destinations: **Home**, **Projects**, **Tasks**, **Library**, and **Insights**, plus **Account** and **Help**.
- **Traceability** on every record: each item shows *Why it exists* and *What it becomes*, linking objectives → requirements → tasks → files → changes.
- **Projects** as cards or a timeline, with a project page split into Overview, Work, Specs, Files, and History.
- **Tasks** in Today, Upcoming, Calendar, and All views, with undo (`Ctrl/Cmd + Z`).
- **Quick add** (`Q`) with a small natural-language syntax, and a **command palette** (`Ctrl/Cmd + K`).
- **Library** of uploaded files, links, and Markdown documents with version history, comparison, and a built-in reader.
- **Requirements** with acceptance criteria that you tick off; a requirement can only be marked met when every criterion is.
- **Insights** showing progress, coverage, and what is overdue.
- **History** of every meaningful change, with before/after comparison for documents.
- **Repeating tasks** (daily, weekly, monthly, yearly): finish one and the next is scheduled for you.
- **Recently deleted** with restore for 30 days, **account tools** (devices, activity, download all your data as JSON, calendar export, delete account).
- **Landing page, sign-in and sign-up pages, and draft legal pages.** A no-account **sample workspace** is a permanent part of the product: open `/demo` (see below).
- **Light, dark, or follow-my-device** theme, restrained motion that respects `prefers-reduced-motion`, and keyboard-friendly navigation.

### Coming next

- ✉️ Email verification and password recovery (needs an email provider)
- ☁️ Deployment, cloud database, and object storage for files
- 👥 A separate **team workspace** (people, roles, sharing)
- 🔔 Notifications and recurring tasks

## 🚀 Getting started

**Requirements:** [Node.js](https://nodejs.org/) 20 or newer (current LTS) and npm. Nothing else: the database is built in.

```bash
git clone https://github.com/PastelSalt/tsumugi-webapp.git
cd tsumugi-webapp
npm run setup     # installs the server and the client
npm run dev       # starts the API (port 3001) and the app (port 5173)
```

Open **http://localhost:5173**, choose **Create account**, and start a project. To look around first, run `npm run seed` in another terminal and sign in as `demo@tsumugi.local` with the password `demo-password-1` (sample projects, tasks, requirements, documents, and history).

**Where your data lives**

| What | Where |
|---|---|
| Database | `Server/.data/` (a MongoDB that starts automatically; the first run downloads its engine once, then it works offline) |
| Uploaded files | `Server/uploads/` |
| Settings | Optional `Server/.env` (see `Server/.env.example`), for example `MONGODB_URI` to use a MongoDB you installed yourself |

Both folders are ignored by git. To start fresh, stop the app and delete them.

### Try the demo (no account)

Visitors who just want to see how Tsumugi works can open **`/demo`** (the landing page, the sign-in pages, and the 404 page all link to it). It shows a complete sample workspace on built-in sample data:

- Nothing is saved or sent, and nothing is stored in the browser. Changes (completing tasks, Quick add, a template project) last until you reload; actions that would write something real open a clearly labelled "Preview only" dialog.
- The address keeps a `?demo` marker while you move around, so a reload or a copied link stays in the demo.
- A "Demo" chip and a banner say so at all times, with links to create an account or leave. The sample date is fixed at 12 Nov 2026.
- The demo is **permanent**: it stays in production, and the mobile app keeps its own demo too ([PLAN-C-01 C1-27](docs/PLAN-C-01.md)).

### Scripts

| Command (from the repo root) | What it does |
|---|---|
| `npm run setup` | Install dependencies for `Server/` and `client/` |
| `npm run dev` | Start the API and the web app together |
| `npm run seed` | Create the demo account and sample data (the API can be running) |
| `npm test` | Run the server tests (39, using a temporary in-memory database) |
| `npm run check:integrity --prefix Server` | Check that stored links and records are consistent (`-- --fix` repairs dangling links) |
| `npm run lint` | Lint the client (`npm run lint --prefix Server` lints the server) |
| `npm run build` | Check the legal drafts, then build the client to `client/dist` |

Client-only commands (`dev`, `build`, `preview`, `lint`, `check:legal`) also work from `client/`.

### Try it out

| Key | Action |
|---|---|
| `Q` | Quick add a task, e.g. `Proof chapter one #garden fri !` |
| `Ctrl/Cmd + K` | Search or jump anywhere |
| `?` | Show all shortcuts |
| `Ctrl/Cmd + Z` | Undo a task change |

Add `?dev` to any URL for the developer-tools bar (designed states such as loading, empty, and error).

## 🗺️ Roadmap

| Phase | Focus | Status |
|---|---|---|
| **1. Frontend demo** | Landing, auth layouts, legal drafts, individual workspace | ✅ Done |
| **2. Backend foundation** | Express API, MongoDB models, validation | ✅ Done (local) |
| **3. Real accounts** | Registration, login, sessions (no email yet) | ✅ Done (local), 🔜 email recovery |
| **4. Persistence** | Projects, tasks, requirements, documents, history saved for real | ✅ Done (local) |
| **5. Files** | Uploads, links, Final files | ✅ Done (stored on this computer), 🔜 object storage |
| **6. Hardening and deploy** | Tests in CI, security review, Vercel, Atlas, managed storage | 🔜 Next |
| **7. Teams** | Team workspace, roles, sharing, notifications | ⬜ Later |

Each backend plan is marked done, partly done, or not started at its end (and in [section 16 of the master plan](docs/plan/backend/PLAN-B-00.md#16-implementation-status)). The full backend plan is in [`docs/plan/backend/`](docs/plan/backend/). Start with the master plan, [PLAN-B-00](docs/plan/backend/PLAN-B-00.md), which indexes one detailed plan per module (foundation, API conventions, data model, authentication, workspaces, projects, milestones, tasks, requirements, files, documents, traceability, insights, security, testing, deployment, and frontend integration).

## 🏗️ Architecture

**Today (local MVP)**

- **Frontend:** React 19, Vite, plain JavaScript/JSX, GSAP and Lenis for motion, Lucide icons, Fredoka typeface. A small history-API router (`client/src/app/router.js`) and lazy route chunks.
- **API:** Node.js, Express 5, Mongoose, Zod validation, under `/api/v1`. Cookie sessions (opaque, hashed tokens), strict request validation, one error format, and a tenant guard that scopes every query to the signed-in workspace.
- **Data:** MongoDB (local, stored in `Server/.data`), with links between records stored as validated edges; uploaded files on local disk.
- **Bridge:** the app loads the whole workspace as one snapshot (`GET /api/v1/workspace/snapshot`) and saves each change through the API (`client/src/pages/workspace/data/store.js`).

**Target** (see [PROJECT-SPECS.md](PROJECT-SPECS.md) and [PLAN-B-00](docs/plan/backend/PLAN-B-00.md))

- **Data:** MongoDB Atlas for records, external object storage for binary files.
- **Deployment:** Vercel for the frontend and an initial serverless API.
- **Hardening:** TypeScript, CI, Argon2id, persistent rate limits, email flows.

### Repository layout

```text
.
├── client/            React + Vite frontend
├── Server/            Express + MongoDB API (src/, test/, scripts/)
├── scripts/           Root helper scripts (npm run dev)
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
| [docs/PLAN-D-01.md](docs/PLAN-D-01.md) | Backend handoff for the Flutter/Android app (connection, auth, data shapes, per-screen endpoint map, gaps) |
| [docs/PLAN-C-01.md](docs/PLAN-C-01.md) | What still needs the owner: accounts, decisions, legal review, human checks |
| [docs/plan/backend/PLAN-B-00.md](docs/plan/backend/PLAN-B-00.md) | Backend master plan and index of the per-module plans (`PLAN-B-01` to `PLAN-B-19`) |
| [docs/testing/ux-walkthrough-checklist.md](docs/testing/ux-walkthrough-checklist.md) | Manual accessibility and UX checks |
| [client/README.md](client/README.md) | Client commands and conventions |
| [Server/README.md](Server/README.md) | API setup, endpoints, and conventions |
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
