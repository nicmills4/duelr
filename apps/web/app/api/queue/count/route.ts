import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import type { LobbyGroup } from "@/lib/lobby-types";
import { ALL_SLOTS } from "@/lib/lobby-types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Fetch all three data sources in parallel
    const [queueCount, lobbyMemberIds, groupIds] = await Promise.all([
      prisma.queueEntry.count(),
      redis.smembers("lobby:members"),
      redis.smembers("lobby:groups"),
    ]);

    // ── 1v1 open lobby ────────────────────────────────────────────────────────
    // Verify each member's individual key still exists — the set itself has no
    // TTL, so expired members linger until getLobbyPlayers() cleans them.
    let lobbyCount = 0;
    if (lobbyMemberIds.length > 0) {
      const values = await redis.mget(
        ...lobbyMemberIds.map((uid) => `lobby:player:${uid}`)
      );
      const stale: string[] = [];
      values.forEach((v, i) => {
        if (v) lobbyCount++;
        else stale.push(lobbyMemberIds[i]);
      });
      if (stale.length) redis.srem("lobby:members", ...stale).catch(() => {});
    }

    // ── 2v2 group lobby ───────────────────────────────────────────────────────
    // Count every filled slot across all active groups.
    let groupCount = 0;
    if (groupIds.length > 0) {
      const raws = await redis.mget(
        ...groupIds.map((gid) => `lobby:group:${gid}`)
      );
      const staleGroups: string[] = [];
      raws.forEach((raw, i) => {
        if (!raw) { staleGroups.push(groupIds[i]); return; }
        const group = JSON.parse(raw) as LobbyGroup;
        for (const k of ALL_SLOTS) {
          if (group[k] != null) groupCount++;
        }
      });
      if (staleGroups.length) {
        redis.srem("lobby:groups", ...staleGroups).catch(() => {});
      }
    }

    return NextResponse.json({ count: queueCount + lobbyCount + groupCount });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
