import request from 'supertest'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { app, clearDb, signUp, startDb, stopDb } from './helpers.js'

beforeAll(startDb, 180_000)
afterAll(stopDb)
beforeEach(clearDb)

describe('auth', () => {
  it('registers, returns the session, and sets an HttpOnly cookie', async () => {
    const agent = request.agent(app)
    const res = await agent.post('/api/v1/auth/register').send({ email: 'Ada@Example.com', password: 'correct horse battery', displayName: 'Ada', acceptTerms: true })
    expect(res.status).toBe(201)
    expect(res.body.data.email).toBe('ada@example.com')
    expect(res.body.data.passwordHash).toBeUndefined()
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i)
    expect((await agent.get('/api/v1/auth/session')).body.data.displayName).toBe('Ada')
  })

  it('rejects weak passwords and duplicate emails', async () => {
    const weak = await request(app).post('/api/v1/auth/register').send({ email: 'a@b.co', password: 'short', displayName: 'A', acceptTerms: true })
    expect(weak.status).toBe(400)
    expect(weak.body.error.details[0].path).toBe('password')
    await signUp('dup@example.com')
    const dup = await request(app).post('/api/v1/auth/register').send({ email: 'dup@example.com', password: 'correct horse battery', displayName: 'B', acceptTerms: true })
    expect(dup.status).toBe(409)
    expect(dup.body.error.code).toBe('auth.email_taken')
  })

  it('logs in, logs out, and gives the same error for unknown and wrong-password accounts', async () => {
    await signUp('ada@example.com')
    const wrong = await request(app).post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'nope-nope-nope' })
    const unknown = await request(app).post('/api/v1/auth/login').send({ email: 'ghost@example.com', password: 'nope-nope-nope' })
    expect(wrong.status).toBe(401)
    expect(unknown.body).toEqual(wrong.body)
    const agent = request.agent(app)
    expect((await agent.post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'correct horse battery' })).status).toBe(200)
    expect((await agent.get('/api/v1/me')).status).toBe(200)
    await agent.post('/api/v1/auth/logout')
    expect((await agent.get('/api/v1/me')).status).toBe(401)
  })

  it('locks the account after five wrong passwords', async () => {
    await signUp('ada@example.com')
    for (let i = 0; i < 5; i += 1) await request(app).post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'wrong-wrong-wrong' })
    const locked = await request(app).post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'correct horse battery' })
    expect(locked.status).toBe(423)
  })

  it('updates preferences and changes the password, signing other sessions out', async () => {
    const agent = await signUp('ada@example.com')
    const other = request.agent(app)
    await other.post('/api/v1/auth/login').send({ email: 'ada@example.com', password: 'correct horse battery' })
    const prefs = await agent.patch('/api/v1/me').send({ preferences: { theme: 'dark', weekStart: 'sunday' } })
    expect(prefs.body.data.preferences).toMatchObject({ theme: 'dark', weekStart: 'sunday' })
    expect((await agent.patch('/api/v1/me').send({ preferences: { bogus: 1 } })).status).toBe(400)
    expect((await agent.post('/api/v1/auth/change-password').send({ currentPassword: 'correct horse battery', newPassword: 'a brand new passphrase' })).status).toBe(204)
    expect((await other.get('/api/v1/me')).status).toBe(401)
    expect((await agent.get('/api/v1/me')).status).toBe(200)
  })

  it('requires a session for every workspace route and rejects cross-site writes', async () => {
    expect((await request(app).get('/api/v1/workspace/snapshot')).status).toBe(401)
    const agent = await signUp('ada@example.com')
    const evil = await agent.post('/api/v1/projects').set('Origin', 'https://evil.example').send({ name: 'x' })
    expect(evil.status).toBe(403)
  })
})
