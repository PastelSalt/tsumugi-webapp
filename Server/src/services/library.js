import fs from 'node:fs'
import path from 'node:path'
import { config, LIMITS } from '../config.js'
import { AppError, conflict, notFound, unprocessable } from '../errors.js'
import { DocModel, DocVersionModel, FileModel, MilestoneModel } from '../models.js'
import { named, recordChange } from './changes.js'
import { checkMilestone, loadOne, loadProject, newId, scope } from './common.js'
import { removeLinksFor, replaceLinks } from './links.js'
import { contentMatches } from './sniff.js'
import { documentDiff } from './shape.js'
import { QUOTA_BYTES, storageUsage } from './extras.js'

// Allow-list of uploads (PLAN-B-10 section 3.1). Anything else is rejected, including HTML, scripts, and executables.
const KINDS = {
  document: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'md', 'pptx', 'epub'],
  image: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'],
  media: ['mp3', 'wav', 'ogg', 'flac', 'mp4', 'webm', 'mov', 'm4a'],
  data: ['csv', 'tsv', 'json', 'xlsx', 'ods', 'zip'],
}
const INLINE = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'pdf', 'mp3', 'wav', 'mp4', 'webm']) // svg is never inline
export const extOf = (name) => path.extname(name).slice(1).toLowerCase()
export const kindOf = (ext) => Object.keys(KINDS).find((k) => KINDS[k].includes(ext)) ?? null
// eslint-disable-next-line no-control-regex -- stripping control characters from file names is the point
const safeName = (name) => path.basename(name).replace(/[\u0000-\u001f<>:"/\\|?*]+/g, '_').slice(0, 200) || 'file'

export const workspaceDir = (ctx) => path.join(config.uploadDir, String(ctx.workspaceId))

async function syncLinks(ctx, rec, { requirementIds, taskIds }) {
  const base = { projectId: rec.projectId, type: 'File', id: rec._id }
  if (requirementIds) await replaceLinks(ctx, { ...base, relation: 'satisfies', otherType: 'Requirement', otherIds: requirementIds })
  if (taskIds) await replaceLinks(ctx, { ...base, relation: 'attached', otherType: 'Task', otherIds: taskIds })
}

export const listFiles = (ctx, { projectId } = {}) => FileModel.find(scope(ctx, projectId ? { projectId } : {})).sort({ updatedAt: -1 }).lean()
export const listDocs = (ctx, { projectId } = {}) => DocModel.find(scope(ctx, projectId ? { projectId } : {})).sort({ updatedAt: -1 }).lean()

/** Stores an uploaded file on this PC and records its metadata. `file` comes from multer (memory storage). */
export async function uploadFile(ctx, { projectId, description, tags, file }) {
  const project = await loadProject(ctx, projectId, { write: true })
  if (!file) throw unprocessable('file.missing', 'Choose a file to upload.')
  const name = safeName(file.originalname)
  const ext = extOf(name)
  const kind = kindOf(ext)
  if (!kind) throw unprocessable('file.type_not_allowed', `.${ext || 'unknown'} files are not supported. Supported: documents, images, audio/video, and data files.`)
  if (file.size > LIMITS.fileBytes) throw new AppError(413, 'file.too_large', 'That file is larger than 100 MB.')
  if (!contentMatches(ext, file.buffer)) throw unprocessable('file.content_mismatch', `That file does not look like a real .${ext} file.`)
  if ((await storageUsage(ctx)).usedBytes + file.size > QUOTA_BYTES) throw new AppError(413, 'file.quota_exceeded', 'That would go over your 1 GB of storage. Delete some files first.')
  const id = newId()
  const dir = workspaceDir(ctx)
  fs.mkdirSync(dir, { recursive: true })
  const storageKey = `${id}.${ext}` // never derived from the user's file name
  fs.writeFileSync(path.join(dir, storageKey), file.buffer)
  const rec = await FileModel.create({ _id: id, workspaceId: ctx.workspaceId, projectId: project._id, name, kind, ext, mime: file.mimetype, bytes: file.size, description: description ?? '', tags: tags ?? [], storageKey })
  await recordChange(ctx, { projectId: project._id, recordType: 'File', recordId: rec._id, action: 'uploaded', summary: `Added the file ${named(name)}` })
  return rec.toObject()
}

/** Replaces a file's contents but keeps its record, links, and history. */
export async function replaceFileBytes(ctx, id, file) {
  const rec = await loadOne(ctx, FileModel, id, 'That file')
  await loadProject(ctx, rec.projectId, { write: true })
  if (!rec.storageKey) throw unprocessable('file.no_download', 'Links have no file to replace.')
  if (!file) throw unprocessable('file.missing', 'Choose a file to upload.')
  const ext = extOf(safeName(file.originalname))
  if (ext !== rec.ext) throw unprocessable('file.type_changed', `Choose another .${rec.ext} file, or add this as a new file.`)
  if (!contentMatches(ext, file.buffer)) throw unprocessable('file.content_mismatch', `That file does not look like a real .${ext} file.`)
  const usage = await storageUsage(ctx)
  if (usage.usedBytes - rec.bytes + file.size > QUOTA_BYTES) throw new AppError(413, 'file.quota_exceeded', 'That would go over your 1 GB of storage.')
  fs.writeFileSync(path.join(workspaceDir(ctx), rec.storageKey), file.buffer)
  const updated = await FileModel.findOneAndUpdate(scope(ctx, { _id: id }), { bytes: file.size, mime: file.mimetype }, { returnDocument: 'after' }).lean()
  await recordChange(ctx, { projectId: rec.projectId, recordType: 'File', recordId: rec._id, summary: `Replaced the contents of ${named(rec.name)}` })
  return updated
}

export async function addLink(ctx, { projectId, name, url, description, tags }) {
  const project = await loadProject(ctx, projectId, { write: true })
  let host
  try { host = new URL(url).host } catch { throw unprocessable('file.bad_url', 'Enter a full web address, like https://example.com.') }
  const rec = await FileModel.create({ workspaceId: ctx.workspaceId, projectId: project._id, name, kind: 'link', ext: 'link', url, host, description: description ?? '', tags: tags ?? [] })
  await recordChange(ctx, { projectId: project._id, recordType: 'File', recordId: rec._id, action: 'uploaded', summary: `Added the link ${named(name)}` })
  return rec.toObject()
}

export async function updateFile(ctx, id, patch) {
  const rec = await loadOne(ctx, FileModel, id, 'That file')
  await loadProject(ctx, rec.projectId, { write: true })
  const { requirementIds, taskIds, ...set } = patch
  if (set.milestoneId !== undefined) set.milestoneId = await checkMilestone(ctx, MilestoneModel, rec.projectId, set.milestoneId)
  const updated = await FileModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  await syncLinks(ctx, rec, { requirementIds, taskIds })
  const summary = set.isFinal !== undefined && set.isFinal !== rec.isFinal ? (set.isFinal ? `Marked ${named(rec.name)} as the final file` : `Removed the final mark from ${named(rec.name)}`)
    : set.name && set.name !== rec.name ? `Renamed ${named(rec.name)} to ${named(set.name)}` : requirementIds || taskIds ? `Changed what ${named(rec.name)} is linked to` : null
  if (summary) await recordChange(ctx, { projectId: rec.projectId, recordType: 'File', recordId: rec._id, summary, requirementIds: requirementIds ?? [] })
  return updated
}

export async function deleteFile(ctx, id) {
  const rec = await loadOne(ctx, FileModel, id, 'That file')
  await loadProject(ctx, rec.projectId, { write: true })
  const batchId = newId()
  await FileModel.updateOne(scope(ctx, { _id: id }), { deletedAt: new Date(), deletedBatchId: batchId })
  await removeLinksFor(ctx, { $or: [{ 'a.id': rec._id }, { 'b.id': rec._id }] }, batchId)
  await recordChange(ctx, { projectId: rec.projectId, recordType: 'File', recordId: rec._id, action: 'deleted', summary: `Removed ${named(rec.name)} from the library` })
}

/** Path and headers for a download. Access is checked through the workspace scope; storage keys are never accepted from clients. */
export async function fileForDownload(ctx, id, inline) {
  const rec = await loadOne(ctx, FileModel, id, 'That file')
  if (!rec.storageKey) throw unprocessable('file.no_download', 'This is a link, not an uploaded file.')
  const full = path.join(workspaceDir(ctx), rec.storageKey)
  if (!fs.existsSync(full)) throw notFound('That file’s contents')
  return { full, name: rec.name, mime: rec.mime || 'application/octet-stream', inline: Boolean(inline && INLINE.has(rec.ext)) }
}

/* ---------- Documents (PLAN-B-11) ---------- */
const bodyProblem = (body) => (body.includes('\u0000') ? 'Documents cannot contain null characters.' : body.length > LIMITS.docBody ? 'That document is larger than 200 KB.' : null)
const normalize = (body) => body.replace(/\r\n?/g, '\n')

export async function createDoc(ctx, { projectId, title, body = '', tags, description, milestoneId }) {
  const project = await loadProject(ctx, projectId, { write: true })
  const text = normalize(body)
  const problem = bodyProblem(text)
  if (problem) throw unprocessable('document.bad_body', problem)
  const ms = await checkMilestone(ctx, MilestoneModel, project._id, milestoneId)
  const doc = await DocModel.create({ workspaceId: ctx.workspaceId, projectId: project._id, title: title || 'Untitled document', body: text, bodyBytes: Buffer.byteLength(text), tags: tags ?? [], description: description ?? '', milestoneId: ms })
  await DocVersionModel.create({ workspaceId: ctx.workspaceId, documentId: doc._id, version: 1, body: text, summary: 'Created' })
  await recordChange(ctx, { projectId: project._id, recordType: 'File', recordId: doc._id, action: 'created', summary: `Created the document ${named(doc.title)}`, fromVersion: 0, toVersion: 1 })
  return doc.toObject()
}

export async function updateDoc(ctx, id, patch) {
  const doc = await loadOne(ctx, DocModel, id, 'That document')
  await loadProject(ctx, doc.projectId, { write: true })
  const { body, baseVersion, summary, requirementIds, taskIds, ...meta } = patch
  const set = { ...meta }
  if (meta.milestoneId !== undefined) set.milestoneId = await checkMilestone(ctx, MilestoneModel, doc.projectId, meta.milestoneId)
  let newVersion = null
  if (body !== undefined) {
    if (doc.status === 'Final') throw conflict('document.final', 'This document is final. Mark it as a draft before editing.')
    if (baseVersion !== doc.currentVersion) throw new AppError(412, 'version_mismatch', 'This document changed somewhere else. Reload it to keep both sets of edits.', { current: { version: doc.currentVersion, body: doc.body } })
    const text = normalize(body)
    const problem = bodyProblem(text)
    if (problem) throw unprocessable('document.bad_body', problem)
    if (text !== doc.body) {
      newVersion = doc.currentVersion + 1
      Object.assign(set, { body: text, bodyBytes: Buffer.byteLength(text), currentVersion: newVersion })
      await DocVersionModel.create({ workspaceId: ctx.workspaceId, documentId: doc._id, version: newVersion, body: text, summary: summary ?? '' })
    }
  }
  const updated = await DocModel.findOneAndUpdate(scope(ctx, { _id: id }), { $set: set }, { returnDocument: 'after' }).lean()
  await syncLinks(ctx, doc, { requirementIds, taskIds })
  if (newVersion) await recordChange(ctx, { projectId: doc.projectId, recordType: 'File', recordId: doc._id, summary: summary || `Updated ${named(doc.title)}`, fromVersion: doc.currentVersion, toVersion: newVersion, requirementIds: requirementIds ?? [] })
  return updated
}

export async function setDocStatus(ctx, id, status) {
  const doc = await loadOne(ctx, DocModel, id, 'That document')
  await loadProject(ctx, doc.projectId, { write: true })
  if (doc.status === status) return doc
  const updated = await DocModel.findOneAndUpdate(scope(ctx, { _id: id }), { status }, { returnDocument: 'after' }).lean()
  await recordChange(ctx, { projectId: doc.projectId, recordType: 'File', recordId: doc._id, action: 'finalized', summary: status === 'Final' ? `Finalized ${named(doc.title)}` : `Moved ${named(doc.title)} back to draft` })
  return updated
}

export async function deleteDoc(ctx, id) {
  const doc = await loadOne(ctx, DocModel, id, 'That document')
  await loadProject(ctx, doc.projectId, { write: true })
  const batchId = newId()
  await DocModel.updateOne(scope(ctx, { _id: id }), { deletedAt: new Date(), deletedBatchId: batchId })
  await removeLinksFor(ctx, { $or: [{ 'a.id': doc._id }, { 'b.id': doc._id }] }, batchId)
  await recordChange(ctx, { projectId: doc.projectId, recordType: 'File', recordId: doc._id, action: 'deleted', summary: `Deleted the document ${named(doc.title)}` })
}

export async function listVersions(ctx, id) {
  await loadOne(ctx, DocModel, id, 'That document')
  return DocVersionModel.find({ workspaceId: ctx.workspaceId, documentId: id }).sort({ version: -1 }).select('-body').lean()
}

export async function getVersion(ctx, id, version) {
  await loadOne(ctx, DocModel, id, 'That document')
  const v = await DocVersionModel.findOne({ workspaceId: ctx.workspaceId, documentId: id, version }).lean()
  if (!v) throw notFound('That version')
  return v
}

export async function diffVersions(ctx, id, from, to) {
  await loadOne(ctx, DocModel, id, 'That document')
  return documentDiff(ctx, id, from, to)
}

/** Restoring an old version appends a new version with the old text; history is never rewritten. */
export async function restoreVersion(ctx, id, version) {
  const doc = await loadOne(ctx, DocModel, id, 'That document')
  const old = await getVersion(ctx, id, version)
  return updateDoc(ctx, id, { body: old.body, baseVersion: doc.currentVersion, summary: `Restored version ${version}` })
}
