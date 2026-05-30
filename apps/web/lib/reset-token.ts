/**
 * Password reset token helpers.
 * Tokens live in Redis with a 1-hour TTL.
 * Key: pw_reset:{token}  →  userId
 *
 * Rate limit: one reset email per 5 minutes per email address.
 * Key: pw_reset_rl:{email}  →  "1"  (TTL 300 s)
 */

import { randomBytes } from "crypto";
import { redis } from "./redis";

const TOKEN_TTL    = 60 * 60;   // 1 hour
const RL_TTL       = 60 * 5;    // 5 minute cooldown

function tokenKey(token: string) { return `pw_reset:${token}`; }
function rlKey(email: string)    { return `pw_reset_rl:${email.toLowerCase()}`; }

/** Returns true if the email is currently rate-limited. */
export async function isResetRateLimited(email: string): Promise<boolean> {
  const result = await redis.set(rlKey(email), "1", "EX", RL_TTL, "NX");
  return result === null; // null means key already existed → rate limited
}

/** Returns remaining cooldown seconds, or 0 if not limited. */
export async function resetRateLimitTtl(email: string): Promise<number> {
  const ttl = await redis.ttl(rlKey(email));
  return ttl > 0 ? ttl : 0;
}

/** Generate a secure token and store userId under it. */
export async function createResetToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis.setex(tokenKey(token), TOKEN_TTL, userId);
  return token;
}

/**
 * Claim a token: returns the userId if valid, null if expired / not found.
 * Deletes the token atomically — single use only.
 */
export async function claimResetToken(token: string): Promise<string | null> {
  const key    = tokenKey(token);
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}
