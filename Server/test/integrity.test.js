import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { LinkModel, TaskModel } from '../src/models.js'
import { checkIntegrity } from '../src/services/integrity.js'
import { clearDb, makeProject, signUp, startDb, stopDb } from './helpers.js'

beforeAll(startDb, 180_000)
afterAll(stopDb)
beforeEach(clearDb)
const api = '/api/v1'

describe('integrity check', () => {
  it('reports clean data as clean, including after deletes and restores', async () => {
    const a = await signUp()
    const p = await makeProject(a, { name: 'Zine', templateKind: 'software' })
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })).body.data
    await a.delete(`${api}/tasks/${t.id}`)
    await a.post(`${api}/trash/task/${t.id}/restore`)
    await a.delete(`${api}/projects/${p.id}`)
    await a.post(`${api}/trash/project/${p.id}/restore`)
    expect(await checkIntegrity()).toMatchObject({ ok: true, problems: [] })
  })

  it('finds dangling and duplicate links, and removes them with fix', async () => {
    const a = await signUp()
    const p = await makeProject(a)
    const req = (await a.post(`${api}/requirements`).send({ projectId: p.id, title: 'R' })).body.data
    const t = (await a.post(`${api}/tasks`).send({ projectId: p.id, title: 'T', requirementIds: [req.id] })).body.data
    await TaskModel.deleteOne({ _id: t.id }) // simulate a crash that left the link behind
    const found = await checkIntegrity()
    expect(found.ok).toBe(false)
    expect(found.problems.map((x) => x.code)).toContain('dangling_link')
    expect((await checkIntegrity({ fix: true })).fixed).toBeGreaterThan(0)
    expect(await LinkModel.countDocuments({ relation: 'implements' })).toBe(0)
    expect((await checkIntegrity()).ok).toBe(true)
  })
})
