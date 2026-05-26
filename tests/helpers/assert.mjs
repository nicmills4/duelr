/**
 * Tiny assertion helpers — throw plain Error on failure so runner catches them.
 * Throw a SkipError (via skip()) to mark a test as skipped at runtime.
 */

export class SkipError extends Error {
  constructor(reason) {
    super(reason);
    this.name  = "SkipError";
    this.isSkip = true;
  }
}

/**
 * Call inside a test's run() to skip it at runtime (e.g. when an upstream
 * dependency like the Riot API is unavailable). Counts as "skipped" in the
 * results, not "failed".
 */
export function skip(reason = "Skipped at runtime") {
  throw new SkipError(reason);
}

export function assert(condition, message) {
  if (!condition) throw new Error(message ?? "Assertion failed");
}

export function assertEqual(actual, expected, label = "") {
  if (actual !== expected)
    throw new Error(`${label ? label + ": " : ""}expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}

export function assertStatus(res, expected, hint = "") {
  if (res.status !== expected)
    throw new Error(
      `Expected HTTP ${expected}, got ${res.status}${hint ? ` (${hint})` : ""}`
    );
}

export function assertOk(data, hint = "") {
  if (!data?.ok)
    throw new Error(`Expected { ok: true }${hint ? ` for ${hint}` : ""}, got: ${JSON.stringify(data)}`);
}

export function assertHasKeys(obj, keys, label = "") {
  for (const k of keys) {
    if (!(k in obj))
      throw new Error(`${label ? label + ": " : ""}missing key "${k}" in ${JSON.stringify(obj)}`);
  }
}

export function assertArray(val, label = "") {
  if (!Array.isArray(val))
    throw new Error(`${label ? label + ": " : ""}expected array, got ${typeof val}`);
}
