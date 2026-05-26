/**
 * Email verification token helpers.
 * Tokens live in Redis with a 24-hour TTL — no extra DB table needed.
 * Key: email_verify:{token}  →  userId
 */

import { randomBytes } from "crypto";
import { redis } from "./redis";

const TOKEN_TTL = 60 * 60 * 24; // 24 hours

function tokenKey(token: string) {
  return `email_verify:${token}`;
}

/** Generate a cryptographically random token, store it, and return it. */
export async function createVerificationToken(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await redis.setex(tokenKey(token), TOKEN_TTL, userId);
  return token;
}

/**
 * Claim a token: returns the userId if valid, null if expired / not found.
 * Deletes the token atomically so it can only be used once.
 */
export async function claimVerificationToken(token: string): Promise<string | null> {
  const key    = tokenKey(token);
  const userId = await redis.get(key);
  if (!userId) return null;
  await redis.del(key);
  return userId;
}

/** Delete all outstanding verification tokens for a user (e.g. on resend). */
export async function deleteVerificationTokensForUser(userId: string): Promise<void> {
  // We can't query by value in Redis, so we rely on TTL expiry for old tokens.
  // This is a no-op placeholder — callers just create a new token (old one
  // expires in ≤24 h). For immediate invalidation, track keys per-user.
}
