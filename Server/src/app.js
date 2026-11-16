import cookieParser from 'cookie-parser'
import express from 'express'
import { ZodError } from 'zod'
import { AppError } from './errors.js'
import { originCheck, requireAuth, sessionLoader } from './middleware.js'
import { authRouter } from './routes/auth.js'
import { extrasRouter } from './routes/extras.js'
import { libraryRouter } from './routes/library.js'
import { workRouter } from './routes/work.js'
import { config } from './config.js'

export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  app.set('trust proxy', 'loopback')

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Cache-Control', 'no-store')
    // API responses are JSON, never pages: lock everything down (PLAN-B-14 section 5). Inline file previews override this.
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'")
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Cross-Origin-Resource-Policy', 'same-site')
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()')
    if (config.env === 'production') res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains')
    res.setHeader('X-Request-Id', Math.random().toString(36).slice(2, 10))
    next()
  })
  app.use(express.json({ limit: '1mb', strict: true }))
  app.use(cookieParser())
  app.use(originCheck)

  const api = express.Router()
  api.get('/health', (_req, res) => res.json({ data: { status: 'ok' } }))
  api.use(sessionLoader)
  api.use(authRouter) // register/login/logout/session handle their own auth needs
  api.use(requireAuth)
  api.use(extrasRouter) // before workRouter: /projects/recent and /projects/by-slug must win over /projects/:id
  api.use(workRouter)
  api.use(libraryRouter)
  app.use('/api/v1', api)

  app.use('/api', (_req, _res, next) => next(new AppError(404, 'not_found', 'That endpoint does not exist.')))

  app.use((error, req, res, _next) => {
    const details = error instanceof AppError ? error.details : undefined
    let { status = 500, code = 'internal_error', message = 'Something went wrong on our side.' } = error instanceof AppError ? error : {}
    if (error instanceof ZodError) ({ status, code, message } = { status: 400, code: 'validation_failed', message: 'Some fields need attention.' })
    else if (error?.type === 'entity.parse.failed') ({ status, code, message } = { status: 400, code: 'invalid_json', message: 'The request body is not valid JSON.' })
    else if (error?.type === 'entity.too.large') ({ status, code, message } = { status: 413, code: 'payload_too_large', message: 'That request is too large.' })
    else if (error?.name === 'MulterError') ({ status, code, message } = { status: error.code === 'LIMIT_FILE_SIZE' ? 413 : 400, code: error.code === 'LIMIT_FILE_SIZE' ? 'file.too_large' : 'file.upload_failed', message: error.code === 'LIMIT_FILE_SIZE' ? 'That file is larger than 100 MB.' : 'The upload could not be read.' })
    else if (error?.name === 'CastError') ({ status, code, message } = { status: 404, code: 'not_found', message: 'That record was not found.' })
    else if (error?.name === 'ValidationError' && error?.errors) ({ status, code, message } = { status: 400, code: 'validation_failed', message: 'Some fields need attention.' })
    else if (!(error instanceof AppError)) console.error(`[${req.method} ${req.path}]`, config.env === 'test' ? error.message : error)
    if (error?.code === 11000) ({ status, code, message } = { status: 409, code: 'duplicate', message: 'That already exists.' })
    if (status === 429 && details?.retryAfterSeconds) res.setHeader('Retry-After', String(details.retryAfterSeconds))
    res.status(status).json({ error: { code, message, ...(details ? { details } : {}) } })
  })
  return app
}
