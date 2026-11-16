import { z } from 'zod'
import { badRequest } from './errors.js'

export const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Not a valid id.')
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.').refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), 'Not a real date.')
export const tagList = z.array(z.string().trim().min(1).max(30)).max(20).transform((tags) => [...new Set(tags.map((t) => t.toLowerCase()))])

const issues = (error) => error.issues.map((i) => ({ path: i.path.join('.'), code: i.code, message: i.message }))

/** Validates params, query, and body. Parsed values land on req.valid (Express 5 makes req.query read-only). */
export const validate = (schemas) => (req, _res, next) => {
  const valid = {}
  const all = []
  for (const part of ['params', 'query', 'body']) {
    if (!schemas[part]) continue
    const result = schemas[part].safeParse(req[part] ?? {})
    if (result.success) valid[part] = result.data
    else all.push(...issues(result.error).map((i) => ({ ...i, path: [part === 'body' ? '' : part, i.path].filter(Boolean).join('.') })))
  }
  if (all.length) return next(badRequest('Some fields need attention.', all))
  req.valid = valid
  next()
}

export const send = (res, data, status = 200, meta) => res.status(status).json(meta ? { data, meta } : { data })
export const noContent = (res) => res.status(204).end()

/** Strict body schema helper: unknown keys are rejected (PLAN-B-02 section 4). */
export const body = (shape) => z.object(shape).strict()
