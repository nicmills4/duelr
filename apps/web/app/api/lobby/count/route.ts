import { NextResponse } from "next/server";
import { redis } from "@/lib/redis";
import type { LobbyGroup } from "@/lib/lobby-types";
import { ALL_SLOTS } from "@/lib/lobby-types";

export const dynamic = "force-dynamic";

/** Live count of players currently available — 1v1 open lobby + filled 2v2 slots. */
export async function GET() {
  try {
    const [lobbyMemberIds, groupIds] = await Promise.all([
      redis.smembers("lobby:members"),
      redis.smembers("lobby:groups"),
    ]);

    // ── 1v1 open lobby ────────────────────────────────────────────────────────
    // The members set has no TTL, so verify each player's key still exists;
    // expired members linger until getLobbyPlayers() cleans them.
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

    // ── 2v2 group lobby — count every filled slot ─────────────────────────────
    let groupCount = 0;
    if (groupIds.length > 0) {
      const raws = await redis.mget(...groupIds.map((gid) => `lobby:group:${gid}`));
      const staleGroups: string[] = [];
      raws.forEach((raw, i) => {
        if (!raw) { staleGroups.push(groupIds[i]); return; }
        try {
          const group = JSON.parse(raw) as LobbyGroup;
          for (const k of ALL_SLOTS) if (group[k] != null) groupCount++;
        } catch {
          staleGroups.push(groupIds[i]);
        }
      });
      if (staleGroups.length) redis.srem("lobby:groups", ...staleGroups).catch(() => {});
    }

    return NextResponse.json({ count: lobbyCount + groupCount });
  } catch {
    return NextResponse.json({ count: 0 });
  }
}
