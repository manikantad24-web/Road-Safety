// Thin client for the RoadGuardian REST API. Every screen reads and writes through these functions.
const BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'network_error', details } = {}) {
    super(message)
    this.status = status
    this.code = code
    this.details = details
  }
  /** Map server validation details to { field: message }. */
  get fieldErrors() {
    const out = {}
    if (Array.isArray(this.details)) {
      for (const d of this.details) if (d.field) out[d.field] = d.message
    }
    return out
  }
}

export const assetUrl = (path) => (path ? `${BASE}${path}` : null)

function safeStorage(kind) {
  try {
    const s = window[kind]
    s.setItem('__t', '1')
    s.removeItem('__t')
    return s
  } catch {
    const mem = new Map()
    return { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) }
  }
}
export const local = safeStorage('localStorage')
export const session = safeStorage('sessionStorage')

/** Anonymous per-browser id used only to stop duplicate community votes (best effort, not an account). */
export function clientId() {
  let id = local.getItem('rg_client_id')
  if (!id) {
    id = (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`).slice(0, 64)
    local.setItem('rg_client_id', id)
  }
  return id
}

async function request(path, { method = 'GET', json, form, headers = {}, signal } = {}) {
  const init = { method, signal, headers: { Accept: 'application/json', ...headers } }
  if (json !== undefined) {
    init.body = JSON.stringify(json)
    init.headers['Content-Type'] = 'application/json'
  } else if (form) {
    init.body = form
  }
  let res
  try {
    res = await fetch(`${BASE}${path}`, init)
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the RoadGuardian API. Check that the backend is running.', { code: 'network_error' })
  }
  let data = null
  const text = await res.text()
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = null
    }
  }
  if (!res.ok) {
    const err = data?.error
    throw new ApiError(err?.message || `Request failed (HTTP ${res.status}).`, {
      status: res.status,
      code: err?.code || 'http_error',
      details: err?.details,
    })
  }
  return data
}

const qs = (params = {}) => {
  const u = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '' && v !== false) u.set(k, String(v))
  })
  const s = u.toString()
  return s ? `?${s}` : ''
}

export const api = {
  health: (signal) => request('/api/health', { signal }),
  stats: (params, signal) => request(`/api/stats${qs(params)}`, { signal }),
  listHazards: (params, signal) => request(`/api/hazards${qs(params)}`, { signal }),
  getHazard: (id, signal) => request(`/api/hazards/${id}`, { signal }),
  createHazard: (body) => request('/api/hazards', { method: 'POST', json: body }),
  detect: (file) => {
    const form = new FormData()
    form.append('file', file)
    return request('/api/detect', { method: 'POST', form })
  },
  verify: (id, vote, note = '') =>
    request(`/api/hazards/${id}/verify`, { method: 'POST', json: { vote, note }, headers: { 'X-Client-Id': clientId() } }),
  setStatus: (id, status, note, adminToken) =>
    request(`/api/hazards/${id}/status`, { method: 'PATCH', json: { status, note }, headers: { 'X-Admin-Token': adminToken } }),
  compareRoutes: (origin, destination, signal) => request('/api/routes/compare', { method: 'POST', json: { origin, destination }, signal }),
}
