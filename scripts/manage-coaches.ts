#!/usr/bin/env tsx
/**
 * Duelr — Admin CLI for managing coach profiles
 *
 * Usage (run from the project root):
 *
 *   npx tsx --env-file=.env.local scripts/manage-coaches.ts list
 *
 *   npx tsx --env-file=.env.local scripts/manage-coaches.ts add \
 *     --riotId "GameName#TAG" \
 *     --tier CHALLENGER \
 *     --rate 40 \
 *     --champions "Irelia,Fiora,Camille" \
 *     --specialties "Darius,Garen" \
 *     --availability "evening,weekends" \
 *     --bio "Optional bio text here"
 *
 *   npx tsx --env-file=.env.local scripts/manage-coaches.ts remove --code A7F2
 *
 *   npx tsx --env-file=.env.local scripts/manage-coaches.ts deactivate --code A7F2
 *   npx tsx --env-file=.env.local scripts/manage-coaches.ts activate   --code A7F2
 *
 * Alternatively, set DATABASE_URL in your shell and omit --env-file.
 *
 * Note: The coach's Riot ID must already exist in the Duelr database
 * (the player needs to have logged in at least once).
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const VALID_TIERS = new Set(["MASTER", "GRANDMASTER", "CHALLENGER"]);

// ── Arg parser ────────────────────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--")) {
      const key = argv[i].slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : "true";
      flags[key] = val;
      if (val !== "true") i++;
    }
  }
  return flags;
}

function randomCode(): string {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function list() {
  const coaches = await prisma.coachProfile.findMany({
    include: { user: { select: { riotId: true } } },
    orderBy: { createdAt: "desc" },
  });

  if (coaches.length === 0) {
    console.log("No coach profiles found.");
    return;
  }

  console.log(`\n${"CODE".padEnd(6)} ${"RIOT ID".padEnd(22)} ${"TIER".padEnd(13)} ${"RATE".padEnd(8)} ${"ACTIVE".padEnd(7)} APPROVED`);
  console.log("─".repeat(72));

  for (const c of coaches) {
    const rate     = `$${(c.hourlyRate / 100).toFixed(0)}/hr`;
    const active   = c.isActive   ? "yes" : "no";
    const approved = c.isApproved ? "yes" : "no";
    console.log(
      `${c.displayCode.padEnd(6)} ${c.user.riotId.padEnd(22)} ${c.verifiedTier.padEnd(13)} ${rate.padEnd(8)} ${active.padEnd(7)} ${approved}`
    );
  }
  console.log();
}

async function add(flags: Record<string, string>) {
  const { riotId, tier, rate, champions, specialties, availability, bio } = flags;

  if (!riotId)  { console.error("Error: --riotId required (e.g. \"GameName#TAG\")"); process.exit(1); }
  if (!tier)    { console.error("Error: --tier required (MASTER | GRANDMASTER | CHALLENGER)"); process.exit(1); }
  if (!rate)    { console.error("Error: --rate required (hourly rate in USD, e.g. 30)"); process.exit(1); }
  if (!champions) { console.error("Error: --champions required (comma-separated champion IDs, e.g. \"Irelia,Fiora\")"); process.exit(1); }

  const tierUpper = tier.toUpperCase();
  if (!VALID_TIERS.has(tierUpper)) {
    console.error(`Error: --tier must be one of: MASTER, GRANDMASTER, CHALLENGER. Got: "${tier}"`);
    process.exit(1);
  }

  const rateCents = Math.round(parseFloat(rate) * 100);
  if (isNaN(rateCents) || rateCents < 500 || rateCents > 50_000) {
    console.error("Error: --rate must be between $5 and $500/hr.");
    process.exit(1);
  }

  // Look up the user
  const user = await prisma.user.findUnique({ where: { riotId } });
  if (!user) {
    console.error(`Error: No user found with Riot ID "${riotId}".`);
    console.error("The coach must log into Duelr at least once before being added.");
    process.exit(1);
  }

  // Check for existing profile
  const existing = await prisma.coachProfile.findUnique({ where: { userId: user.id } });
  if (existing) {
    console.error(`Error: A coach profile already exists for "${riotId}" (code: ${existing.displayCode}).`);
    console.error("Use the update command or remove the existing profile first.");
    process.exit(1);
  }

  const champList  = champions.split(",").map((s) => s.trim()).filter(Boolean);
  const specList   = (specialties ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const availList  = (availability ?? "").split(",").map((s) => s.trim()).filter(Boolean);

  // Generate a unique display code
  let displayCode = randomCode();
  while (await prisma.coachProfile.findUnique({ where: { displayCode } })) {
    displayCode = randomCode();
  }

  const profile = await prisma.coachProfile.create({
    data: {
      userId:       user.id,
      displayCode,
      verifiedTier: tierUpper,
      champions:    JSON.stringify(champList),
      specialties:  JSON.stringify(specList),
      hourlyRate:   rateCents,
      bio:          bio?.trim() || null,
      availability: JSON.stringify(availList),
      isActive:     true,
      isApproved:   true,
    },
  });

  console.log(`\n✓ Coach profile created.`);
  console.log(`  Display code : ${profile.displayCode}`);
  console.log(`  Riot ID      : ${riotId}`);
  console.log(`  Tier         : ${tierUpper}`);
  console.log(`  Rate         : $${(rateCents / 100).toFixed(0)}/hr`);
  console.log(`  Champions    : ${champList.join(", ")}`);
  if (specList.length)  console.log(`  Specialties  : ${specList.join(", ")}`);
  if (availList.length) console.log(`  Availability : ${availList.join(", ")}`);
  if (bio)              console.log(`  Bio          : ${bio.trim()}`);
  console.log();
}

async function remove(flags: Record<string, string>) {
  const { code } = flags;
  if (!code) { console.error("Error: --code required (display code, e.g. A7F2)"); process.exit(1); }

  const profile = await prisma.coachProfile.findUnique({
    where:   { displayCode: code.toUpperCase() },
    include: { user: { select: { riotId: true } } },
  });

  if (!profile) {
    console.error(`Error: No coach profile found with code "${code.toUpperCase()}".`);
    process.exit(1);
  }

  await prisma.coachProfile.delete({ where: { displayCode: code.toUpperCase() } });
  console.log(`\n✓ Removed coach ${profile.displayCode} (${profile.user.riotId}).\n`);
}

async function setActive(flags: Record<string, string>, active: boolean) {
  const { code } = flags;
  if (!code) { console.error("Error: --code required"); process.exit(1); }

  const profile = await prisma.coachProfile.findUnique({
    where:   { displayCode: code.toUpperCase() },
    include: { user: { select: { riotId: true } } },
  });

  if (!profile) {
    console.error(`Error: No coach profile found with code "${code.toUpperCase()}".`);
    process.exit(1);
  }

  await prisma.coachProfile.update({
    where: { displayCode: code.toUpperCase() },
    data:  { isActive: active, isApproved: active },
  });

  const status = active ? "activated" : "deactivated";
  console.log(`\n✓ Coach ${profile.displayCode} (${profile.user.riotId}) ${status}.\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, ...rest] = process.argv;
  const flags = parseArgs(rest);

  switch (cmd) {
    case "list":       await list(); break;
    case "add":        await add(flags); break;
    case "remove":     await remove(flags); break;
    case "deactivate": await setActive(flags, false); break;
    case "activate":   await setActive(flags, true); break;
    default:
      console.log(`
Duelr coach manager

Commands:
  list                              Show all coach profiles
  add        --riotId --tier --rate --champions [--specialties] [--availability] [--bio]
  remove     --code <CODE>          Permanently delete a profile
  deactivate --code <CODE>          Hide a profile without deleting
  activate   --code <CODE>          Re-show a deactivated profile

Tiers:     MASTER | GRANDMASTER | CHALLENGER
Rate:      Hourly rate in USD (e.g. 30 = $30/hr)
Champions: Comma-separated DDragon IDs (e.g. "Irelia,Fiora,Camille")
Availability: morning | afternoon | evening | late | weekends  (comma-separated)

Example:
  npx tsx --env-file=.env.local scripts/manage-coaches.ts add \\
    --riotId "Faker#KR1" \\
    --tier CHALLENGER \\
    --rate 50 \\
    --champions "Orianna,Akali,LeBlanc" \\
    --specialties "mid" \\
    --availability "evening,weekends" \\
    --bio "T1 mid laner, specialising in carry mages and assassins."
`);
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
