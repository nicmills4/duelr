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
 * deletions on every redeploy or crash. A periodic sweep (see instrumentation.ts)
 * calls sweepExpiredChannels() on a fixed interval so due channels are always
 * cleaned up, even when no new lobbies are being created.
 */

import { redis } from "./redis";

const DISCORD_API = "https://discord.com/api/v10";

/** Voice channels are deleted 1 hour after creation. */
const CHANNEL_LIFETIME_MS = 60 * 60 * 1000;

/** Redis sorted set — score = Unix ms timestamp when the channel should die. */
const CLEANUP_KEY = "discord:pending_deletes";

// ── Helpers ────────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

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
 * Delete a tracked channel, reporting whether it can be dropped from the
 * pending-deletes set.
 *   "removable" — deleted (2xx) or already gone (404); stop tracking it
 *   "retry"     — transient failure (429/5xx/network) or bot unconfigured;
 *                 keep it tracked so the next sweep retries it
 *
 * Reporting failures (instead of blindly removing from the set) is what fixes
 * the orphaned-channel leak: a Discord DELETE that silently failed used to be
 * forgotten anyway, stranding the channel forever.
 */
async function deleteChannelTracked(channelId: string): Promise<"removable" | "retry"> {
  const token = process.env.DISCORD_BOT_TOKEN?.trim();
  if (!token) return "retry";

  try {
    const res = await fetch(`${DISCORD_API}/channels/${channelId}`, {
      method:  "DELETE",
      headers: { Authorization: `Bot ${token}` },
    });
    // 2xx = deleted, 404 = already gone. Either way we can stop tracking it.
    if (res.ok || res.status === 404) return "removable";
    // 429 (rate limited), 5xx, etc. — leave it for the next sweep.
    return "retry";
  } catch {
    return "retry";
  }
}

/**
 * Delete every channel whose lifetime has elapsed.
 *
 * Pulls due entries from the Redis sorted set, deletes them from Discord one at
 * a time (throttled to respect REST rate limits), and removes ONLY the ones that
 * were actually deleted (or already gone). Transient failures stay in the set with
 * their past-due score so the next sweep retries them.
 *
 * Exported so the periodic sweep in instrumentation.ts can run it on a fixed
 * interval — independent of new-channel creation, and surviving redeploys.
 */
export async function sweepExpiredChannels(): Promise<void> {
  if (!process.env.DISCORD_BOT_TOKEN?.trim()) return;

  const now     = Date.now();
  // ZRANGEBYSCORE returns members with score ≤ now (i.e. already due for deletion)
  const expired = await redis.zrangebyscore(CLEANUP_KEY, 0, now).catch(() => [] as string[]);
  if (!expired.length) return;

  const removable: string[] = [];
  for (const channelId of expired) {
    if ((await deleteChannelTracked(channelId)) === "removable") {
      removable.push(channelId);
    }
    await sleep(300); // stay comfortably under Discord's REST rate limits
  }

  if (removable.length) {
    await redis.zrem(CLEANUP_KEY, ...removable).catch(() => {});
  }
}

/**
 * Register a channel for deletion after CHANNEL_LIFETIME_MS.
 * Uses both Redis (durable, primary) and setTimeout (best-effort same-process).
 */
function scheduleCleanup(channelId: string): void {
  const deleteAt = Date.now() + CHANNEL_LIFETIME_MS;

  // Durable: survives restarts — the periodic sweep will pick it up.
  redis.zadd(CLEANUP_KEY, deleteAt, channelId).catch(() => {});

  // Best-effort: fires in this process if it stays alive long enough.
  setTimeout(() => {
    deleteChannelTracked(channelId).then((result) => {
      if (result === "removable") redis.zrem(CLEANUP_KEY, channelId).catch(() => {});
    });
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

  // Opportunistic top-up sweep before creating a new channel. The periodic sweep
  // in instrumentation.ts is the primary mechanism; this just keeps things tidy.
  sweepExpiredChannels().catch(() => {});

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

