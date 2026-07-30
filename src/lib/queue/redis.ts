import IORedis from "ioredis";

const globalForRedis = globalThis as unknown as { redis?: IORedis };

/**
 * Shared ioredis connection for BullMQ. `maxRetriesPerRequest: null` is
 * required by BullMQ's blocking commands (see BullMQ docs) — without it,
 * workers silently fail to pick up jobs after transient Redis hiccups.
 */
export const redisConnection =
  globalForRedis.redis ??
  new IORedis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
    // Defer the actual connection until the first command — Next.js loads
    // this module while analyzing/bundling routes at build time, and an
    // eager connection would mean every build attempts (and retries) a
    // Redis connection even when no queue operation is happening yet.
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") globalForRedis.redis = redisConnection;
