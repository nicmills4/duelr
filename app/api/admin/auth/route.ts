import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";
import { createAdminSession, deleteAdminSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }
  if (!password) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  // Use HMAC to normalise both values to a fixed-length digest before comparing
  // so timingSafeEqual never throws on length mismatch and no length information leaks.
  const hmacKey = process.env.SESSION_SECRET ?? "admin-timing-key";
  const inputDigest = createHmac("sha256", hmacKey).update(String(password)).digest();
  const adminDigest = createHmac("sha256", hmacKey).update(adminPassword).digest();
  if (!timingSafeEqual(inputDigest, adminDigest)) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await deleteAdminSession();
  return NextResponse.json({ ok: true });
}
