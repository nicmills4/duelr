/**
 * Password hashing helpers using Node.js built-in crypto.scrypt.
 * No third-party dependencies required.
 *
 * Format: "salt:hash" where both are hex strings.
 */

import { scrypt, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scryptAsync = promisify(scrypt);

const SALT_BYTES  = 16;
const KEY_LENGTH  = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES).toString("hex");
  const hash = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(
  password: string,
  stored: string
): Promise<boolean> {
  try {
    const [salt, hashHex] = stored.split(":");
    if (!salt || !hashHex) return false;
    const storedBuf  = Buffer.from(hashHex, "hex");
    const candidate  = (await scryptAsync(password, salt, KEY_LENGTH)) as Buffer;
    return timingSafeEqual(storedBuf, candidate);
  } catch {
    return false;
  }
}
