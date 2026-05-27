/**
 * Admin session helpers.
 * Protected by ADMIN_PASSWORD env var — set it in your local .env and in Railway.
 * Admin JWTs are signed with the same SESSION_SECRET but carry { admin: true }.
 */

import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

/** Lazy secret — evaluated at request time, not at build/module-load time. */
function getSecret(): Uint8Array {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET env var is required in production — set it in Railway/your host.");
  }
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "fallback-dev-secret-do-not-use-in-prod"
  );
}
const COOKIE_NAME = "duelr_admin";
const TTL_HOURS   = 12;

export async function createAdminSession(): Promise<void> {
  const jwt = await new SignJWT({ admin: true })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${TTL_HOURS}h`)
    .sign(getSecret());

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure:   process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge:   TTL_HOURS * 3600,
    path:     "/",   // must be "/" so browser sends it to /api/admin/* routes too
  });
}

export async function verifyAdminSession(): Promise<boolean> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(COOKIE_NAME)?.value;
    if (!token) return false;
    const { payload } = await jwtVerify(token, getSecret());
    return payload.admin === true;
  } catch {
    return false;
  }
}

export async function deleteAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  // Must match the path used in createAdminSession to actually clear the cookie
  cookieStore.set(COOKIE_NAME, "", { maxAge: 0, path: "/" });
}
