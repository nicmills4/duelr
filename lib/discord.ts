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
 * Note on voice-state detection:
 *   Discord's REST API does not expose who is currently in a voice channel —
 *   that requires a Gateway (WebSocket) connection. Until a Gateway is added,
 *   cleanup is handled via a short TTL (CHANNEL_LIFETIME_MS) + a polling loop
 *   that detects manual deletion. Call deleteVoiceChannel() explicitly whenever
 *   the app knows a match is over (e.g. both players have reported results).
 */

const DISCORD_API = "https://discord.com/api/v10";

/** Maximum lifetime of a match voice channel (30 min covers any realistic game). */
const CHANNEL_LIFETIME_MS = 30 * 60 * 1000;

/** How often the cleanup loop checks whether the channel still exists. */
const POLL_INTERVAL_MS = 2 * 60 * 1000;

/** Grace period before cleanup starts — gives both players time to join. */
const GRACE_PERIOD_MS = 5 * 60 * 1000;

// ── In-process channel registry ────────────────────────────────────────────────
// Tracks every channel the bot has created so we can clean them up
// even if the explicit delete call is never made.
// Lost on server restart (acceptable trade-off for a Railway deployment).
const activeChannels = new Map<string, {
  guildId:    string;
  intervalId: ReturnType<typeof setInterval>;
  timeoutId:  ReturnType<typeof setTimeout>;
}>();

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

/** Delete a channel and stop all cleanup timers for it. */
export async function deleteVoiceChannel(channelId: string): Promise<void> {
  const entry = activeChannels.get(channelId);
  if (entry) {
    clearInterval(entry.intervalId);
    clearTimeout(entry.timeoutId);
    activeChannels.delete(channelId);
  }
  await discordFetch(`/channels/${channelId}`, "DELETE");
}

/** Start the background poll loop for a channel. */
function scheduleCleanup(channelId: string, guildId: string) {
  const createdAt = Date.now();

  // Poll every 2 min — detect manual deletion early.
  const intervalId = setInterval(async () => {
    const elapsed = Date.now() - createdAt;

    // Don't delete during the grace period (give players time to join).
    if (elapsed < GRACE_PERIOD_MS) return;

    // Check if the channel was deleted externally (returns null on 404).
    const channel = await discordFetch(`/channels/${channelId}`, "GET");
    if (!channel) {
      // Channel gone — stop tracking.
      const entry = activeChannels.get(channelId);
      if (entry) {
        clearInterval(entry.intervalId);
        clearTimeout(entry.timeoutId);
        activeChannels.delete(channelId);
      }
    }
    // Cannot detect empty-channel state via REST — rely on the hard timeout below.
  }, POLL_INTERVAL_MS);

  // Hard deadline: always delete after CHANNEL_LIFETIME_MS regardless.
  const timeoutId = setTimeout(async () => {
    clearInterval(intervalId);
    activeChannels.delete(channelId);
    await discordFetch(`/channels/${channelId}`, "DELETE");
  }, CHANNEL_LIFETIME_MS);

  activeChannels.set(channelId, { guildId, intervalId, timeoutId });
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Creates a temporary Discord voice channel and returns an invite link.
 * The channel auto-deletes after CHANNEL_LIFETIME_MS (30 min) or sooner
 * if deleteVoiceChannel() is called explicitly (e.g. after match reporting).
 * Returns null if the bot is not configured or the API call fails.
 */
export async function createMatchVoiceChannel(
  name:      string,
  userLimit: number
): Promise<{ url: string; channelId: string } | null> {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const catId   = process.env.DISCORD_MATCH_CATEGORY_ID?.trim();

  if (!guildId) return null;

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

    // 3. Start the background cleanup loop.
    scheduleCleanup(channel.id, guildId);

    return { url: `https://discord.gg/${invite.code}`, channelId: channel.id };
  } catch {
    return null;
  }
}
