import { Router } from 'express'
import multer from 'multer'
import { z } from 'zod'
import { LIMITS } from '../config.js'
import { body, noContent, objectId, send, tagList, validate } from '../http.js'
import { ChangeModel, DocModel } from '../models.js'
import { loadOne, scope } from '../services/common.js'
import * as lib from '../services/library.js'
import { shapeChanges, shapeLibrary } from '../services/shape.js'
import { badRequest, notFound } from '../errors.js'

export const libraryRouter = Router()
const id = z.object({ id: objectId })
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: LIMITS.fileBytes, files: 1 } })

const libraryOne = async (ctx, file, doc) => (await shapeLibrary(ctx, file ? [file] : [], doc ? [doc] : []))[0]

libraryRouter.get('/library', validate({ query: z.object({ projectId: objectId.optional() }) }), async (req, res) => {
  const [files, docs] = await Promise.all([lib.listFiles(req.ctx, req.valid.query), lib.listDocs(req.ctx, req.valid.query)])
  send(res, await shapeLibrary(req.ctx, files, docs))
})

/* ---------- files ---------- */
libraryRouter.post('/files', upload.single('file'), validate({ body: z.object({ projectId: objectId, description: z.string().max(2000).optional(), tags: z.string().max(600).optional() }) }), async (req, res) => {
  const tags = tagList.safeParse((req.valid.body.tags ?? '').split(',').map((t) => t.trim()).filter(Boolean))
  if (!tags.success) throw badRequest('Tags can be up to 30 characters each, and there can be at most 20.')
  const rec = await lib.uploadFile(req.ctx, { ...req.valid.body, tags: tags.data, file: req.file })
  send(res, await libraryOne(req.ctx, rec), 201)
})
libraryRouter.post('/files/links', validate({ body: body({ projectId: objectId, name: z.string().trim().min(1).max(200), url: z.url({ protocol: /^https?$/, message: 'Enter a web address that starts with http:// or https://.' }).max(2000), description: z.string().max(2000).optional(), tags: tagList.optional() }) }), async (req, res) => {
  send(res, await libraryOne(req.ctx, await lib.addLink(req.ctx, req.valid.body)), 201)
})
libraryRouter.patch('/files/:id', validate({ params: id, body: body({ name: z.string().trim().min(1).max(200).optional(), description: z.string().max(2000).optional(), tags: tagList.optional(), isFinal: z.boolean().optional(), milestoneId: objectId.nullable().optional(), requirementIds: z.array(objectId).max(200).optional(), taskIds: z.array(objectId).max(200).optional() }) }), async (req, res) => {
  send(res, await libraryOne(req.ctx, await lib.updateFile(req.ctx, req.valid.params.id, req.valid.body)))
})
libraryRouter.delete('/files/:id', validate({ params: id }), async (req, res) => { await lib.deleteFile(req.ctx, req.valid.params.id); noContent(res) })
libraryRouter.get('/files/:id/download', validate({ params: id, query: z.object({ inline: z.enum(['1']).optional() }) }), async (req, res) => {
  const f = await lib.fileForDownload(req.ctx, req.valid.params.id, req.valid.query.inline)
  res.setHeader('Content-Type', f.inline ? f.mime : 'application/octet-stream')
  res.setHeader('Content-Disposition', `${f.inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(f.name)}`)
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-store')
  res.sendFile(f.full)
})

/* ---------- documents ---------- */
const docMeta = {
  title: z.string().trim().min(1).max(200), description: z.string().max(2000), tags: tagList, milestoneId: objectId.nullable(),
  requirementIds: z.array(objectId).max(200), taskIds: z.array(objectId).max(200),
}
libraryRouter.post('/documents', validate({ body: body({ projectId: objectId, title: docMeta.title.optional(), body: z.string().max(LIMITS.docBody + 1000).optional(), description: docMeta.description.optional(), tags: docMeta.tags.optional(), milestoneId: docMeta.milestoneId.optional() }) }), async (req, res) => {
  send(res, await libraryOne(req.ctx, null, await lib.createDoc(req.ctx, req.valid.body)), 201)
})
libraryRouter.get('/documents/:id', validate({ params: id }), async (req, res) => send(res, await libraryOne(req.ctx, null, await loadOne(req.ctx, DocModel, req.valid.params.id, 'That document'))))
libraryRouter.patch('/documents/:id', validate({ params: id, body: body({ ...Object.fromEntries(Object.entries(docMeta).map(([k, v]) => [k, v.optional()])), body: z.string().max(LIMITS.docBody + 1000).optional(), baseVersion: z.number().int().min(1).optional(), summary: z.string().max(200).optional() }).refine((b) => b.body === undefined || b.baseVersion !== undefined, { message: 'Send baseVersion with a body so edits cannot overwrite newer text.', path: ['baseVersion'] }) }), async (req, res) => {
  send(res, await libraryOne(req.ctx, null, await lib.updateDoc(req.ctx, req.valid.params.id, req.valid.body)))
})
libraryRouter.delete('/documents/:id', validate({ params: id }), async (req, res) => { await lib.deleteDoc(req.ctx, req.valid.params.id); noContent(res) })
libraryRouter.post('/documents/:id/finalize', validate({ params: id }), async (req, res) => send(res, await libraryOne(req.ctx, null, await lib.setDocStatus(req.ctx, req.valid.params.id, 'Final'))))
libraryRouter.post('/documents/:id/unfinalize', validate({ params: id }), async (req, res) => send(res, await libraryOne(req.ctx, null, await lib.setDocStatus(req.ctx, req.valid.params.id, 'Draft'))))
libraryRouter.get('/documents/:id/versions', validate({ params: id }), async (req, res) => send(res, (await lib.listVersions(req.ctx, req.valid.params.id)).map(({ _id, ...v }) => ({ id: String(_id), ...v, documentId: String(v.documentId), workspaceId: undefined }))))
libraryRouter.get('/documents/:id/versions/:version', validate({ params: id.extend({ version: z.coerce.number().int().min(1) }) }), async (req, res) => {
  const v = await lib.getVersion(req.ctx, req.valid.params.id, req.valid.params.version)
  send(res, { version: v.version, body: v.body, summary: v.summary, createdAt: v.createdAt })
})
libraryRouter.post('/documents/:id/versions/:version/restore', validate({ params: id.extend({ version: z.coerce.number().int().min(1) }) }), async (req, res) => {
  send(res, await libraryOne(req.ctx, null, await lib.restoreVersion(req.ctx, req.valid.params.id, req.valid.params.version)))
})
libraryRouter.get('/documents/:id/diff', validate({ params: id, query: z.object({ from: z.coerce.number().int().min(0), to: z.coerce.number().int().min(1) }) }), async (req, res) => {
  send(res, await lib.diffVersions(req.ctx, req.valid.params.id, req.valid.query.from, req.valid.query.to))
})
libraryRouter.get('/documents/:id/export', validate({ params: id }), async (req, res) => {
  const doc = await loadOne(req.ctx, DocModel, req.valid.params.id, 'That document')
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8')
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(`${doc.title}.md`)}`)
  res.send(doc.body)
})

/* ---------- changes (history) ---------- */
libraryRouter.get('/changes', validate({ query: z.object({ projectId: objectId.optional(), recordId: objectId.optional(), limit: z.coerce.number().int().min(1).max(200).optional() }) }), async (req, res) => {
  const { projectId, recordId, limit = 100 } = req.valid.query
  const rows = await ChangeModel.find(scope(req.ctx, { ...(projectId && { projectId }), ...(recordId && { recordId }) })).sort({ at: -1 }).limit(limit).lean()
  send(res, await shapeChanges(req.ctx, rows))
})
libraryRouter.patch('/changes/:id', validate({ params: id, body: body({ reviewed: z.boolean() }) }), async (req, res) => {
  const row = await ChangeModel.findOneAndUpdate(scope(req.ctx, { _id: req.valid.params.id }), { reviewed: req.valid.body.reviewed }, { returnDocument: 'after' }).lean()
  if (!row) throw notFound('That change')
  send(res, (await shapeChanges(req.ctx, [row]))[0])
})

