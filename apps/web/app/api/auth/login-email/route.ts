import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createSession } from "@/lib/session";
import { verifyPassword } from "@/lib/auth";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    if (!body) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const { email, password } = body as Record<string, string>;

    if (!email || !password)
      return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // Constant-time: always attempt verify even if no user found (prevents timing attacks)
    const valid = user?.passwordHash
      ? await verifyPassword(password, user.passwordHash)
      : false;

    if (!user || !valid) {
      return NextResponse.json({ error: "Incorrect email or password" }, { status: 401 });
    }

    await createSession(user.id);

    // userId lets clients (desktop) populate auth state immediately on login so
    // self-filtering works before the next /api/me hydration.
    return NextResponse.json({ ok: true, userId: user.id, riotId: user.riotId });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
