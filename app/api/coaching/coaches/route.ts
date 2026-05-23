import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [coaches, versionRes] = await Promise.all([
      prisma.coachProfile.findMany({
        where:   { isActive: true, isApproved: true },
        include: { user: { select: { riotId: true, region: true } } },
        orderBy: { createdAt: "desc" },
      }),
      fetch("https://ddragon.leagueoflegends.com/api/versions.json"),
    ]);

    const versions = (await versionRes.json()) as string[];
    const version  = versions[0];
    const imgBase  = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion`;

    const results = coaches.map((c) => {
      const champIds: string[] = JSON.parse(c.champions);
      const specIds:  string[] = JSON.parse(c.specialties);
      const avail:    string[] = JSON.parse(c.availability);

      return {
        id:           c.id,
        // Double-blind: never expose Riot ID here — only after a paid booking
        displayCode:  c.displayCode,
        verifiedTier: c.verifiedTier,
        hourlyRate:   c.hourlyRate,
        bio:          c.bio,
        availability: avail,
        champions:    champIds.map((id) => ({ id, imageUrl: `${imgBase}/${id}.png` })),
        specialties:  specIds.map((id) => ({ id, imageUrl: `${imgBase}/${id}.png` })),
      };
    });

    return NextResponse.json({ coaches: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
