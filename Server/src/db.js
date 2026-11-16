import fs from 'node:fs'
import mongoose from 'mongoose'
import { config } from './config.js'

let memory = null
const LOCAL_PORT = 27018
const LOCAL_URI = `mongodb://127.0.0.1:${LOCAL_PORT}/tsumugi`

/**
 * Connects to MONGODB_URI. With no URI it uses a local database stored in Server/.data: if one is already running
 * (for example the API server, while you run `npm run seed`) it joins it, otherwise it starts one. No install needed.
 */
export async function connect(uri = config.mongoUri) {
  if (uri) {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 })
    return uri
  }
  try {
    await mongoose.connect(LOCAL_URI, { serverSelectionTimeoutMS: 1200 })
    return LOCAL_URI
  } catch {
    await mongoose.disconnect().catch(() => {})
  }
  const { MongoMemoryServer } = await import('mongodb-memory-server')
  const dbPath = `${config.dataDir}/db`
  fs.mkdirSync(dbPath, { recursive: true })
  memory = await MongoMemoryServer.create({ instance: { dbPath, storageEngine: 'wiredTiger', port: LOCAL_PORT, ip: '127.0.0.1' } })
  await mongoose.connect(LOCAL_URI, { serverSelectionTimeoutMS: 8000 })
  return LOCAL_URI
}

export async function disconnect() {
  await mongoose.disconnect()
  if (memory) await memory.stop({ doCleanup: false })
  memory = null
}
