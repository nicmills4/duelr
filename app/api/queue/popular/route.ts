import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export interface PopularChampion {
  champion: string;
  count: number;
  imageUrl: string;
}

export async function GET() {
  try {
    const [popular, versionRes] = await Promise.all([
      prisma.queueEntry.groupBy({
        by: ["myChampion"],
        _count: { myChampion: true },
        orderBy: { _count: { myChampion: "desc" } },
        take: 10,
      }),
      fetch("https://ddragon.leagueoflegends.com/api/versions.json"),
    ]);

    const versions = await versionRes.json() as string[];
    const version = versions[0];

    const results: PopularChampion[] = popular.map((entry) => ({
      champion: entry.myChampion,
      count: entry._count.myChampion,
      imageUrl: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${entry.myChampion}.png`,
    }));

    return NextResponse.json({ popular: results });
  } catch {
    return NextResponse.json({ popular: [] });
  }
}
