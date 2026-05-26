import { NextRequest, NextResponse } from "next/server";
import { createAdminSession, deleteAdminSession } from "@/lib/admin-auth";

export async function POST(req: NextRequest) {
  const { password } = await req.json().catch(() => ({}));
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminPassword) {
    return NextResponse.json({ error: "ADMIN_PASSWORD not configured" }, { status: 500 });
  }
  if (!password || password !== adminPassword) {
    return NextResponse.json({ error: "Incorrect password" }, { status: 401 });
  }

  await createAdminSession();
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  await deleteAdminSession();
  return NextResponse.json({ ok: true });
}
