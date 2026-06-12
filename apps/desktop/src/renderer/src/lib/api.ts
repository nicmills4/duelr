/**
 * Thin wrapper over fetch that points to the Duelr API.
 * Since Electron injects the correct Origin header, CORS is handled transparently.
 * Cookies are managed by Chromium's session.
 */
import { API_BASE } from './constants'

export interface ApiResponse<T = unknown> {
  data: T
  status: number
  ok: boolean
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<ApiResponse<T>> {
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      credentials: 'include',
      signal: AbortSignal.timeout(15_000),
    })
  } catch {
    // Network failure (offline, DNS, timeout, connection reset). Return a
    // synthetic non-ok response so callers' `!ok` paths handle it — fetch
    // rejecting here must never propagate as a throw to UI code.
    return { data: null as T, status: 0, ok: false }
  }

  let data: T
  try {
    data = (await res.json()) as T
  } catch {
    data = null as T
  }

  return { data, status: res.status, ok: res.ok }
}

const api = {
  get:    <T = unknown>(path: string)                  => request<T>('GET',    path),
  post:   <T = unknown>(path: string, body?: unknown)  => request<T>('POST',   path, body),
  patch:  <T = unknown>(path: string, body?: unknown)  => request<T>('PATCH',  path, body),
  delete: <T = unknown>(path: string)                  => request<T>('DELETE', path),
}

export default api
