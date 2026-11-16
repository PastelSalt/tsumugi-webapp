import { Router } from 'express'
import { z } from 'zod'
import { body, isoDate, noContent, objectId, send, tagList, validate } from '../http.js'
import { templates } from '../lib/templates.js'
import { RequirementModel } from '../models.js'
import * as projects from '../services/projects.js'
import * as milestones from '../services/milestones.js'
import * as tasks from '../services/tasks.js'
import * as reqs from '../services/requirements.js'
import * as insights from '../services/insights.js'
import { loadOne } from '../services/common.js'
import * as trash from '../services/trash.js'
import { shapeMilestone, shapeProject, shapeRequirements, shapeTasks } from '../services/shape.js'

export const workRouter = Router()
const id = z.object({ id: objectId })
const one = async (shaper, ctx, doc) => (await shaper(ctx, [doc]))[0]

/* ---------- workspace-wide ---------- */
workRouter.get('/templates', (_req, res) => send(res, templates))
workRouter.get('/workspace/snapshot', async (req, res) => send(res, await insights.snapshot(req.ctx)))
workRouter.get('/home', async (req, res) => send(res, await insights.home(req.ctx)))
workRouter.get('/insights', validate({ query: z.object({ projectId: objectId.optional() }) }), async (req, res) => send(res, await insights.insights(req.ctx, req.valid.query.projectId)))
workRouter.get('/search', validate({ query: z.object({ q: z.string().trim().min(1).max(100), limit: z.coerce.number().int().min(1).max(50).optional() }) }), async (req, res) => send(res, await insights.search(req.ctx, req.valid.query.q, { limit: req.valid.query.limit })))

/* ---------- projects ---------- */
const projectFields = {
  name: z.string().trim().min(1, 'Give the project a name.').max(120),
  category: z.string().trim().max(40),
  kind: z.enum(['software', 'creative', 'research', 'multimedia', 'blank']),
  status: z.enum(['Planning', 'Active', 'On hold', 'Done']),
  tone: z.enum(['pink', 'blue', 'lilac', 'yellow', 'green']),
  tags: tagList,
  description: z.string().max(5000),
  objective: z.string().max(1000),
  start: isoDate,
  end: isoDate,
  phases: z.array(z.string().trim().min(1).max(40)).min(1).max(20),
  phaseIndex: z.number().int().min(0).max(19),
}
workRouter.get('/projects', validate({ query: z.object({ archived: z.enum(['true', 'false', 'any']).optional(), status: z.enum(['Planning', 'Active', 'On hold', 'Done']).optional(), q: z.string().max(100).optional() }) }), async (req, res) => {
  send(res, (await projects.listProjects(req.ctx, req.valid.query)).map((p) => shapeProject(req.ctx, p)))
})
workRouter.get('/projects/deleted', async (req, res) => send(res, (await projects.listDeleted(req.ctx)).map((p) => shapeProject(req.ctx, p))))
workRouter.post('/projects', validate({ body: body({ ...Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, k === 'name' ? v : v.optional()])), templateKind: z.enum(['software', 'creative', 'research', 'multimedia', 'blank']).optional() }) }), async (req, res) => {
  send(res, shapeProject(req.ctx, await projects.createProject(req.ctx, req.valid.body)), 201)
})
workRouter.get('/projects/:id', validate({ params: id }), async (req, res) => send(res, shapeProject(req.ctx, await projects.getProject(req.ctx, req.valid.params.id))))
workRouter.patch('/projects/:id', validate({ params: id, body: body({ ...Object.fromEntries(Object.entries(projectFields).map(([k, v]) => [k, v.optional()])), archived: z.boolean().optional() }) }), async (req, res) => {
  send(res, shapeProject(req.ctx, await projects.updateProject(req.ctx, req.valid.params.id, req.valid.body)))
})
workRouter.post('/projects/:id/open', validate({ params: id }), async (req, res) => send(res, shapeProject(req.ctx, await projects.openProject(req.ctx, req.valid.params.id))))
workRouter.delete('/projects/:id', validate({ params: id }), async (req, res) => { await projects.deleteProject(req.ctx, req.valid.params.id); noContent(res) })
workRouter.post('/projects/:id/restore', validate({ params: id }), async (req, res) => send(res, shapeProject(req.ctx, await projects.restoreProject(req.ctx, req.valid.params.id))))

/* ---------- milestones ---------- */
const milestoneFields = {
  title: z.string().trim().min(1, 'Give the milestone a title.').max(160),
  description: z.string().max(2000),
  start: isoDate,
  due: isoDate,
  phase: z.number().int().min(0).max(19),
  done: z.boolean(),
  blocked: z.boolean(),
  afterId: objectId.nullable(),
}
workRouter.get('/milestones', validate({ query: z.object({ projectId: objectId.optional(), done: z.enum(['true', 'false']).transform((v) => v === 'true').optional() }) }), async (req, res) => {
  send(res, (await milestones.listMilestones(req.ctx, req.valid.query)).map((m) => shapeMilestone(req.ctx, m)))
})
workRouter.post('/milestones', validate({ body: body({ projectId: objectId, title: milestoneFields.title, start: isoDate, due: isoDate, description: milestoneFields.description.optional(), phase: milestoneFields.phase.optional(), afterId: milestoneFields.afterId.optional() }) }), async (req, res) => {
  send(res, shapeMilestone(req.ctx, await milestones.createMilestone(req.ctx, req.valid.body)), 201)
})
workRouter.patch('/milestones/:id', validate({ params: id, body: body(Object.fromEntries(Object.entries(milestoneFields).map(([k, v]) => [k, v.optional()]))) }), async (req, res) => {
  send(res, shapeMilestone(req.ctx, await milestones.updateMilestone(req.ctx, req.valid.params.id, req.valid.body)))
})
workRouter.delete('/milestones/:id', validate({ params: id }), async (req, res) => { await milestones.deleteMilestone(req.ctx, req.valid.params.id); noContent(res) })

/* ---------- tasks ---------- */
const subtasks = z.array(z.object({ text: z.string().trim().min(1).max(200), done: z.boolean().default(false) }).strict()).max(50)
const taskFields = {
  title: z.string().trim().min(1, 'Write the task.').max(200),
  notes: z.string().max(20000),
  status: z.enum(['To do', 'Doing', 'Done']),
  priority: z.enum(['normal', 'high']),
  due: isoDate.nullable(),
  blocked: z.boolean(),
  milestoneId: objectId.nullable(),
  subtasks,
  order: z.number(),
  recurrence: z.object({ freq: z.enum(['daily', 'weekly', 'monthly', 'yearly']), interval: z.number().int().min(1).max(30).default(1) }).strict().nullable(),
  requirementIds: z.array(objectId).max(200),
  fileIds: z.array(objectId).max(200),
}
workRouter.get('/tasks', validate({ query: z.object({ projectId: objectId.optional(), milestoneId: objectId.optional(), status: z.union([z.enum(['To do', 'Doing', 'Done']), z.array(z.enum(['To do', 'Doing', 'Done']))]).optional(), priority: z.enum(['normal', 'high']).optional(), q: z.string().max(100).optional() }) }), async (req, res) => {
  send(res, await shapeTasks(req.ctx, await tasks.listTasks(req.ctx, req.valid.query)))
})
workRouter.post('/tasks', validate({ body: body({ projectId: objectId, ...Object.fromEntries(Object.entries(taskFields).map(([k, v]) => [k, k === 'title' ? v : v.optional()])) }) }), async (req, res) => {
  send(res, await one(shapeTasks, req.ctx, await tasks.createTask(req.ctx, req.valid.body)), 201)
})
workRouter.get('/tasks/:id', validate({ params: id }), async (req, res) => send(res, await one(shapeTasks, req.ctx, await tasks.getTask(req.ctx, req.valid.params.id))))
workRouter.patch('/tasks/:id', validate({ params: id, body: body(Object.fromEntries(Object.entries(taskFields).map(([k, v]) => [k, v.optional()]))) }), async (req, res) => {
  send(res, await one(shapeTasks, req.ctx, await tasks.updateTask(req.ctx, req.valid.params.id, req.valid.body)))
})
workRouter.delete('/tasks/:id', validate({ params: id }), async (req, res) => { await tasks.deleteTask(req.ctx, req.valid.params.id); noContent(res) })
workRouter.post('/tasks/:id/restore', validate({ params: id }), async (req, res) => send(res, await one(shapeTasks, req.ctx, await tasks.restoreTask(req.ctx, req.valid.params.id))))

/* ---------- requirements ---------- */
const criteria = z.array(z.object({ text: z.string().trim().min(1).max(300), met: z.boolean().default(false) }).strict()).max(30)
const reqFields = {
  title: z.string().trim().min(1, 'Write the requirement.').max(200),
  type: z.enum(['Functional', 'Non-functional']),
  status: z.enum(['Open', 'Met']),
  verified: z.boolean(),
  milestoneId: objectId.nullable(),
  description: z.string().max(5000),
  acceptance: criteria,
  taskIds: z.array(objectId).max(200),
  fileIds: z.array(objectId).max(200),
}
workRouter.get('/requirements', validate({ query: z.object({ projectId: objectId.optional() }) }), async (req, res) => send(res, await shapeRequirements(req.ctx, await reqs.listRequirements(req.ctx, req.valid.query))))
workRouter.post('/requirements', validate({ body: body({ projectId: objectId, ...Object.fromEntries(Object.entries(reqFields).map(([k, v]) => [k, k === 'title' ? v : v.optional()])) }) }), async (req, res) => {
  send(res, await one(shapeRequirements, req.ctx, await reqs.createRequirement(req.ctx, req.valid.body)), 201)
})
workRouter.get('/requirements/:id', validate({ params: id }), async (req, res) => send(res, await one(shapeRequirements, req.ctx, await loadOne(req.ctx, RequirementModel, req.valid.params.id, 'That requirement'))))
workRouter.patch('/requirements/:id', validate({ params: id, body: body(Object.fromEntries(Object.entries(reqFields).map(([k, v]) => [k, v.optional()]))) }), async (req, res) => {
  send(res, await one(shapeRequirements, req.ctx, await reqs.updateRequirement(req.ctx, req.valid.params.id, req.valid.body)))
})
workRouter.delete('/requirements/:id', validate({ params: id }), async (req, res) => { await reqs.deleteRequirement(req.ctx, req.valid.params.id); noContent(res) })

/* ---------- recently deleted ---------- */
workRouter.get('/trash', async (req, res) => send(res, await trash.listTrash(req.ctx)))
workRouter.post('/trash/:type/:id/restore', validate({ params: z.object({ type: z.enum(['project', 'task', 'milestone', 'requirement', 'file', 'document']), id: objectId }) }), async (req, res) => {
  const { type, record } = await trash.restoreRecord(req.ctx, req.valid.params.type, req.valid.params.id)
  send(res, { type, id: String(record._id ?? record.id) })
})
