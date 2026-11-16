import mongoose from 'mongoose'

const HIDDEN = new Set(['workspaceId', 'deletedAt', 'deletedBatchId', 'passwordHash', 'storageKey'])
const isOid = (v) => v instanceof mongoose.Types.ObjectId

/** Lean Mongo document -> API JSON: `_id` becomes `id`, ObjectIds become strings, internal fields are dropped. */
export function clean(value) {
  if (Array.isArray(value)) return value.map(clean)
  if (isOid(value)) return String(value)
  if (value instanceof Date || value === null || typeof value !== 'object') return value
  const out = {}
  for (const [key, v] of Object.entries(value)) {
    if (HIDDEN.has(key)) continue
    out[key === '_id' ? 'id' : key] = clean(v)
  }
  return out
}

export const oidOf = (value) => (value == null ? null : new mongoose.Types.ObjectId(String(value)))
