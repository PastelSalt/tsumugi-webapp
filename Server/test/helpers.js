import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import mongoose from 'mongoose'
import { MongoMemoryServer } from 'mongodb-memory-server'
import request from 'supertest'

process.env.NODE_ENV = 'test'
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tsumugi-uploads-'))

const { createApp } = await import('../src/app.js')
const { connect } = await import('../src/db.js')

let memory
export async function startDb() {
  memory = await MongoMemoryServer.create()
  await connect(`${memory.getUri()}test`)
}
export async function stopDb() {
  await mongoose.disconnect()
  await memory?.stop()
}
export async function clearDb() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})))
}

export const app = createApp()

/** A signed-in agent (cookie jar) for a fresh user. */
export async function signUp(email = 'ada@example.com', displayName = 'Ada') {
  const agent = request.agent(app)
  const res = await agent.post('/api/v1/auth/register').send({ email, password: 'correct horse battery', displayName, acceptTerms: true, timeZone: 'UTC' })
  if (res.status !== 201) throw new Error(`register failed: ${res.status} ${JSON.stringify(res.body)}`)
  return agent
}

export const makeProject = async (agent, body = { name: 'Garden', templateKind: 'blank' }) => (await agent.post('/api/v1/projects').send(body)).body.data
