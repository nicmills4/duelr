/**
 * Server-only Discord bot utilities.
 *
 * Required env vars:
 *   DISCORD_BOT_TOKEN        — bot token from discord.com/developers
 *   DISCORD_GUILD_ID         — right-click your server → Copy Server ID
 *   DISCORD_MATCH_CATEGORY_ID — (optional) category to place match channels under
 *
 * The bot must be in the server with the Manage Channels permission.
 */

const DISCORD_API = "https://discord.com/api/v10";
const CHANNEL_LIFETIME_MS = 2 * 60 * 60 * 1000; // 2 hours

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

  return res.ok ? res.json() : null;
}

/**
 * Creates a temporary Discord voice channel and returns a 2-hour invite link.
 * Schedules the channel for auto-deletion after 2 hours.
 * Returns null if the bot is not configured or the API call fails — callers
 * should treat a null URL as "no voice channel" and continue normally.
 */
export async function createMatchVoiceChannel(
  name:      string,
  userLimit: number
): Promise<string | null> {
  const guildId = process.env.DISCORD_GUILD_ID?.trim();
  const catId   = process.env.DISCORD_MATCH_CATEGORY_ID?.trim();

  if (!guildId) return null;

  try {
    // 1. Create the voice channel
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

    // 2. Generate an invite that lasts exactly as long as the channel
    const invite = await discordFetch(`/channels/${channel.id}/invites`, "POST", {
      max_age:   CHANNEL_LIFETIME_MS / 1000,
      max_uses:  userLimit * 2, // generous headroom
      temporary: false,
    }) as { code: string } | null;

    if (!invite?.code) {
      // Clean up orphan channel on invite failure
      discordFetch(`/channels/${channel.id}`, "DELETE").catch(() => {});
      return null;
    }

    // 3. Auto-delete the voice channel once the session window closes.
    //    Railway runs a persistent Node.js process so this timer survives
    //    across requests (risk: lost on server restart, acceptable trade-off).
    setTimeout(() => {
      discordFetch(`/channels/${channel.id}`, "DELETE").catch(() => {});
    }, CHANNEL_LIFETIME_MS);

    return `https://discord.gg/${invite.code}`;
  } catch {
    return null;
  }
}
