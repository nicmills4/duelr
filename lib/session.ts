import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { redis } from "./redis";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "fallback-dev-secret-do-not-use-in-prod"
);

const COOKIE_NAME     = "mt_session";
const SESSION_TTL_DAYS = 7;
// Cache validated sessions in Redis for 60 s — dramatically reduces Postgres
// load under concurrent traffic while keeping invalidation lag acceptable.
const SESSION_CACHE_TTL = 60;

function sessionCacheKey(id: string) {
  return `session_cache:${id}`;
}

export async function createSession(userId: string): Promise<string> {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 86_400_000);

  const record = await prisma.session.create({
    data: { userId, expiresAt },
  });

  const jwt = await new SignJWT({ sessionId: record.id })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(SECRET);

  const cookieStore = await cookies();
  cookieStore.set(COOKIE_NAME, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: expiresAt,
    path: "/",
  });

  return record.id;
}

export async function getSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    const sessionId = payload.sessionId as string;

    // ── Redis cache hit ──────────────────────────────────────────────────────
    const cached = await redis.get(sessionCacheKey(sessionId));
    if (cached) {
      const session = JSON.parse(cached);
      // Guard against a stale cache entry for an expired session
      if (new Date(session.expiresAt) > new Date()) return session;
    }

    // ── Postgres fallback ────────────────────────────────────────────────────
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) return null;

    // Strip passwordHash before caching — never store it in Redis
    const { passwordHash: _pw, ...safeUser } = session.user as typeof session.user & { passwordHash?: string };
    const safeSession = { ...session, user: safeUser };

    // Populate cache for the next 60 s
    await redis.setex(sessionCacheKey(sessionId), SESSION_CACHE_TTL, JSON.stringify(safeSession));

    return safeSession;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, SECRET);
      const sessionId = payload.sessionId as string;
      // Invalidate the Redis cache immediately so the session can't be
      // reused for the remaining cache window after logout.
      await redis.del(sessionCacheKey(sessionId));
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    } catch {}
  }

  cookieStore.delete(COOKIE_NAME);
}
