import mongoose from 'mongoose'

const { Schema } = mongoose
const oid = (ref, extra = {}) => ({ type: Schema.Types.ObjectId, ref, ...extra })
const opts = { strict: 'throw', versionKey: false, minimize: false }

/** Fields every workspace-owned record has (PLAN-B-03 section 2.1). */
const record = (fields, { timestamps = true } = {}) => {
  const schema = new Schema(
    {
      workspaceId: oid('Workspace', { required: true, index: true }),
      deletedAt: { type: Date, default: null },
      deletedBatchId: { type: Schema.Types.ObjectId, default: null },
      ...fields,
    },
    { ...opts, timestamps },
  )
  return schema
}

const subtask = new Schema({ text: { type: String, required: true, maxlength: 200 }, done: { type: Boolean, default: false } }, opts)
const criterion = new Schema({ text: { type: String, required: true, maxlength: 300 }, met: { type: Boolean, default: false } }, opts)

const User = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, maxlength: 60 },
    workspaceId: oid('Workspace'),
    status: { type: String, enum: ['active', 'disabled'], default: 'active' },
    termsAcceptedAt: Date,
    preferences: {
      theme: { type: String, enum: ['system', 'light', 'dark'], default: 'system' },
      weekStart: { type: String, enum: ['monday', 'sunday'], default: 'monday' },
      shortcuts: { type: Boolean, default: true },
      motion: { type: String, enum: ['system', 'reduced'], default: 'system' },
      timeZone: { type: String, default: 'UTC' },
      firstRunDismissed: { type: Boolean, default: false },
    },
    failedLogins: { count: { type: Number, default: 0 }, lockedUntil: { type: Date, default: null } },
    lastLoginAt: Date,
  },
  { ...opts, timestamps: true },
)

const Session = new Schema(
  {
    userId: oid('User', { required: true, index: true }),
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    lastSeenAt: Date,
    userAgent: { type: String, maxlength: 200 },
  },
  { ...opts, timestamps: { createdAt: true, updatedAt: false } },
)

const Workspace = new Schema(
  { type: { type: String, enum: ['individual'], default: 'individual' }, name: { type: String, required: true, maxlength: 60 }, ownerId: oid('User', { required: true }) },
  { ...opts, timestamps: true },
)

const Project = record({
  name: { type: String, required: true, maxlength: 120 },
  slug: { type: String, required: true },
  category: { type: String, default: 'Other', maxlength: 40 },
  kind: { type: String, enum: ['software', 'creative', 'research', 'multimedia', 'blank'], default: 'blank' },
  status: { type: String, enum: ['Planning', 'Active', 'On hold', 'Done'], default: 'Planning' },
  tone: { type: String, default: 'pink' },
  tags: [{ type: String, maxlength: 30 }],
  description: { type: String, default: '', maxlength: 5000 },
  objective: { type: String, default: '', maxlength: 1000 },
  start: String,
  end: String,
  phases: [{ type: String, maxlength: 40 }],
  phaseIndex: { type: Number, default: 0 },
  lastOpenedAt: Date,
  archivedAt: { type: Date, default: null },
})
Project.index({ workspaceId: 1, slug: 1 })
Project.index({ workspaceId: 1, archivedAt: 1, updatedAt: -1 })

const Milestone = record({
  projectId: oid('Project', { required: true }),
  title: { type: String, required: true, maxlength: 160 },
  description: { type: String, default: '', maxlength: 2000 },
  start: { type: String, required: true },
  due: { type: String, required: true },
  phase: { type: Number, default: 0 },
  done: { type: Boolean, default: false },
  doneAt: Date,
  blocked: { type: Boolean, default: false },
  afterId: oid('Milestone', { default: null }),
})
Milestone.index({ workspaceId: 1, projectId: 1, due: 1 })

const Task = record({
  projectId: oid('Project', { required: true }),
  milestoneId: oid('Milestone', { default: null }),
  title: { type: String, required: true, maxlength: 200 },
  notes: { type: String, default: '', maxlength: 20000 },
  status: { type: String, enum: ['To do', 'Doing', 'Done'], default: 'To do' },
  priority: { type: String, enum: ['normal', 'high'], default: 'normal' },
  due: { type: String, default: null },
  blocked: { type: Boolean, default: false },
  completedAt: Date,
  subtasks: [subtask],
  order: { type: Number, default: 0 },
  recurrence: { type: new Schema({ freq: { type: String, enum: ['daily', 'weekly', 'monthly', 'yearly'], required: true }, interval: { type: Number, min: 1, max: 30, default: 1 } }, { ...opts, _id: false }), default: null },
  seriesId: { type: Schema.Types.ObjectId, default: null },
})
Task.index({ workspaceId: 1, projectId: 1, status: 1, due: 1 })
Task.index({ workspaceId: 1, status: 1, due: 1 })

const Requirement = record({
  projectId: oid('Project', { required: true }),
  key: { type: String, required: true },
  title: { type: String, required: true, maxlength: 200 },
  type: { type: String, enum: ['Functional', 'Non-functional'], default: 'Functional' },
  status: { type: String, enum: ['Open', 'Met'], default: 'Open' },
  verified: { type: Boolean, default: false },
  milestoneId: oid('Milestone', { default: null }),
  description: { type: String, default: '', maxlength: 5000 },
  acceptance: [criterion],
})
Requirement.index({ workspaceId: 1, projectId: 1, key: 1 })

const File = record({
  projectId: oid('Project', { required: true }),
  name: { type: String, required: true, maxlength: 200 },
  kind: { type: String, enum: ['document', 'image', 'media', 'data', 'link'], default: 'document' },
  ext: { type: String, default: '' },
  mime: { type: String, default: '' },
  bytes: { type: Number, default: 0 },
  tags: [{ type: String, maxlength: 30 }],
  description: { type: String, default: '', maxlength: 2000 },
  isFinal: { type: Boolean, default: false },
  milestoneId: oid('Milestone', { default: null }),
  storageKey: { type: String, default: null },
  url: { type: String, default: null },
  host: { type: String, default: null },
})
File.index({ workspaceId: 1, projectId: 1, updatedAt: -1 })

const Doc = record({
  projectId: oid('Project', { required: true }),
  title: { type: String, required: true, maxlength: 200 },
  status: { type: String, enum: ['Draft', 'Final'], default: 'Draft' },
  tags: [{ type: String, maxlength: 30 }],
  description: { type: String, default: '', maxlength: 2000 },
  milestoneId: oid('Milestone', { default: null }),
  currentVersion: { type: Number, default: 1 },
  body: { type: String, default: '' },
  bodyBytes: { type: Number, default: 0 },
})
Doc.index({ workspaceId: 1, projectId: 1, updatedAt: -1 })

const DocVersion = new Schema(
  {
    workspaceId: oid('Workspace', { required: true }),
    documentId: oid('Doc', { required: true }),
    version: { type: Number, required: true },
    body: { type: String, default: '' },
    summary: { type: String, default: '', maxlength: 200 },
  },
  { ...opts, timestamps: { createdAt: true, updatedAt: false } },
)
DocVersion.index({ documentId: 1, version: 1 }, { unique: true })

const Change = record(
  {
    projectId: oid('Project', { required: true }),
    at: { type: Date, required: true },
    summary: { type: String, required: true, maxlength: 240 },
    recordType: { type: String, enum: ['Project', 'Milestone', 'Task', 'Requirement', 'File'], required: true },
    recordId: { type: Schema.Types.ObjectId, required: true },
    action: { type: String, default: 'updated' },
    reviewed: { type: Boolean, default: false },
    fromVersion: Number,
    toVersion: Number,
  },
  { timestamps: false },
)
Change.index({ workspaceId: 1, projectId: 1, at: -1 })

const endpoint = { type: { type: String, required: true }, id: { type: Schema.Types.ObjectId, required: true } }
const Link = new Schema(
  {
    workspaceId: oid('Workspace', { required: true }),
    projectId: oid('Project', { required: true }),
    relation: { type: String, enum: ['implements', 'satisfies', 'attached', 'affects'], required: true },
    a: endpoint,
    b: endpoint,
    deletedAt: { type: Date, default: null },
    deletedBatchId: { type: Schema.Types.ObjectId, default: null },
  },
  { ...opts, timestamps: { createdAt: true, updatedAt: false } },
)
Link.index({ workspaceId: 1, 'a.type': 1, 'a.id': 1 })
Link.index({ workspaceId: 1, 'b.type': 1, 'b.id': 1 })

const Audit = new Schema(
  { userId: oid('User', { index: true }), event: { type: String, required: true }, ip: String, userAgent: { type: String, maxlength: 120 }, meta: { type: String, maxlength: 200 }, at: { type: Date, default: Date.now, index: true } },
  { ...opts, timestamps: false },
)

const Counter = new Schema({ scope: { type: String, required: true, unique: true }, seq: { type: Number, default: 0 } }, opts)

const model = (name, schema) => mongoose.models[name] || mongoose.model(name, schema)
export const Models = {
  User: model('User', User),
  Session: model('Session', Session),
  Workspace: model('Workspace', Workspace),
  Project: model('Project', Project),
  Milestone: model('Milestone', Milestone),
  Task: model('Task', Task),
  Requirement: model('Requirement', Requirement),
  File: model('File', File),
  Doc: model('Doc', Doc),
  DocVersion: model('DocVersion', DocVersion),
  Change: model('Change', Change),
  Link: model('Link', Link),
  Counter: model('Counter', Counter),
  Audit: model('Audit', Audit),
}
export const { User: UserModel, Session: SessionModel, Workspace: WorkspaceModel, Project: ProjectModel, Milestone: MilestoneModel, Task: TaskModel, Requirement: RequirementModel, File: FileModel, Doc: DocModel, DocVersion: DocVersionModel, Change: ChangeModel, Link: LinkModel, Counter: CounterModel, Audit: AuditModel } = Models
