import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { nextDue } from '../src/lib/recurrence.js'
import { contentMatches } from '../src/services/sniff.js'
import { app, clearDb, makeProject, signUp, startDb, stopDb } from './helpers.js'

beforeAll(startDb, 180_000)
afterAll(stopDb)
beforeEach(clearDb)

const api = '/api/v1'
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])

describe('recently deleted', () => {
  it('lists deleted records and restores each kind, with their links', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    const task = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })).body.data
    const ms = (await a.post(`${api}/milestones`).send({ projectId: p.id, title: 'M', start: '2026-01-01', due: '2026-02-01' })).body.data
    const doc = (await a.post(`${api}/documents`).send({ projectId: p.id, title: 'D', body: 'x' })).body.data
    const file = (await a.post(`${api}/files`).field('projectId', p.id).attach('file', Buffer.from('hi'), 'n.txt')).body.data
    await a.delete(`${api}/tasks/${task.id}`); await a.delete(`${api}/milestones/${ms.id}`); await a.delete(`${api}/documents/${doc.id}`); await a.delete(`${api}/files/${file.id}`)
    const trash = (await a.get(`${api}/trash`)).body.data
    expect(trash.map((t) => t.type).sort()).toEqual(['document', 'file', 'milestone', 'task'])
    for (const t of trash) expect((await a.post(`${api}/trash/${t.type}/${t.id}/restore`)).status).toBe(200)
    expect((await a.get(`${api}/trash`)).body.data).toEqual([])
    expect((await a.get(`${api}/requirements/${req.id}`)).body.data.taskIds).toEqual([task.id]) // the link came back too
  })

  it('refuses to restore a child while its project is deleted or archived, and restores projects', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'Zine', templateKind: 'software' })
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T' })).body.data
    await a.delete(`${api}/tasks/${t.id}`)
    await a.patch(`${api}/projects/${p.id}`).send({ archived: true })
    expect((await a.post(`${api}/trash/task/${t.id}/restore`)).status).toBe(409)
    await a.patch(`${api}/projects/${p.id}`).send({ archived: false })
    await a.delete(`${api}/projects/${p.id}`)
    const trash = (await a.get(`${api}/trash`)).body.data
    expect(trash).toHaveLength(1) // only the project; its children come back with it
    expect(trash[0].type).toBe('project')
    expect((await a.post(`${api}/trash/project/${p.id}/restore`)).status).toBe(200)
    expect((await a.get(`${api}/trash`)).body.data.map((x) => x.type)).toEqual(['task'])
  })

  it('does not show or restore another user’s deleted records', async () => {
    const a = await signUp('a@example.com'); const b = await signUp('b@example.com')
    const p = await makeProject(a)
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T' })).body.data
    await a.delete(`${api}/tasks/${t.id}`)
    expect((await b.get(`${api}/trash`)).body.data).toEqual([])
    expect((await b.post(`${api}/trash/task/${t.id}/restore`)).status).toBe(404)
  })
})

describe('account', () => {
  it('exports everything as JSON without secrets, lists and revokes sessions, and records activity', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T' })
    const exp = await a.get(`${api}/me/export`)
    expect(exp.status).toBe(200)
    expect(exp.headers['content-disposition']).toMatch(/attachment/)
    const data = JSON.parse(exp.text)
    expect(data.format).toBe('tsumugi-export-v1')
    expect(data.tasks).toHaveLength(1)
    expect(exp.text).not.toMatch(/passwordHash|tokenHash/)
    const other = request.agent(app)
    await other.post(`${api}/auth/login`).send({ email: 'ada@example.com', password: 'correct horse battery' })
    const sessions = (await a.get(`${api}/auth/sessions`)).body.data
    expect(sessions).toHaveLength(2)
    expect(sessions.filter((s) => s.current)).toHaveLength(1)
    const mine = sessions.find((s) => !s.current)
    expect((await a.delete(`${api}/auth/sessions/${mine.id}`)).status).toBe(204)
    expect((await other.get(`${api}/me`)).status).toBe(401)
    const events = (await a.get(`${api}/auth/activity`)).body.data.map((e) => e.event)
    expect(events).toEqual(expect.arrayContaining(['register', 'login', 'export', 'session_revoked']))
  })

  it('signs out everywhere, renames the workspace, and deletes the account with all its data', async () => {
    const a = await signUp('a@example.com'); const b = await signUp('b@example.com')
    const pa = await makeProject(a); const pb = await makeProject(b)
    await a.post(`${api}/requirements`).send({ projectId: pa.id, title: 'R' })
    await b.post(`${api}/requirements`).send({ projectId: pb.id, title: 'R' })
    await a.post(`${api}/files`).field('projectId', pa.id).attach('file', Buffer.from('hi'), 'n.txt')
    expect((await a.patch(`${api}/workspace`).send({ name: 'Ada’s studio' })).body.data.name).toBe('Ada’s studio')
    expect((await a.post(`${api}/me/delete`).send({ password: 'wrong wrong wrong', confirm: 'DELETE' })).status).toBe(401)
    expect((await a.post(`${api}/me/delete`).send({ password: 'correct horse battery', confirm: 'nope' })).status).toBe(400)
    expect((await a.post(`${api}/me/delete`).send({ password: 'correct horse battery', confirm: 'DELETE' })).status).toBe(204)
    expect((await a.get(`${api}/me`)).status).toBe(401)
    expect((await request(app).post(`${api}/auth/login`).send({ email: 'a@example.com', password: 'correct horse battery' })).status).toBe(401)
    const snap = (await b.get(`${api}/workspace/snapshot`)).body.data
    expect(snap.projects).toHaveLength(1) // the other account is untouched
    expect((await b.post(`${api}/requirements`).send({ projectId: pb.id, title: 'R2' })).body.data.key).toBe('REQ-002')
    expect((await b.post(`${api}/auth/logout-all`).send({})).status).toBe(204)
    expect((await b.get(`${api}/me`)).status).toBe(401)
  })
})

describe('lookups and summaries', () => {
  it('finds projects by slug, lists recents, and summarizes progress, coverage, and the timeline', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'My Novel', templateKind: 'creative' })
    expect((await a.get(`${api}/projects/by-slug/my-novel`)).body.data.id).toBe(p.id)
    expect((await a.get(`${api}/projects/by-slug/nope`)).status).toBe(404)
    expect((await a.get(`${api}/projects/recent`)).body.data[0].id).toBe(p.id)
    const sum = (await a.get(`${api}/projects/${p.id}/summary`)).body.data
    expect(sum.counts).toMatchObject({ tasks: 3, milestones: 1 })
    expect(sum.progress).toMatchObject({ done: 0, total: 3, pct: 0 })
    const tl = (await a.get(`${api}/projects/${p.id}/timeline`)).body.data
    expect(tl.milestones[0]).toMatchObject({ state: expect.any(String), progress: { done: 0, total: 3 } })
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    expect((await a.get(`${api}/requirements/by-key/${p.id}/req-001`)).body.data.id).toBe(req.id)
    const cov = (await a.get(`${api}/projects/${p.id}/coverage`)).body.data
    expect(cov.gaps.map((g) => g.code)).toEqual(expect.arrayContaining(['requirement_has_no_task', 'requirement_has_no_final_file', 'project_has_no_objective']))
    expect((await a.get(`${api}/vocab`)).body.data.workStatus).toEqual(['To do', 'Doing', 'Done'])
    expect((await a.get(`${api}/metrics/definitions`)).body.data.length).toBeGreaterThan(3)
  })

  it('traces why a task exists and what a requirement became', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    const task = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })).body.data
    const t = (await a.get(`${api}/records/task/${task.id}/trace`)).body.data
    expect(t.why.map((n) => n.type)).toEqual(['Requirement', 'Project'])
    const r = (await a.get(`${api}/records/requirement/${req.id}/trace`)).body.data
    expect(r.becomes.some((n) => n.type === 'Task' && n.id === task.id)).toBe(true)
    expect(r.gaps.map((g) => g.code)).toEqual(['requirement_has_no_final_file'])
    expect((await a.get(`${api}/records/task/${req.id}/trace`)).status).toBe(404)
  })

  it('exports a calendar and reports storage use', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Send, the; draft', due: '2026-12-01' })
    const ics = await a.get(`${api}/calendar.ics`)
    expect(ics.headers['content-type']).toMatch(/text\/calendar/)
    expect(ics.text).toContain('SUMMARY:Send\\, the\\; draft')
    expect(ics.text).toContain('DTSTART;VALUE=DATE:20261201')
    await a.post(`${api}/files`).field('projectId', p.id).attach('file', Buffer.from('hello'), 'a.txt')
    expect((await a.get(`${api}/files/usage`)).body.data).toMatchObject({ usedBytes: 5, fileCount: 1 })
  })
})

describe('bulk and move', () => {
  it('applies bulk actions all-or-nothing and validates values', async () => {
    const a = await signUp(); const b = await signUp('b@example.com')
    const p = await makeProject(a)
    const t1 = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: '1' })).body.data
    const t2 = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: '2' })).body.data
    const foreign = (await b.post(`${api}/projects`).send({ name: 'B' })).body.data
    const tb = (await b.post(`${api}/tasks`).send({ projectId: foreign.id, title: 'b' })).body.data
    expect((await a.post(`${api}/tasks/bulk`).send({ ids: [t1.id, tb.id], action: 'complete' })).status).toBe(404)
    expect((await a.get(`${api}/tasks/${t1.id}`)).body.data.status).toBe('To do') // nothing changed
    expect((await a.post(`${api}/tasks/bulk`).send({ ids: [t1.id, t2.id], action: 'priority', value: 'urgent' })).status).toBe(400)
    expect((await a.post(`${api}/tasks/bulk`).send({ ids: [t1.id, t2.id], action: 'complete' })).status).toBe(200)
    expect((await a.get(`${api}/tasks?status=Done`)).body.data).toHaveLength(2)
    expect((await a.post(`${api}/tasks/bulk`).send({ ids: [t1.id, t2.id], action: 'delete' })).status).toBe(200)
    expect((await a.get(`${api}/tasks`)).body.data).toHaveLength(0)
  })

  it('moves tasks, files, and documents between projects and clears old links', async () => {
    const a = await signUp()
    const p1 = await makeProject(a, { name: 'One', templateKind: 'blank' }); const p2 = await makeProject(a, { name: 'Two', templateKind: 'blank' })
    const req = (await a.post(`${api}/requirements`).send({ projectId: p1.id, title: 'R' })).body.data
    const t = (await a.post(`${api}/tasks`).send({ projectId: p1.id, title: 'T', requirementIds: [req.id] })).body.data
    const moved = (await a.post(`${api}/tasks/${t.id}/move`).send({ projectId: p2.id })).body.data
    expect(moved).toMatchObject({ projectId: p2.id, requirementIds: [] })
    expect((await a.post(`${api}/tasks/${t.id}/move`).send({ projectId: p2.id })).status).toBe(422)
    const doc = (await a.post(`${api}/documents`).send({ projectId: p1.id, title: 'D', body: 'x' })).body.data
    expect((await a.post(`${api}/documents/${doc.id}/move`).send({ projectId: p2.id })).body.data.projectId).toBe(p2.id)
    const f = (await a.post(`${api}/files`).field('projectId', p1.id).attach('file', Buffer.from('hi'), 'n.txt')).body.data
    expect((await a.post(`${api}/files/${f.id}/move`).send({ projectId: p2.id })).body.data.projectId).toBe(p2.id)
  })
})

describe('pagination', () => {
  it('walks tasks and changes in stable pages with signed cursors', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    for (let i = 1; i <= 7; i += 1) await a.post(`${api}/tasks`).send({ projectId: p.id, title: `Task ${i}` })
    const seen = []
    let cursor
    let pages = 0
    do {
      const res = await a.get(`${api}/page/tasks`).query({ limit: 3, ...(cursor && { cursor }) })
      seen.push(...res.body.data.map((t) => t.title))
      cursor = res.body.meta.nextCursor
      pages += 1
    } while (cursor)
    expect(pages).toBe(3)
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `Task ${i + 1}`))
    expect((await a.get(`${api}/page/tasks`).query({ limit: 3, cursor: 'garbage.garbage' })).status).toBe(400)
    const first = await a.get(`${api}/page/changes`).query({ limit: 4 })
    const second = await a.get(`${api}/page/changes`).query({ limit: 4, cursor: first.body.meta.nextCursor })
    const ids = [...first.body.data, ...second.body.data].map((c) => c.id)
    expect(new Set(ids).size).toBe(ids.length) // no repeats across pages
  })
})

describe('recurring tasks', () => {
  it('computes the next date, clamping month ends', () => {
    expect(nextDue('2026-11-16', { freq: 'daily', interval: 3 })).toBe('2026-11-19')
    expect(nextDue('2026-11-16', { freq: 'weekly', interval: 1 })).toBe('2026-11-23')
    expect(nextDue('2026-01-31', { freq: 'monthly', interval: 1 })).toBe('2026-02-28')
    expect(nextDue('2028-01-31', { freq: 'monthly', interval: 1 })).toBe('2028-02-29')
    expect(nextDue('2026-11-30', { freq: 'monthly', interval: 3 })).toBe('2027-02-28')
    expect(nextDue('2028-02-29', { freq: 'yearly', interval: 1 })).toBe('2029-02-28')
  })

  it('creates the next occurrence when a repeating task is finished', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Weekly review', due: '2099-01-05', recurrence: { freq: 'weekly' }, subtasks: [{ text: 'a', done: false }], requirementIds: [req.id] })).body.data
    await a.patch(`${api}/tasks/${t.id}`).send({ status: 'Done' })
    const all = (await a.get(`${api}/tasks`)).body.data
    expect(all).toHaveLength(2)
    const next = all.find((x) => x.status === 'To do')
    expect(next).toMatchObject({ title: 'Weekly review', due: '2099-01-12', recurrence: { freq: 'weekly', interval: 1 }, requirementIds: [req.id] })
    await a.patch(`${api}/tasks/${t.id}`).send({ status: 'To do' })
    await a.patch(`${api}/tasks/${t.id}`).send({ status: 'Done' })
    expect((await a.get(`${api}/tasks`)).body.data.length).toBe(3) // finishing again continues the series
    const late = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Old', due: '2020-01-01', recurrence: { freq: 'daily' } })).body.data
    await a.patch(`${api}/tasks/${late.id}`).send({ status: 'Done' })
    const nextLate = (await a.get(`${api}/tasks`)).body.data.find((x) => x.title === 'Old' && x.status === 'To do')
    expect(nextLate.due >= new Date().toISOString().slice(0, 10)).toBe(true) // never scheduled in the past (the test account's zone is UTC)
  })
})

describe('uploads and headers', () => {
  it('checks file contents against the extension and replaces bytes in place', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    expect(contentMatches('png', PNG)).toBe(true)
    expect(contentMatches('png', Buffer.from('MZ\u0090 not an image'))).toBe(false)
    const fake = await a.post(`${api}/files`).field('projectId', p.id).attach('file', Buffer.from('#!/bin/sh\necho hi'), 'pic.png')
    expect(fake.status).toBe(422)
    expect(fake.body.error.code).toBe('file.content_mismatch')
    const ok = await a.post(`${api}/files`).field('projectId', p.id).attach('file', PNG, 'pic.png')
    expect(ok.status).toBe(201)
    const bigger = Buffer.concat([PNG, Buffer.alloc(100)])
    const rep = await a.post(`${api}/files/${ok.body.data.id}/replace`).attach('file', bigger, 'other.png')
    expect(rep.body.data.bytes).toBe(bigger.length)
    expect((await a.post(`${api}/files/${ok.body.data.id}/replace`).attach('file', Buffer.from('x'), 'other.txt')).status).toBe(422)
  })

  it('sends locked-down security headers', async () => {
    const res = await request(app).get(`${api}/health`)
    expect(res.headers['content-security-policy']).toContain("default-src 'none'")
    expect(res.headers['x-frame-options']).toBe('DENY')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['x-powered-by']).toBeUndefined()
  })
})
