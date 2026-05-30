/**
 * LCU HTTP client — uses Node.js https directly so we can set
 * rejectUnauthorized: false for the League client's self-signed cert.
 */
import https from 'https'
import type { LcuCreds } from './lockfile'

function authHeader(creds: LcuCreds): string {
  return 'Basic ' + Buffer.from(`riot:${creds.password}`).toString('base64')
}

export function lcuGet<T = unknown>(path: string, creds: LcuCreds): Promise<T> {
  return new Promise((resolve, reject) => {
    const options: https.RequestOptions = {
      hostname: '127.0.0.1',
      port: creds.port,
      path,
      method: 'GET',
      headers: { Authorization: authHeader(creds) },
      rejectUnauthorized: false,
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T) }
        catch { resolve(null as T) }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('LCU request timeout')) })
    req.end()
  })
}

export function lcuPost<T = unknown>(path: string, creds: LcuCreds, body?: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const bodyStr = body ? JSON.stringify(body) : ''
    const options: https.RequestOptions = {
      hostname: '127.0.0.1',
      port: creds.port,
      path,
      method: 'POST',
      headers: {
        Authorization: authHeader(creds),
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(bodyStr),
      },
      rejectUnauthorized: false,
    }
    const req = https.request(options, (res) => {
      let data = ''
      res.on('data', (chunk) => (data += chunk))
      res.on('end', () => {
        try { resolve(JSON.parse(data) as T) }
        catch { resolve(null as T) }
      })
    })
    req.on('error', reject)
    req.setTimeout(5000, () => { req.destroy(); reject(new Error('LCU request timeout')) })
    req.write(bodyStr)
    req.end()
  })
}
