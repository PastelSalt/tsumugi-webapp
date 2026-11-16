export class AppError extends Error {
  constructor(status, code, message, details) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
}
export const badRequest = (message = 'Some fields need attention.', details) => new AppError(400, 'validation_failed', message, details)
export const unauthenticated = (message = 'Please log in.') => new AppError(401, 'unauthenticated', message)
export const notFound = (what = 'That') => new AppError(404, 'not_found', `${what} was not found.`)
export const conflict = (code, message) => new AppError(409, code, message)
export const unprocessable = (code, message, details) => new AppError(422, code, message, details)
