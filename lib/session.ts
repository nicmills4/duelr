import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";
import { redis } from "./redis";

/** Lazy secret — evaluated at request time, not at build/module-load time. */
function getSecret(): Uint8Array {
  if (process.env.NODE_ENV === "production" && !process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET env var is required in production — set it in Railway/your host.");
  }
  return new TextEncoder().encode(
    process.env.SESSION_SECRET || "fallback-dev-secret-do-not-use-in-prod"
  );
}

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
    .sign(getSecret());

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
    const { payload } = await jwtVerify(token, getSecret());
    const sessionId = payload.sessionId as string;

    // ── Redis cache hit ──────────────────────────────────────────────────────
    const cached = await redis.get(sessionCacheKey(sessionId));
    if (cached) {
      const session = JSON.parse(cached);
      // Guard against a stale cache entry for an expired session
      if (new Date(session.expiresAt) > new Date()) return session;
    }

    // ── Postgres fallback ────────────────────────────────────────────────────
    // Use select (not include) so passwordHash is never fetched from the DB at all.
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      select: {
        id:        true,
        userId:    true,
        expiresAt: true,
        createdAt: true,
        user: {
          select: {
            id:                  true,
            riotId:              true,
            puuid:               true,
            region:              true,
            createdAt:           true,
            updatedAt:           true,
            accountType:         true,
            email:               true,
            emailVerified:       true,
            isPremium:           true,
            stripeCustomerId:    true,
            stripeSubscriptionId: true,
            // passwordHash intentionally excluded
          },
        },
      },
    });

    if (!session || session.expiresAt < new Date()) return null;

    // Populate cache for the next 60 s
    await redis.setex(sessionCacheKey(sessionId), SESSION_CACHE_TTL, JSON.stringify(session));

    return session;
  } catch {
    return null;
  }
}

export async function deleteSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;

  if (token) {
    try {
      const { payload } = await jwtVerify(token, getSecret());
      const sessionId = payload.sessionId as string;
      // Invalidate the Redis cache immediately so the session can't be
      // reused for the remaining cache window after logout.
      await redis.del(sessionCacheKey(sessionId));
      await prisma.session.delete({ where: { id: sessionId } }).catch(() => {});
    } catch {}
  }

  cookieStore.delete(COOKIE_NAME);
}
