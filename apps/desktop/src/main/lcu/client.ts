/**
 * LCU HTTP client — uses Node.js https directly so we can set
 * rejectUnauthorized: false for the League client's self-signed cert.
 *
 * Both helpers now reject with an LcuError on non-2xx responses so callers
 * can distinguish "endpoint not found / bad state" from network failures.
 */
import https from 'https'
import type { LcuCreds } from './lockfile'

export class LcuError extends Error {
  constructor(
    public readonly status: number,
    public readonly body:   unknown,
    message: string,
  ) { super(message) }
}

function authHeader(creds: LcuCreds): string {
  return 'Basic ' + Buffer.from(`riot:${creds.password}`).toString('base64')
}

function makeRequest<T>(options: https.RequestOptions, body?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        let parsed: unknown = null
        try { parsed = JSON.parse(data) } catch { /* keep null */ }

        const status = res.statusCode ?? 0
        if (status >= 200 && status < 300) {
          resolve(parsed as T)
        } else {
          const msg = (parsed as Record<string, unknown>)?.message as string
            ?? `LCU ${options.method} ${options.path} → ${status}`
          reject(new LcuError(status, parsed, msg))
        }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('LCU request timeout')) })
    if (body) req.write(body)
    req.end()
  })
}

export function lcuDelete(path: string, creds: LcuCreds): Promise<void> {
  return makeRequest<void>({
    hostname: '127.0.0.1',
    port: creds.port,
    path,
    method: 'DELETE',
    headers: { Authorization: authHeader(creds) },
    rejectUnauthorized: false,
  })
}

export function lcuGet<T = unknown>(path: string, creds: LcuCreds): Promise<T> {
  return makeRequest<T>({
    hostname: '127.0.0.1',
    port: creds.port,
    path,
    method: 'GET',
    headers: { Authorization: authHeader(creds) },
    rejectUnauthorized: false,
  })
}

export function lcuPost<T = unknown>(path: string, creds: LcuCreds, body?: unknown): Promise<T> {
  const bodyStr = body ? JSON.stringify(body) : ''
  return makeRequest<T>({
    hostname: '127.0.0.1',
    port: creds.port,
    path,
    method: 'POST',
    headers: {
      Authorization:    authHeader(creds),
      'Content-Type':   'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
    },
    rejectUnauthorized: false,
  }, bodyStr)
}
