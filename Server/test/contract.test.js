import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { app, makeProject, signUp, startDb, stopDb } from './helpers.js'

// Authorization contract (PLAN-B-14 section 12): every route in the app, discovered from the router itself, must
//  1. answer 401 without a session (except the public ones), and
//  2. never give user B any of user A's records, whichever kind of id is put in the URL.
// Routes added later are covered automatically.

const api = '/api/v1'
const PUBLIC = new Set(['GET /health', 'POST /auth/register', 'POST /auth/login', 'POST /auth/logout'])
const SKIP_FOR_B = new Set(['POST /auth/logout', 'POST /auth/logout-all', 'POST /me/delete', 'POST /auth/change-password']) // they act on B's own session or account

function listRoutes() {
  const out = []
  const walk = (stack, prefix) => stack.forEach((l) => {
    if (l.route) Object.keys(l.route.methods).forEach((m) => out.push({ method: m.toUpperCase(), path: `${prefix}${l.route.path}` }))
    else if (l.handle?.stack) walk(l.handle.stack, prefix)
  })
  walk(app.router.stack, '')
  return out
}

const ROUTES = listRoutes()
const FAKE = '64b7f0f0f0f0f0f0f0f0f0f0'
const fill = (path, values) => path.replace(/:(\w+)/g, (_, name) => values[name] ?? values.id ?? FAKE)

let A
let B
const ids = {}
beforeAll(async () => {
  await startDb()
  A = await signUp('a@example.com')
  B = await signUp('b@example.com')
  const p = await makeProject(A, { name: 'Secret plan', templateKind: 'software' })
  const ms = (await A.post(`${api}/milestones`).send({ projectId: p.id, title: 'M', start: '2026-01-01', due: '2026-02-01' })).body.data
  const req = (await A.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
  const task = (await A.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })).body.data
  const doc = (await A.post(`${api}/documents`).send({ projectId: p.id, title: 'D', body: 'secret text' })).body.data
  const file = (await A.post(`${api}/files`).field('projectId', p.id).attach('file', Buffer.from('secret'), 'a.txt')).body.data
  const change = (await A.get(`${api}/changes`)).body.data[0]
  const session = (await A.get(`${api}/auth/sessions`)).body.data[0]
  Object.assign(ids, { project: p.id, milestone: ms.id, requirement: req.id, task: task.id, document: doc.id, file: file.id, change: change.id, session: session.id, user: (await A.get(`${api}/me`)).body.data.id })
}, 180_000)
afterAll(stopDb)

describe('authorization contract', () => {
  it('discovers the routes', () => {
    expect(ROUTES.length).toBeGreaterThan(70)
    expect(ROUTES.some((r) => r.method === 'DELETE' && r.path === '/projects/:id')).toBe(true)
  })

  it('requires a session on every route except the public ones', async () => {
    const failures = []
    for (const r of ROUTES) {
      if (PUBLIC.has(`${r.method} ${r.path}`)) continue
      const res = await request(app)[r.method.toLowerCase()](`${api}${fill(r.path, { type: 'task', key: 'REQ-001', slug: 'x', version: '1', projectId: FAKE })}`).send({})
      if (res.status !== 401) failures.push(`${r.method} ${r.path} -> ${res.status}`)
    }
    expect(failures).toEqual([])
  })

  it('never lets another user read or change A’s records, whichever id is used', async () => {
    const secrets = Object.values(ids)
    const leaks = []
    let calls = 0
    for (const r of ROUTES) {
      const key = `${r.method} ${r.path}`
      if (PUBLIC.has(key) || SKIP_FOR_B.has(key)) continue
      const params = [...r.path.matchAll(/:(\w+)/g)].map((m) => m[1])
      // Every kind of A id in every id-shaped slot; routes with a :type slot are tried with each type.
      const candidates = params.length
        ? Object.values(ids).flatMap((id) => (params.includes('type') ? ['task', 'requirement', 'file', 'milestone', 'project', 'document'] : ['x']).map((type) => ({ id, projectId: ids.project, type, key: 'REQ-001', slug: 'secret-plan', version: '1' })))
        : [{}]
      for (const values of candidates) {
        const res = await B[r.method.toLowerCase()](`${api}${fill(r.path, values)}`).send({})
        calls += 1
        const text = res.text || ''
        if (params.length && res.status < 300 && !/^GET \/(records|trash)/.test(key) && !res.headers['content-type']?.includes('calendar')) leaks.push(`${key} with ${JSON.stringify(values)} -> ${res.status}`)
        if (secrets.some((s) => text.includes(s))) leaks.push(`${key} with ${JSON.stringify(values)} leaked an id (${res.status})`)
        if (text.includes('secret text') || text.includes('Secret plan')) leaks.push(`${key} leaked content`)
      }
    }
    expect(calls).toBeGreaterThan(400)
    expect(leaks).toEqual([])
  }, 180_000)
})
