import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || 3001),
  // 127.0.0.1 keeps the API private to this computer. Set HOST=0.0.0.0 to let a phone or emulator on your network reach it.
  host: process.env.HOST || '127.0.0.1',
  mongoUri: process.env.MONGODB_URI || '',
  dataDir: path.resolve(root, process.env.DATA_DIR || '.data'),
  uploadDir: path.resolve(root, process.env.UPLOAD_DIR || 'uploads'),
  clientOrigin: (process.env.CLIENT_ORIGIN || 'http://localhost:5173').split(',').map((s) => s.trim()),
  sessionDays: Number(process.env.SESSION_DAYS || 30),
  cookieName: 'tsumugi_sid',
}

export const LIMITS = {
  title: 200, name: 120, description: 5000, notes: 20000, objective: 1000, tag: 30, tags: 20,
  subtasks: 50, criteria: 30, phases: 20, docBody: 200_000, fileBytes: 100 * 1024 * 1024,
}
