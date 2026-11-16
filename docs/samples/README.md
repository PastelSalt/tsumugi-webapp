# API response samples

Captured from the running API (`npm run seed` demo account, 2026-11-16) so other clients, for example the Flutter app in `../../../tsumugi-mobile`, can write tests against **real response shapes** without running the server.

| File | Endpoint | Notes |
|---|---|---|
| `api-snapshot.demo.json` | `GET /api/v1/workspace/snapshot` | 6 projects, 9 milestones, 15 tasks, 9 requirements, 18 library items, 10 changes (the seed has 9; one more came from testing). Ids are real ObjectId strings and differ in every database |
| `api-templates.json` | `GET /api/v1/templates` | Project templates (the snapshot does not include them) |
| `api-user.json` | `GET /api/v1/auth/session` | The signed-in user and preferences |
| `api-home.demo.json` | `GET /api/v1/home` | Shape only; numbers are not the pristine seed |

These are samples, not fixtures: regenerate them when the API shape changes (see [PLAN-D-01](../PLAN-D-01.md) section 20). They contain demo data only.
