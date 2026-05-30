// Spoof a queue entry to trigger a match with whoever is currently waiting.
// Usage: node scripts/spoof-queue.mjs <myChampion> <vsChampion> <eloBracket>
// Example: node scripts/spoof-queue.mjs Aatrox Darius high

import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";

const [myChampion, vsChampion, eloBracket] = process.argv.slice(2);

if (!myChampion || !vsChampion || !eloBracket) {
  console.error("Usage: node scripts/spoof-queue.mjs <myChampion> <vsChampion> <eloBracket>");
  console.error("Example: node scripts/spoof-queue.mjs Aatrox Darius high");
  process.exit(1);
}

const prisma = new PrismaClient();
const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379");

function queueKey(elo, my, vs) {
  return `queue:${elo}:${my.toLowerCase()}:${vs.toLowerCase()}`;
}

async function main() {
  console.log(`\n🤖 Spoofing: ${myChampion} vs ${vsChampion} in [${eloBracket}] elo\n`);

  // 1. Create a fake user in the database
  const fakeUser = await prisma.user.upsert({
    where: { puuid: "spoof-puuid-test-user-001" },
    update: { riotId: "SpooferBot#TEST", region: "na1" },
    create: {
      puuid: "spoof-puuid-test-user-001",
      riotId: "SpooferBot#TEST",
      region: "na1",
    },
  });
  console.log(`✅ Fake user ready: ${fakeUser.riotId} (id: ${fakeUser.id})`);

  // 2. Upsert their queue entry (vsChampions is now a JSON array)
  await prisma.queueEntry.upsert({
    where: { userId: fakeUser.id },
    create: { userId: fakeUser.id, myChampion, vsChampions: JSON.stringify([vsChampion]), eloBracket },
    update: { myChampion, vsChampions: JSON.stringify([vsChampion]), eloBracket },
  });

  // 3. Check if there's a real player in the mirror key
  const mirrorKey = queueKey(eloBracket, vsChampion, myChampion); // real player's key
  const myKey = queueKey(eloBracket, myChampion, vsChampion);     // spoof's key

  const opponentId = await redis.srandmember(mirrorKey);
  console.log(`🔍 Checking mirror key: ${mirrorKey}`);

  if (!opponentId) {
    // No one waiting — just add spoof to queue so the next real join triggers the match
    await redis.sadd(myKey, fakeUser.id);
    console.log(`⏳ No one in the mirror queue yet.`);
    console.log(`   Spoof added to: ${myKey}`);
    console.log(`   Now join the queue from the browser and the match will trigger immediately.\n`);
    await cleanup();
    return;
  }

  // 4. Match found — atomically claim the opponent
  const removed = await redis.srem(mirrorKey, opponentId);
  if (removed === 0) {
    console.log("⚠️  Race condition — opponent was just claimed. Try again.");
    await cleanup();
    return;
  }
  await redis.srem(myKey, fakeUser.id);

  const opponent = await prisma.user.findUnique({ where: { id: opponentId } });
  if (!opponent) {
    console.log("⚠️  Opponent user not found in DB.");
    await cleanup();
    return;
  }

  // 5. Clean up queue entries
  await prisma.queueEntry.deleteMany({
    where: { userId: { in: [fakeUser.id, opponentId] } },
  });

  // 6. Create the match record
  const match = await prisma.match.create({
    data: {
      playerAId: fakeUser.id,
      playerBId: opponentId,
      champA: myChampion,
      champB: vsChampion,
      eloBracket,
    },
  });
  console.log(`✅ Match created (id: ${match.id})`);

  // 7. Publish to both users' SSE channels
  const resultForOpponent = JSON.stringify({
    matchId: match.id,
    opponent: { riotId: fakeUser.riotId, region: fakeUser.region, champion: myChampion },
    myChampion: vsChampion,
  });

  const resultForSpoof = JSON.stringify({
    matchId: match.id,
    opponent: { riotId: opponent.riotId, region: opponent.region, champion: vsChampion },
    myChampion,
  });

  await redis.publish(`match:${opponentId}`, resultForOpponent);
  await redis.publish(`match:${fakeUser.id}`, resultForSpoof);

  console.log(`📡 Published match notification to ${opponent.riotId}`);
  console.log(`\n🎮 Match screen should appear in the browser now!\n`);
  console.log(`   You (${opponent.riotId}) play: ${vsChampion}`);
  console.log(`   vs SpooferBot playing: ${myChampion}\n`);

  await cleanup();
}

async function cleanup() {
  await redis.quit();
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("❌ Error:", e.message);
  await cleanup();
  process.exit(1);
});
