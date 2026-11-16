# Tsumugi API (local MVP)

Express 5 + Mongoose + Zod, plain JavaScript (ESM). Everything runs on your computer. See the [backend master plan](../docs/plan/backend/PLAN-B-00.md) for the design and what is and is not built yet.

## Run it

From the repository root:

```bash
npm run setup   # once
npm run dev     # API on http://localhost:3001/api/v1 and the web app on http://localhost:5173
npm run seed    # optional demo account: demo@tsumugi.local / demo-password-1
npm test        # server tests
```

From `Server/` alone: `npm run dev`, `npm run seed`, `npm test`.

**Database.** With no `MONGODB_URI`, the server uses a MongoDB stored in `Server/.data/db` on port 27018. The first run downloads the MongoDB engine once (through `mongodb-memory-server`); after that it works offline. If a database is already running on that port (for example the API is running and you start `npm run seed`), other processes join it. Set `MONGODB_URI` (see `.env.example`) to use a MongoDB you installed yourself.

**Files.** Uploaded files go to `Server/uploads/<workspace id>/` under random names. Both `.data` and `uploads` are git-ignored.

## Layout

```text
src/
├── app.js           createApp(): middleware, routers, error handler
├── server.js        local entry: connect, purge old deleted projects, listen
├── config.js        environment and limits
├── db.js            connect to MONGODB_URI or the local persistent database
├── errors.js        AppError and helpers (one error envelope)
├── http.js          validate(), response helpers, shared Zod pieces
├── middleware.js    session loader, requireAuth, Origin check, rate limit
├── models.js        all Mongoose schemas
├── lib/             dates (time zones), passwords and tokens, serialization, templates
├── services/        business rules: auth, projects, milestones, tasks, requirements,
│                    library (files + documents), links, changes, insights, shape
└── routes/          auth.js, work.js (projects, milestones, tasks, requirements, home,
                     insights, search, snapshot), library.js (files, documents, changes)
scripts/seed.js      demo data from the frontend fixtures
test/                Vitest + Supertest against an in-memory MongoDB
```

## Conventions

- Base path `/api/v1`. Success: `{ "data": … }`. Failure: `{ "error": { "code", "message", "details?" } }`. Clients branch on `code`.
- Every request body, query, and path parameter is validated with Zod; unknown fields are rejected.
- Authentication is a session cookie (`tsumugi_sid`, `HttpOnly`, `SameSite=Lax`). Only a hash of the token is stored. Write requests from another origin are rejected.
- Every query is scoped to the signed-in workspace. Another user's record is always `404`, never `403`.
- Dates are `YYYY-MM-DD` strings in the person's time zone; "today" is computed on the server.
- Deleting is soft (`deletedAt`) and can be undone for projects and tasks. A project delete cascades and restores exactly.

## Endpoints

All except `health` and the auth routes need a session.

| Area | Endpoints |
|---|---|
| Health | `GET /health` |
| Account | `POST /auth/register`, `POST /auth/login`, `POST /auth/logout`, `GET /auth/session`, `POST /auth/change-password`, `GET /me`, `PATCH /me` |
| Whole workspace | `GET /workspace/snapshot`, `GET /home`, `GET /insights`, `GET /search?q=`, `GET /templates` |
| Projects | `GET/POST /projects`, `GET/PATCH/DELETE /projects/:id`, `POST /projects/:id/open`, `POST /projects/:id/restore`, `GET /projects/deleted` |
| Milestones | `GET/POST /milestones`, `PATCH/DELETE /milestones/:id` |
| Tasks | `GET/POST /tasks`, `GET/PATCH/DELETE /tasks/:id`, `POST /tasks/:id/restore` |
| Requirements | `GET/POST /requirements`, `GET/PATCH/DELETE /requirements/:id` |
| Library | `GET /library`, `POST /files` (multipart), `POST /files/links`, `PATCH/DELETE /files/:id`, `GET /files/:id/download` |
| Documents | `POST /documents`, `GET/PATCH/DELETE /documents/:id`, `POST …/finalize`, `POST …/unfinalize`, `GET …/versions`, `GET …/versions/:n`, `POST …/versions/:n/restore`, `GET …/diff?from=&to=`, `GET …/export` |
| History | `GET /changes`, `PATCH /changes/:id` (reviewed) |

## Rules worth knowing

- A requirement can be `Met` only when every acceptance criterion is met; unticking a criterion reopens it; `verified` needs `Met`.
- Links (task ↔ requirement, file ↔ requirement, file ↔ task) must stay inside one project and one workspace.
- Documents keep every saved version. A save needs the `baseVersion` it was edited from, so stale saves are refused with `412`. A Final document cannot be edited until it is moved back to draft.
- Archived projects are read-only (`409 project.archived`).
- Upload types are allow-listed (documents, images, audio/video, data files) up to 100 MB; links must be `http`/`https`.

## Not built yet

Email (verification and password recovery), object storage, pagination, OpenAPI, TypeScript, CI, deployment. Each is tracked at the end of its plan in `docs/plan/backend/`.
