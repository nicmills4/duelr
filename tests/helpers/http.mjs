/**
 * Minimal HTTP client with a built-in cookie jar.
 * Tracks Set-Cookie headers automatically so auth flows work end-to-end.
 */

export const BASE_URL = process.env.TEST_URL ?? "http://localhost:3000";

export class HttpClient {
  #jar = new Map(); // name → value

  /** Parse and store cookies from a response */
  #ingest(res) {
    // Node 18.14+ exposes getSetCookie(); fall back to splitting the header.
    const raw =
      typeof res.headers.getSetCookie === "function"
        ? res.headers.getSetCookie()
        : (res.headers.get("set-cookie") ?? "").split(/,(?=[^ ])/).filter(Boolean);

    for (const entry of raw) {
      const [kv] = entry.split(";");
      const eq   = kv.indexOf("=");
      if (eq === -1) continue;
      const key = kv.slice(0, eq).trim();
      const val = kv.slice(eq + 1).trim();
      if (val) this.#jar.set(key, val);
      else      this.#jar.delete(key);
    }
  }

  /** Compose Cookie header from jar */
  #cookieHeader() {
    return [...this.#jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  async request(path, options = {}) {
    const cookie = this.#cookieHeader();
    const res = await fetch(`${BASE_URL}${path}`, {
      ...options,
      headers: {
        ...(options.body != null ? { "Content-Type": "application/json" } : {}),
        ...options.headers,
        ...(cookie ? { Cookie: cookie } : {}),
      },
    });
    this.#ingest(res);
    return res;
  }

  async json(path, options = {}) {
    const res  = await this.request(path, options);
    const data = await res.json().catch(() => null);
    return { res, data };
  }

  get(path)        { return this.json(path); }
  delete(path)     { return this.json(path, { method: "DELETE" }); }
  post(path, body) { return this.json(path, { method: "POST",  body: body != null ? JSON.stringify(body) : undefined }); }
  patch(path, body){ return this.json(path, { method: "PATCH", body: body != null ? JSON.stringify(body) : undefined }); }

  clearCookies()   { this.#jar.clear(); }
  hasCookie(name)  { return this.#jar.has(name); }
}
