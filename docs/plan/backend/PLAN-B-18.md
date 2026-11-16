# PLAN-B-18 — Teams and Collaboration (Future Design)

**Status:** Design only · **Phase:** Later (after v0.1) · **Depends on:** [05](PLAN-B-05.md), [12](PLAN-B-12.md), [14](PLAN-B-14.md) · **Master plan:** [PLAN-B-00](PLAN-B-00.md)
**Related:** [19 Notifications](PLAN-B-19.md) · [PROJECT-SPECS.md](../../../PROJECT-SPECS.md) sections 14 and 3.4 · [RESEARCH.md](../../../RESEARCH.md) section 8

> **Do not build any of this for v0.1.** This plan exists so that decisions made now (workspace scoping, `canAccess`, `404` on foreign records, stable ids) do not have to be undone later. Its only v0.1 deliverables are the **seams** listed in section 2.

## 1. Purpose and scope

A separate **team workspace** type for people working together: members, roles, invitations, assignment, comments, review/approval, and sharing. The individual workspace must remain exactly as simple as it is today ("the individual workspace never shows team concepts"). This plan describes the model, the migration path, and the rules so the work can be scheduled with confidence later.

**In scope (future):** workspace types and membership, roles and permissions, invitations, assignees, comments and mentions, review states, project-level sharing, read-only share links, audit, per-seat concerns.
**Out of scope:** real-time presence, chat, billing (a separate plan if monetized), SSO/SCIM.

## 2. Seams built into v0.1

These cost almost nothing now and make the future feasible:

1. Every record has `workspaceId` and every query is scoped by it (D-11).
2. `ctx` carries `role` (always `owner` in v1) and all authorization goes through `canAccess(ctx, record, action)` with `action ∈ read | write | delete | share` (PLAN-B-05 section 7).
3. `workspaces.type` exists (`individual`), and `workspaceIds[]` on users allows many workspaces.
4. Foreign records return `404`, so adding roles never changes error semantics.
5. Records store **who** performed events in Changes (`createdBy` on versions and changes), even though it is always the owner today.
6. IDs are ObjectIds and opaque; nothing encodes ownership.

## 3. Model (future)

| Collection | Purpose | Key fields |
| --- | --- | --- |
| `workspaces` (extended) | Adds `type: 'team'`, `name`, `settings` | `ownerId`, `plan` (reserved) |
| `memberships` | Who belongs to which workspace | `workspaceId`, `userId`, `role`, `status` (`invited|active|suspended`), `invitedBy`, `joinedAt` |
| `invitations` | Pending invites | `workspaceId`, `email`, `role`, `tokenHash`, `expiresAt`, `invitedBy` |
| `comments` | Discussion on records | `workspaceId`, `projectId`, `target { type, id }`, `authorId`, `body` (Markdown, ≤ 5,000), `parentId?`, `editedAt`, `resolvedAt` |
| `assignments` (or `assigneeId` fields) | Task responsibility | Initially a single `assigneeId` on tasks; multi-assignee is a later decision |
| `reviews` | Approval of documents/requirements | `target`, `requestedBy`, `reviewerId`, `status` (`requested|approved|changes_requested`), `at` |
| `share_links` | Read-only external sharing | `workspaceId`, `target`, `tokenHash`, `expiresAt`, `revokedAt`, `createdBy` |

Individual records gain optional fields (all unset in individual workspaces): `assigneeId`, `createdBy`.

## 4. Roles and permissions

| Role | Capabilities |
| --- | --- |
| **Owner** | Everything, including billing/plan, deleting the workspace, transferring ownership |
| **Admin** | Manage members and projects; cannot delete the workspace or change ownership |
| **Editor (Member)** | Create and edit records in projects they can access; comment; upload |
| **Reviewer** | Read, comment, approve/request changes on documents and requirements; no structural edits |
| **Viewer** | Read only; may comment if the workspace allows |

Permission matrix lives in one table (`permissions.ts`) mapping `(role, resourceType, action) → boolean`; `canAccess` reads it. **Project-level access** is a later refinement: workspace members see all projects by default; per-project membership/restriction is optional and modeled as `project.visibility: 'workspace' | 'restricted'` plus `projectMembers[]`.

## 5. Behavioral rules

1. **Individual stays individual.** An individual workspace cannot gain members. Conversion is an explicit, one-way **"Convert to team workspace"** action (owner-only, re-authenticate) that changes `type`, creates the owner membership, and leaves all data intact. The reverse is not offered (export instead).
2. **Invitations:** email-based, single-use token (hash stored), 7-day expiry, role chosen by inviter, resend and revoke; accepting requires an account (existing or new) and verified email matching the invite. The owner can cap members (plan).
3. **Assignment:** assignees must be active members with at least Editor on the project. Removing a member unassigns their tasks (recorded as Changes) and keeps their authored history (attribution preserved; display name resolved at read time, falling back to "Former member").
4. **Comments:** Markdown, never rendered server-side; edits keep `editedAt`; deleting a comment tombstones it if replies exist; mentions (`@name`) resolve to member ids and generate notifications (PLAN-B-19); comments are part of the audit and export.
5. **Review/approval:** a document `Final` flag can require an approved review when the workspace enables "review before final" (setting). Requirement `verified` can be restricted to Reviewer/Admin/Owner.
6. **Sharing:** read-only links to a single document or a project summary; unguessable tokens, expiry, revocation, no indexing (`noindex`, `X-Robots-Tag`), access logged; never expose comments or members; downloads of files only if the link was created with files included.
7. **Activity attribution:** Changes gain `actorId`; the History view shows "who" only in team workspaces (the individual UI never does).
8. **Notifications:** team events (assigned, mentioned, review requested) feed PLAN-B-19.

## 6. API surface (sketch)

`/workspaces/:id/members` (list, change role, remove), `/workspaces/:id/invitations` (create, list, revoke, resend), `/invitations/accept`, `/tasks/:id/assign`, `/comments` (CRUD by target), `/reviews` (request, respond), `/share-links` (create, list, revoke) and public `GET /s/:token` (read-only, rate-limited). The workspace switcher uses `GET /me` returning all `workspaceIds`; requests choose the workspace through a header `X-Workspace-Id`, validated against memberships (the context builder replaces the single default workspace).

## 7. Migration from individual to team

1. Add `memberships` with the owner for the converting workspace in a transaction.
2. Flip `workspaces.type` to `team`; no record changes needed (they already carry `workspaceId`).
3. Backfill `createdBy`/`actorId` on historical Changes with the owner id.
4. Enable invitation endpoints and team-only UI surfaces (people, assignees, roles, comments), behind the workspace `type`.
5. Verified by the existing authorization contract suite extended with role fixtures.

## 8. Security considerations

- The authorization contract suite grows a **role dimension** (every route × every role).
- Invitation and share tokens follow the same rules as reset tokens (hashed, short-lived, single-use or revocable, rate-limited).
- Enumeration of members or emails must not be possible through invitations (generic responses, rate limits).
- Mass-assignment protection for role fields (only the permission-checked endpoints can change roles).
- Data residency, retention, and the Privacy Policy need a controller/processor review once multiple people's data lives in one workspace.

## 9. Frontend implications

A workspace switcher, a People area (team workspaces only), assignee pickers, comment threads in the detail panel, role-aware disabled states, and sharing dialogs. Per the PLAN-A-04 decision, none of these appear in the individual workspace.

## 10. Implementation phases (when scheduled)

1. Memberships, roles, `canAccess` matrix, workspace context switching, contract suite with roles.
2. Invitations and conversion.
3. Assignment and attribution in History.
4. Comments and mentions (needs PLAN-B-19 notifications).
5. Reviews and approval rules.
6. Share links.

## 11. Acceptance criteria (when built)

1. All v0.1 authorization tests still pass unchanged for individual workspaces.
2. Every route × role combination is covered by the contract suite and behaves per the matrix.
3. Converting an individual workspace to a team preserves all records, links, and history.
4. Removing a member never deletes their historical contributions.

## 12. Open questions

- Pricing/limits and whether a seat model is needed (outside engineering scope).
- Project-level permissions in the first team release or later.
- Whether multi-assignee tasks are needed, or one assignee with watchers.
- Whether comments need rich attachments (default: Markdown text only).
