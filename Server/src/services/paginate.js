import crypto from 'node:crypto'
import { badRequest } from '../errors.js'
import { scope } from './common.js'

// Signed opaque cursors (PLAN-B-02 section 6). The secret is per process: cursors from before a restart are rejected, which is fine for paging.
const SECRET = crypto.randomBytes(32)
const sign = (payload) => crypto.createHmac('sha256', SECRET).update(payload).digest('base64url')
const encode = (obj) => { const p = Buffer.from(JSON.stringify(obj)).toString('base64url'); return `${p}.${sign(p)}` }
function decode(cursor) {
  const [p, sig] = String(cursor).split('.')
  const good = p && sig && sig.length === sign(p).length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(p)))
  if (!good) throw badRequest('That page cursor is not valid.', [{ path: 'cursor', code: 'invalid_cursor', message: 'Start again from the first page.' }])
  return JSON.parse(Buffer.from(p, 'base64url').toString())
}

/** Stable pagination on one sort field with `_id` as the tiebreaker, so equal values never repeat or skip. */
export async function paginate(ctx, Model, extra, { field, dir }, { limit = 25, cursor } = {}) {
  const filter = scope(ctx, extra)
  if (cursor) {
    const c = decode(cursor)
    const v = field === 'at' ? new Date(c.v) : c.v
    const cmp = dir === 1 ? '$gt' : '$lt'
    filter.$and = [{ $or: [{ [field]: { [cmp]: v } }, { [field]: v, _id: { [cmp]: c.id } }] }]
  }
  const rows = await Model.find(filter).sort({ [field]: dir, _id: dir }).limit(limit + 1).lean()
  const hasMore = rows.length > limit
  const page = hasMore ? rows.slice(0, limit) : rows
  const last = page[page.length - 1]
  const nextCursor = hasMore && last ? encode({ v: field === 'at' ? last[field].toISOString() : last[field], id: String(last._id) }) : null
  return { rows: page, hasMore, nextCursor }
}
