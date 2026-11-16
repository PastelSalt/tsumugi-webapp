// Small API client (PLAN-B-17 section 3.1). Same-origin `/api/v1`, cookie session, JSON envelope unwrapping.
const BASE = '/api/v1'

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message || 'Something went wrong. Please try again.')
    this.status = status
    this.code = body?.error?.code || 'unknown'
    this.details = body?.error?.details
  }

  /** Maps server field errors ({ path, message }) to { path: message } for forms. */
  get fields() {
    return Array.isArray(this.details) ? Object.fromEntries(this.details.map((d) => [d.path, d.message])) : {}
  }
}

async function request(method, path, { body, query } = {}) {
  const url = new URL(`${BASE}${path}`, window.location.origin)
  Object.entries(query ?? {}).forEach(([k, v]) => v != null && url.searchParams.set(k, v))
  const isForm = body instanceof FormData
  let response
  try {
    response = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body && !isForm ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? (isForm ? body : JSON.stringify(body)) : undefined,
    })
  } catch {
    throw new ApiError(0, { error: { code: 'network', message: 'Can’t reach Tsumugi right now. Check that the server is running.' } })
  }
  if (response.status === 204) return null
  const json = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, json)
  return json?.data ?? null
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  delete: (path) => request('DELETE', path),
}
