import Redis from "ioredis";

const globalForRedis = globalThis as unknown as { redis: Redis };

function getTlsOptions(url: string) {
  return url.startsWith("rediss://") ? { tls: { rejectUnauthorized: false } } : {};
}

function createRedisClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  const client = new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...getTlsOptions(url),
  });
  client.on("error", (err) => console.error("[Redis] error:", err.message));
  return client;
}

export const redis = globalForRedis.redis || createRedisClient();

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redis;

export function createSubscriberClient() {
  const url = process.env.REDIS_URL || "redis://localhost:6379";
  return new Redis(url, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    ...getTlsOptions(url),
  });
}

// Queue key: queue:{elo}:{myChampion}:{vsChampion}
export function queueKey(elo: string, myChampion: string, vsChampion: string) {
  return `queue:${elo}:${myChampion.toLowerCase()}:${vsChampion.toLowerCase()}`;
}

// Channel that notifies a specific user of a match
export function matchChannel(userId: string) {
  return `match:${userId}`;
}

// Channel for real-time lobby notifications (challenges, responses)
export function notificationChannel(userId: string) {
  return `notifications:${userId}`;
}
