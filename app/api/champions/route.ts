import { NextResponse } from "next/server";

export const revalidate = 86400; // Cache champion list for 24 hours

export interface Champion {
  id: string;      // DDragon key, e.g. "Aatrox"
  name: string;    // display name
  imageUrl: string;
  isRanged: boolean;
}

export async function GET() {
  try {
    const versionsRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
    const versions = await versionsRes.json() as string[];
    const latestVersion = versions[0];

    const champRes = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/data/en_US/champion.json`
    );
    const champData = await champRes.json() as {
      data: Record<string, {
        id: string; name: string;
        image: { full: string };
        stats: { attackrange: number };
      }>;
    };

    const champions: Champion[] = Object.values(champData.data)
      .map((c) => ({
        id: c.id,
        name: c.name,
        imageUrl: `https://ddragon.leagueoflegends.com/cdn/${latestVersion}/img/champion/${c.image.full}`,
        isRanged: c.stats.attackrange > 200,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ version: latestVersion, champions });
  } catch {
    return NextResponse.json({ error: "Failed to load champions" }, { status: 500 });
  }
}
