import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { LIMITS } from '../config.js'
import { notFound } from '../errors.js'
import { body, objectId, send, validate } from '../http.js'
import { ChangeModel, ProjectModel, RequirementModel, TaskModel } from '../models.js'
import { scope } from '../services/common.js'
import * as x from '../services/extras.js'
import { replaceFileBytes } from '../services/library.js'
import { paginate } from '../services/paginate.js'
import { shapeChanges, shapeLibrary, shapeProject, shapeRequirements, shapeTasks } from '../services/shape.js'

// Smaller endpoints from the plans: lookups by slug/key, recents, summaries, bulk and move actions,
// trace, usage, calendar export, vocabulary, and cursor pagination.
export const extrasRouter = Router()
const id = z.object({ id: objectId })
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.fileBytes, files: 1 } })

extrasRouter.get('/vocab', (_req, res) => send(res, x.vocab))
extrasRouter.get('/metrics/definitions', (_req, res) => send(res, x.metricDefinitions))

extrasRouter.get('/projects/recent', validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(12).optional() }) }), async (req, res) => {
  send(res, (await x.recentProjects(req.ctx, req.valid.query.limit)).map((p) => shapeProject(req.ctx, p)))
})
extrasRouter.get('/projects/by-slug/:slug', validate({ params: z.object({ slug: z.string().min(1).max(80) }) }), async (req, res) => send(res, shapeProject(req.ctx, await x.projectBySlug(req.ctx, req.valid.params.slug))))
extrasRouter.get('/projects/:id/summary', validate({ params: id }), async (req, res) => send(res, await x.projectSummary(req.ctx, req.valid.params.id)))
extrasRouter.get('/projects/:id/coverage', validate({ params: id }), async (req, res) => send(res, await x.projectCoverage(req.ctx, req.valid.params.id)))
extrasRouter.get('/projects/:id/timeline', validate({ params: id }), async (req, res) => send(res, await x.projectTimeline(req.ctx, req.valid.params.id)))

extrasRouter.get('/requirements/by-key/:projectId/:key', validate({ params: z.object({ projectId: objectId, key: z.string().regex(/^REQ-\d{3,}$/i) }) }), async (req, res) => {
  const project = await ProjectModel.findOne(scope(req.ctx, { _id: req.valid.params.projectId })).lean()
  if (!project) throw notFound('That project')
  const rec = await RequirementModel.findOne(scope(req.ctx, { projectId: project._id, key: req.valid.params.key.toUpperCase() })).lean()
  if (!rec) throw notFound('That requirement')
  send(res, (await shapeRequirements(req.ctx, [rec]))[0])
})

extrasRouter.post('/tasks/bulk', validate({
  body: body({
    ids: z.array(objectId).min(1).max(100),
    action: z.enum(['complete', 'status', 'priority', 'due', 'blocked', 'delete']),
    value: z.union([z.string(), z.boolean(), z.null()]).optional(),
  }).superRefine((b, ctx) => {
    const ok = { complete: b.value === undefined, delete: b.value === undefined, status: ['To do', 'Doing', 'Done'].includes(b.value), priority: ['normal', 'high'].includes(b.value), due: b.value === null || /^\d{4}-\d{2}-\d{2}$/.test(b.value ?? ''), blocked: typeof b.value === 'boolean' }[b.action]
    if (!ok) ctx.addIssue({ code: 'custom', path: ['value'], message: 'That value does not fit this action.' })
  }),
}), async (req, res) => send(res, await x.bulkTasks(req.ctx, req.valid.body)))
extrasRouter.post('/tasks/:id/move', validate({ params: id, body: body({ projectId: objectId, milestoneId: objectId.nullable().optional() }) }), async (req, res) => {
  send(res, (await shapeTasks(req.ctx, [await x.moveTask(req.ctx, req.valid.params.id, req.valid.body)]))[0])
})

extrasRouter.post('/files/:id/move', validate({ params: id, body: body({ projectId: objectId }) }), async (req, res) => {
  const moved = await x.moveLibraryItem(req.ctx, 'file', req.valid.params.id, req.valid.body.projectId)
  send(res, (await shapeLibrary(req.ctx, [moved], []))[0])
})
extrasRouter.post('/documents/:id/move', validate({ params: id, body: body({ projectId: objectId }) }), async (req, res) => {
  const moved = await x.moveLibraryItem(req.ctx, 'document', req.valid.params.id, req.valid.body.projectId)
  send(res, (await shapeLibrary(req.ctx, [], [moved]))[0])
})
extrasRouter.post('/files/:id/replace', upload.single('file'), validate({ params: id }), async (req, res) => {
  const rec = await replaceFileBytes(req.ctx, req.valid.params.id, req.file)
  send(res, (await shapeLibrary(req.ctx, [rec], []))[0])
})
extrasRouter.get('/files/usage', async (req, res) => send(res, await x.storageUsage(req.ctx)))

extrasRouter.get('/records/:type/:id/trace', validate({ params: z.object({ type: z.enum(['task', 'requirement', 'file', 'milestone']), id: objectId }) }), async (req, res) => {
  send(res, await x.trace(req.ctx, req.valid.params.type, req.valid.params.id))
})
extrasRouter.get('/records/:type/:id/links', validate({ params: z.object({ type: z.enum(['task', 'requirement', 'file', 'milestone']), id: objectId }) }), async (req, res) => {
  const t = await x.trace(req.ctx, req.valid.params.type, req.valid.params.id)
  send(res, { why: t.why, becomes: t.becomes })
})

extrasRouter.get('/calendar.ics', async (req, res) => {
  res.setHeader('Content-Type', 'text/calendar; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="tsumugi.ics"')
  res.send(await x.calendarFile(req.ctx))
})

/* ---------- cursor pagination (PLAN-B-02 section 6) ---------- */
const page = { limit: z.coerce.number().int().min(1).max(100), cursor: z.string().max(500).optional() }
extrasRouter.get('/page/tasks', validate({ query: z.object({ ...page, projectId: objectId.optional(), status: z.enum(['To do', 'Doing', 'Done']).optional() }) }), async (req, res) => {
  const { limit, cursor, projectId, status } = req.valid.query
  const result = await paginate(req.ctx, TaskModel, { ...(projectId && { projectId }), ...(status && { status }) }, { field: 'order', dir: 1 }, { limit, cursor })
  send(res, await shapeTasks(req.ctx, result.rows), 200, { nextCursor: result.nextCursor, hasMore: result.hasMore })
})
extrasRouter.get('/page/changes', validate({ query: z.object({ ...page, projectId: objectId.optional() }) }), async (req, res) => {
  const { limit, cursor, projectId } = req.valid.query
  const result = await paginate(req.ctx, ChangeModel, projectId ? { projectId } : {}, { field: 'at', dir: -1 }, { limit, cursor })
  send(res, await shapeChanges(req.ctx, result.rows, { withDiff: false }), 200, { nextCursor: result.nextCursor, hasMore: result.hasMore })
})
