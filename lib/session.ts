import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "./prisma";

const SECRET = new TextEncoder().encode(
  process.env.SESSION_SECRET || "fallback-dev-secret-do-not-use-in-prod"
);

const COOKIE_NAME = "mt_session";
const SESSION_TTL_DAYS = 7;

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

    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) return null;
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
      const { payload } = await jwtVerify(token, SECRET);
      await prisma.session.delete({ where: { id: payload.sessionId as string } }).catch(() => {});
    } catch {}
  }

  cookieStore.delete(COOKIE_NAME);
}
