import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ELO_BRACKETS } from "@/lib/constants";

export const dynamic = "force-dynamic";

function isWildcard(id: string): boolean {
  return id.startsWith("_");
}

function wildcardLabel(id: string): string {
  if (id === "_any")        return "Any Champion";
  if (id === "_any_melee")  return "Any Melee";
  if (id === "_any_ranged") return "Any Ranged";
  return id;
}

function parseVsChampions(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as string[];
  } catch {}
  return [raw];
}

export interface VsEntry {
  id: string;
  label: string;
  imageUrl: string | null;
}

export interface QueuePlayer {
  riotId: string;
  myChampion: string;
  myChampionImageUrl: string;
  eloBracket: string;
  eloBracketLabel: string;
  vsEntries: VsEntry[];
}

/** Queue sessions last at most 1 hour — anything older is a stale orphan. */
const QUEUE_MAX_AGE_MS = 60 * 60 * 1000;

export async function GET() {
  try {
    const cutoff = new Date(Date.now() - QUEUE_MAX_AGE_MS);

    // Purge stale orphans (rows whose SSE connection died without cleanup)
    await prisma.queueEntry.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });

    const [entries, versionRes] = await Promise.all([
      prisma.queueEntry.findMany({
        where:   { createdAt: { gte: cutoff } },
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
      fetch("https://ddragon.leagueoflegends.com/api/versions.json"),
    ]);

    const versions = (await versionRes.json()) as string[];
    const version = versions[0];
    const imgBase = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion`;

    const results: QueuePlayer[] = entries.map((entry) => {
      const vsIds = parseVsChampions(entry.vsChampions);

      const bracketLabel =
        entry.eloBracket === "any"
          ? "Any Elo"
          : (ELO_BRACKETS.find((b) => b.value === entry.eloBracket)?.label ?? entry.eloBracket);

      const vsEntries: VsEntry[] = vsIds.map((id) => ({
        id,
        label:    isWildcard(id) ? wildcardLabel(id) : id,
        imageUrl: isWildcard(id) ? null : `${imgBase}/${id}.png`,
      }));

      return {
        riotId:             entry.user.riotId,
        myChampion:         entry.myChampion,
        myChampionImageUrl: `${imgBase}/${entry.myChampion}.png`,
        eloBracket:         entry.eloBracket,
        eloBracketLabel:    bracketLabel,
        vsEntries,
      };
    });

    return NextResponse.json({ players: results });
  } catch {
    return NextResponse.json({ players: [] });
  }
}
