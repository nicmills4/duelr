import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [queueCount, lobbyCount] = await Promise.all([
      prisma.queueEntry.count(),
      redis.scard("lobby:members"),
    ]);
    return NextResponse.json({ count: queueCount + lobbyCount });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
