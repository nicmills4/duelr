/**
 * Server-only Discord bot utilities.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN         — bot token from discord.com/developers
 *   DISCORD_GUILD_ID          — right-click your server → Copy Server ID
 *   DISCORD_MATCH_CATEGORY_ID — (optional) category to place match channels under
 *
 * The bot must be in the server with the Manage Channels permission.
 *
 * Voice channels are deleted 1 hour after creation. Deletion is tracked in
 * Redis so it survives server restarts — setTimeout alone would lose pending
 * deletions on every redeploy or crash.
 */

import { redis } from "./redis";

const DISCORD_API = "https://discord.com/api/v10";

/** Voice channels are deleted 1 hour after creation. */
const CHANNEL_LIFETIME_MS = 60 * 60 * 1000;

/** Redis sorted set — score = Unix ms timestamp when the channel should die. */
const CLEANUP_KEY = "discord:pending_deletes";

// ── Helpers ────────────────────────────────────────────────────────────────────

async function discordFetch(path: string, method: string, body?: object) {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return null;

  const res = await fetch(`${DISCORD_API}${path}`, {
    method,
    headers: {
      Authorization:  `Bot ${token}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 404) return null;
  return res.ok ? res.json() : null;
}

/**
 * Delete a single Discord channel (fire-and-forget, errors are ignored).
 */
async function deleteChannel(channelId: string): Promise<void> {
  await discordFetch(`/channels/${channelId}`, "DELETE");
}

/**
 * Flush all channels whose deletion time has passed.
 * Pulls expired entries from the Redis sorted set, deletes them from Discord,
 * then removes them from the set.
 */
async function flushExpiredChannels(): Promise<void> {
  const now = Date.now();
  // ZRANGEBYSCORE returns members with score ≤ now (i.e. already due for deletion)
  const expired = await redis.zrangebyscore(CLEANUP_KEY, 0, now);
  if (!expired.length) return;

  await Promise.all(expired.map(deleteChannel));
  await redis.zrem(CLEANUP_KEY, ...expired);
}

/**
 * Register a channel for deletion after CHANNEL_LIFETIME_MS.
 * Uses both Redis (durable) and setTimeout (best-effort same-process).
 */
function scheduleCleanup(channelId: string): void {
  const deleteAt = Date.now() + CHANNEL_LIFETIME_MS;

  // Durable: survives restarts
  redis.zadd(CLEANUP_KEY, deleteAt, channelId).catch(() => {});

  // Best-effort: fires in this process if it stays alive
  setTimeout(() => {
    deleteChannel(channelId).catch(() => {});
    redis.zrem(CLEANUP_KEY, channelId).catch(() => {});
  }, CHANNEL_LIFETIME_MS);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Creates a temporary Discord voice channel and returns an invite link.
 * The channel auto-deletes 1 hour after creation.
 * Returns null if the bot is not configured or the API call fails.
 */
export async function createMatchVoiceChannel(
  name:      string,
  userLimit: number
): Promise<{ url: string; channelId: string } | null> {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const catId   = process.env.DISCORD_MATCH_CATEGORY_ID?.trim();

  if (!guildId) return null;

  // Clean up any channels that were missed by previous restarts before creating a new one
  flushExpiredChannels().catch(() => {});

  try {
    // 1. Create the voice channel.
    // Explicitly grant @everyone VIEW_CHANNEL (1024) + CONNECT (1048576)
    // so the invite works even if the parent category is role-restricted.
    // In Discord the @everyone role ID always equals the guild ID.
    const channel = await discordFetch(`/guilds/${guildId}/channels`, "POST", {
      name,
      type:       2, // GUILD_VOICE
      user_limit: userLimit,
      ...(catId ? { parent_id: catId } : {}),
      permission_overwrites: [
        {
          id:    guildId,
          type:  0, // role
          allow: String(1024 + 1048576), // VIEW_CHANNEL + CONNECT
          deny:  "0",
        },
      ],
    }) as { id: string } | null;

    if (!channel?.id) return null;

    // 2. Generate an invite valid for the channel's full lifetime.
    const invite = await discordFetch(`/channels/${channel.id}/invites`, "POST", {
      max_age:   CHANNEL_LIFETIME_MS / 1000,
      max_uses:  userLimit * 2, // generous headroom
      temporary: false,
    }) as { code: string } | null;

    if (!invite?.code) {
      await discordFetch(`/channels/${channel.id}`, "DELETE");
      return null;
    }

    // 3. Register for deletion after 1 hour (Redis + setTimeout).
    scheduleCleanup(channel.id);

    return { url: `https://discord.gg/${invite.code}`, channelId: channel.id };
  } catch {
    return null;
  }
}

