/**
 * Tiny assertion helpers — throw plain Error on failure so runner catches them.
 */

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
