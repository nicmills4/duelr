import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { ELO_BRACKETS } from "@/lib/constants";
import { AVAILABILITY_SLOTS } from "@/lib/partner-types";
import type { PartnerPostPublic, ChampEntry } from "@/lib/partner-types";
import { PARTNERS_REQUIRE_PREMIUM } from "@/lib/feature-flags";

export const dynamic = "force-dynamic";

const VALID_BRACKETS  = new Set(ELO_BRACKETS.map((b) => b.value));
const VALID_AVAIL     = new Set<string>(AVAILABILITY_SLOTS.map((s) => s.id));
const CHAMPION_RE     = /^[a-zA-Z0-9]{1,50}$/;

function parseJson(raw: string): string[] {
  try {
    const p = JSON.parse(raw);
    return Array.isArray(p) ? (p as string[]) : [];
  } catch {
    return [];
  }
}

async function getDDragonVersion(): Promise<string> {
  const res = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
  const versions = (await res.json()) as string[];
  return versions[0];
}

function toChampEntries(ids: string[], imgBase: string): ChampEntry[] {
  return ids.map((id) => ({ id, imageUrl: `${imgBase}/${id}.png` }));
}

// ── GET /api/partners ─────────────────────────────────────────────────────────
export async function GET() {
  try {
    const [session, posts, version] = await Promise.all([
      getSession(),
      prisma.partnerPost.findMany({
        include: { user: true },
        orderBy: { updatedAt: "desc" },
      }),
      getDDragonVersion(),
    ]);

    const imgBase = `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion`;
    const myId    = session?.userId ?? null;

    const results: PartnerPostPublic[] = posts.map((p) => {
      const bracketLabel =
        ELO_BRACKETS.find((b) => b.value === p.eloBracket)?.label ?? p.eloBracket;

      return {
        id:               p.id,
        userId:           p.userId,
        riotId:           p.user.riotId,
        region:           p.user.region,
        eloBracket:       p.eloBracket,
        eloBracketLabel:  bracketLabel,
        myChampions:      toChampEntries(parseJson(p.myChampions), imgBase),
        vsChampions:      toChampEntries(parseJson(p.vsChampions), imgBase),
        availability:     parseJson(p.availability),
        notes:            p.notes ?? null,
        createdAt:        p.createdAt.toISOString(),
        // Alias so the board can highlight the user's own post
        ...(myId === p.userId ? { isOwn: true } : {}),
      };
    });

    return NextResponse.json({ posts: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// ── POST /api/partners ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.accountType !== "full")
    return NextResponse.json({ error: "Full account required" }, { status: 403 });
  if (PARTNERS_REQUIRE_PREMIUM && !session.user.isPremium)
    return NextResponse.json({ error: "Premium subscription required" }, { status: 403 });
  if (!session.user.emailVerified)
    return NextResponse.json({ error: "Please verify your email before posting." }, { status: 403 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { myChampions, vsChampions, eloBracket, availability, notes } = body;

  // ── Validate ──────────────────────────────────────────────────────────────
  if (!Array.isArray(myChampions) || myChampions.length === 0)
    return NextResponse.json({ error: "At least one champion required" }, { status: 400 });

  if (myChampions.length > 15 || (Array.isArray(vsChampions) && vsChampions.length > 15))
    return NextResponse.json({ error: "Max 15 champions per list" }, { status: 400 });

  for (const id of [...myChampions, ...(vsChampions ?? [])]) {
    if (!CHAMPION_RE.test(id))
      return NextResponse.json({ error: `Invalid champion id: "${id}"` }, { status: 400 });
  }

  if (!VALID_BRACKETS.has(eloBracket))
    return NextResponse.json({ error: "Invalid eloBracket" }, { status: 400 });

  const avail: string[] = Array.isArray(availability)
    ? availability.filter((a: string) => VALID_AVAIL.has(a))
    : [];

  if (typeof notes === "string" && notes.length > 300)
    return NextResponse.json({ error: "Notes max 300 characters" }, { status: 400 });

  // ── Upsert ────────────────────────────────────────────────────────────────
  await prisma.partnerPost.upsert({
    where:  { userId: session.userId },
    create: {
      userId:       session.userId,
      myChampions:  JSON.stringify(myChampions),
      vsChampions:  JSON.stringify(vsChampions ?? []),
      eloBracket,
      availability: JSON.stringify(avail),
      notes:        notes?.trim() || null,
    },
    update: {
      myChampions:  JSON.stringify(myChampions),
      vsChampions:  JSON.stringify(vsChampions ?? []),
      eloBracket,
      availability: JSON.stringify(avail),
      notes:        notes?.trim() || null,
    },
  });

  return NextResponse.json({ ok: true });
}

// ── DELETE /api/partners ──────────────────────────────────────────────────────
export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (session.user.accountType !== "full")
    return NextResponse.json({ error: "Full account required" }, { status: 403 });
  if (PARTNERS_REQUIRE_PREMIUM && !session.user.isPremium)
    return NextResponse.json({ error: "Premium subscription required" }, { status: 403 });

  await prisma.partnerPost.deleteMany({ where: { userId: session.userId } });
  return NextResponse.json({ ok: true });
}
