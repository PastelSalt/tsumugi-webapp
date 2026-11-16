import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { clearDb, makeProject, signUp, startDb, stopDb } from './helpers.js'

beforeAll(startDb, 180_000)
afterAll(stopDb)
beforeEach(clearDb)

const api = '/api/v1'

describe('projects', () => {
  it('creates from a template with milestone and tasks, and records history', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'My Novel', templateKind: 'creative' })
    expect(p.phases).toHaveLength(5)
    expect(p.slug).toBe('my-novel')
    const snap = (await a.get(`${api}/workspace/snapshot`)).body.data
    expect(snap.milestones).toHaveLength(1)
    expect(snap.tasks).toHaveLength(3)
    expect(snap.changes[0].summary).toMatch(/Created/)
  })

  it('archives (read-only), unarchives, deletes with cascade, and restores exactly', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'Zine', templateKind: 'software' })
    expect((await a.patch(`${api}/projects/${p.id}`).send({ archived: true })).body.data.archived).toBe(true)
    const blocked = await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'nope' })
    expect(blocked.status).toBe(409)
    expect(blocked.body.error.code).toBe('project.archived')
    await a.patch(`${api}/projects/${p.id}`).send({ archived: false })
    expect((await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'ok' })).status).toBe(201)

    const before = (await a.get(`${api}/workspace/snapshot`)).body.data
    expect((await a.delete(`${api}/projects/${p.id}`)).status).toBe(204)
    const gone = (await a.get(`${api}/workspace/snapshot`)).body.data
    expect(gone.projects).toHaveLength(0)
    expect(gone.tasks).toHaveLength(0)
    expect((await a.get(`${api}/projects/${p.id}`)).status).toBe(404)
    expect((await a.post(`${api}/projects/${p.id}/restore`)).status).toBe(200)
    const after = (await a.get(`${api}/workspace/snapshot`)).body.data
    expect(after.tasks.length).toBe(before.tasks.length)
    expect(after.milestones.length).toBe(before.milestones.length)
  })

  it('keeps one user from seeing or touching another user’s records (404, not 403)', async () => {
    const a = await signUp('a@example.com')
    const b = await signUp('b@example.com')
    const p = await makeProject(a)
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'private' })).body.data
    for (const [method, url, payload] of [['get', `/projects/${p.id}`], ['patch', `/projects/${p.id}`, { name: 'x' }], ['delete', `/projects/${p.id}`], ['get', `/tasks/${t.id}`], ['patch', `/tasks/${t.id}`, { title: 'x' }], ['delete', `/tasks/${t.id}`]]) {
      expect((await b[method](`${api}${url}`).send(payload)).status, `${method} ${url}`).toBe(404)
    }
    expect((await b.post(`${api}/tasks`).send({ projectId: p.id, title: 'sneaky' })).status).toBe(404)
    expect((await b.get(`${api}/workspace/snapshot`)).body.data.tasks).toHaveLength(0)
  })

  it('validates input strictly', async () => {
    const a = await signUp()
    expect((await a.post(`${api}/projects`).send({ name: '' })).status).toBe(400)
    expect((await a.post(`${api}/projects`).send({ name: 'x', workspaceId: 'abc' })).status).toBe(400)
    expect((await a.get(`${api}/projects/not-an-id`)).status).toBe(400)
    expect((await a.post(`${api}/projects`).send({ name: 'x', start: '2026-02-01', end: '2026-01-01' })).status).toBe(201) // dates only checked on update
    const p = await makeProject(a)
    expect((await a.patch(`${api}/projects/${p.id}`).send({ start: '2026-02-01', end: '2026-01-01' })).status).toBe(422)
    expect((await a.post(`${api}/projects`).set('Content-Type', 'application/json').send('{bad')).status).toBe(400)
  })
})

describe('milestones and tasks', () => {
  it('prevents milestone dependency cycles and detaches tasks on delete', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const m1 = (await a.post(`${api}/milestones`).send({ projectId: p.id, title: 'One', start: '2026-01-01', due: '2026-02-01' })).body.data
    const m2 = (await a.post(`${api}/milestones`).send({ projectId: p.id, title: 'Two', start: '2026-02-01', due: '2026-03-01', afterId: m1.id })).body.data
    expect((await a.patch(`${api}/milestones/${m1.id}`).send({ afterId: m2.id })).status).toBe(422)
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', milestoneId: m2.id })).body.data
    expect(t.milestoneId).toBe(m2.id)
    expect((await a.delete(`${api}/milestones/${m2.id}`)).status).toBe(204)
    expect((await a.get(`${api}/tasks/${t.id}`)).body.data.milestoneId).toBeNull()
  })

  it('handles status, flags, subtasks, delete and restore', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Proof chapter', priority: 'high', due: '2026-12-01', subtasks: [{ text: 'a' }, { text: 'b', done: true }] })).body.data
    expect(t.subtasks).toHaveLength(2)
    await a.patch(`${api}/tasks/${t.id}`).send({ blocked: true })
    const done = (await a.patch(`${api}/tasks/${t.id}`).send({ status: 'Done' })).body.data
    expect(done.status).toBe('Done')
    expect(done.blocked).toBe(false) // finishing a task clears blocked
    expect((await a.delete(`${api}/tasks/${t.id}`)).status).toBe(204)
    expect((await a.get(`${api}/tasks/${t.id}`)).status).toBe(404)
    expect((await a.post(`${api}/tasks/${t.id}/restore`)).body.data.title).toBe('Proof chapter')
  })

  it('records meaningful changes only', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T' })).body.data
    const count = async () => (await a.get(`${api}/changes?projectId=${p.id}`)).body.data.length
    const base = await count()
    await a.patch(`${api}/tasks/${t.id}`).send({ notes: 'just notes' })
    expect(await count()).toBe(base)
    await a.patch(`${api}/tasks/${t.id}`).send({ status: 'Doing' })
    expect(await count()).toBe(base + 1)
  })
})

describe('requirements and links', () => {
  it('allocates unique keys, enforces the Met rule, reopens on open criteria, and never reuses keys', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const r1 = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'Sign in', acceptance: [{ text: 'works' }, { text: 'documented' }] })).body.data
    expect(r1.key).toBe('REQ-001')
    expect((await a.patch(`${api}/requirements/${r1.id}`).send({ status: 'Met' })).status).toBe(422)
    const met = await a.patch(`${api}/requirements/${r1.id}`).send({ acceptance: [{ text: 'works', met: true }, { text: 'documented', met: true }], status: 'Met' })
    expect(met.body.data.status).toBe('Met')
    expect((await a.patch(`${api}/requirements/${r1.id}`).send({ verified: true })).body.data.verified).toBe(true)
    const reopened = await a.patch(`${api}/requirements/${r1.id}`).send({ acceptance: [{ text: 'works', met: true }, { text: 'new', met: false }] })
    expect(reopened.body.data.status).toBe('Open')
    expect(reopened.body.data.verified).toBe(false)
    await a.delete(`${api}/requirements/${r1.id}`)
    const r2 = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'Another' })).body.data
    expect(r2.key).toBe('REQ-002')
  })

  it('links tasks, requirements, and files in both directions and rejects cross-project links', async () => {
    const a = await signUp()
    const p1 = await makeProject(a, { name: 'One', templateKind: 'blank' })
    const p2 = await makeProject(a, { name: 'Two', templateKind: 'blank' })
    const req = (await a.post(`${api}/requirements`).send({ projectId: p1.id, title: 'R' })).body.data
    const task = (await a.post(`${api}/tasks`).send({ projectId: p1.id, title: 'T', requirementIds: [req.id] })).body.data
    expect(task.requirementIds).toEqual([req.id])
    expect((await a.get(`${api}/requirements/${req.id}`)).body.data.taskIds).toEqual([task.id])
    const other = (await a.post(`${api}/tasks`).send({ projectId: p2.id, title: 'Elsewhere' })).body.data
    const bad = await a.patch(`${api}/requirements/${req.id}`).send({ taskIds: [other.id] })
    expect(bad.status).toBe(422)
    expect(bad.body.error.code).toBe('link.cross_project')
    await a.patch(`${api}/tasks/${task.id}`).send({ requirementIds: [] })
    expect((await a.get(`${api}/requirements/${req.id}`)).body.data.taskIds).toEqual([])
  })

  it('computes coverage gaps: a Final file closes the file gap, a task closes the task gap', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    let cov = (await a.get(`${api}/insights`)).body.data.coverage
    expect(cov).toMatchObject({ total: 1, withGaps: 1, missingTask: 1, missingFile: 1 })
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })
    const doc = (await a.post(`${api}/documents`).send({ projectId: p.id, title: 'Spec', body: '# hi' })).body.data
    await a.patch(`${api}/documents/${doc.id}`).send({ requirementIds: [req.id] })
    await a.post(`${api}/documents/${doc.id}/finalize`)
    cov = (await a.get(`${api}/insights`)).body.data.coverage
    expect(cov).toMatchObject({ withGaps: 0, missingTask: 0, missingFile: 0 })
  })
})

describe('library', () => {
  it('versions documents, guards stale saves, diffs, restores, and protects Final', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const doc = (await a.post(`${api}/documents`).send({ projectId: p.id, title: 'Brief', body: '# Brief\n- one\n' })).body.data
    expect(doc.version).toBe(1)
    const v2 = (await a.patch(`${api}/documents/${doc.id}`).send({ body: '# Brief\n- one\n- two\n', baseVersion: 1, summary: 'Added two' })).body.data
    expect(v2.version).toBe(2)
    const stale = await a.patch(`${api}/documents/${doc.id}`).send({ body: 'overwrite', baseVersion: 1 })
    expect(stale.status).toBe(412)
    expect(stale.body.error.details.current.version).toBe(2)
    const diff = (await a.get(`${api}/documents/${doc.id}/diff?from=1&to=2`)).body.data
    expect(diff.some((l) => l.mark === '+' && l.text === '- two')).toBe(true)
    const restored = (await a.post(`${api}/documents/${doc.id}/versions/1/restore`)).body.data
    expect(restored.version).toBe(3)
    expect(restored.body).toBe('# Brief\n- one\n')
    expect((await a.get(`${api}/documents/${doc.id}/versions`)).body.data).toHaveLength(3)
    await a.post(`${api}/documents/${doc.id}/finalize`)
    const locked = await a.patch(`${api}/documents/${doc.id}`).send({ body: 'edit', baseVersion: 3 })
    expect(locked.status).toBe(409)
    expect((await a.get(`${api}/documents/${doc.id}/export`)).text).toContain('# Brief')
    const history = (await a.get(`${api}/changes?projectId=${p.id}`)).body.data
    expect(history.find((c) => c.fromVersion === 1 && c.toVersion === 2).diff).toBeDefined()
  })

  it('uploads, lists, downloads, and deletes files; rejects bad types; hides other users’ files', async () => {
    const a = await signUp('a@example.com')
    const b = await signUp('b@example.com')
    const p = await makeProject(a)
    const up = await a.post(`${api}/files`).field('projectId', p.id).field('tags', 'Draft, notes').attach('file', Buffer.from('hello world'), 'notes.txt')
    expect(up.status).toBe(201)
    expect(up.body.data).toMatchObject({ kind: 'document', ext: 'txt', bytes: 11, tags: ['draft', 'notes'] })
    expect(up.body.data.storageKey).toBeUndefined()
    const dl = await a.get(`${api}/files/${up.body.data.id}/download`)
    expect(dl.status).toBe(200)
    expect(dl.headers['content-disposition']).toMatch(/attachment/)
    expect((await b.get(`${api}/files/${up.body.data.id}/download`)).status).toBe(404)
    const bad = await a.post(`${api}/files`).field('projectId', p.id).attach('file', Buffer.from('<script>'), 'evil.html')
    expect(bad.status).toBe(422)
    expect(bad.body.error.code).toBe('file.type_not_allowed')
    const link = await a.post(`${api}/files/links`).send({ projectId: p.id, name: 'Repo', url: 'https://github.com/x/y' })
    expect(link.body.data).toMatchObject({ kind: 'link', host: 'github.com' })
    expect((await a.post(`${api}/files/links`).send({ projectId: p.id, name: 'x', url: 'javascript:alert(1)' })).status).toBe(400)
    const patched = (await a.patch(`${api}/files/${up.body.data.id}`).send({ isFinal: true })).body.data
    expect(patched.isFinal).toBe(true)
    expect((await a.get(`${api}/library?projectId=${p.id}`)).body.data).toHaveLength(2)
    expect((await a.delete(`${api}/files/${up.body.data.id}`)).status).toBe(204)
    expect((await a.get(`${api}/library?projectId=${p.id}`)).body.data).toHaveLength(1)
  })
})

describe('home, insights, search', () => {
  it('computes today lists, progress, health, and search from stored records', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'Garden Plan', templateKind: 'blank' })
    const today = (await a.get(`${api}/home`)).body.data.today
    const past = new Date(`${today}T00:00:00Z`); past.setUTCDate(past.getUTCDate() - 3)
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Late one', due: past.toISOString().slice(0, 10) })
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Due today', due: today })
    await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'Finished', status: 'Done' })
    const home = (await a.get(`${api}/home`)).body.data
    expect(home.figures).toMatchObject({ dueToday: 1, overdue: 1 })
    const ins = (await a.get(`${api}/insights`)).body.data
    expect(ins.progress[0]).toMatchObject({ done: 1, total: 3, pct: 33, health: 'At risk' })
    expect(ins.overdue).toHaveLength(1)
    const hits = (await a.get(`${api}/search?q=garden`)).body.data
    expect(hits[0]).toMatchObject({ type: 'Project', title: 'Garden Plan' })
    expect((await a.get(`${api}/search?q=.*`)).body.data).toEqual([]) // queries are literal text, never patterns
  })
})
