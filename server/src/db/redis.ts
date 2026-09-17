import { createClient } from "redis";

import { config } from "../config.js";

export const redisClient = createClient({ url: config.REDIS_URL });

redisClient.on("error", (error) => {
  process.stderr.write(`Redis error: ${error instanceof Error ? error.message : "unknown"}\n`);
});

let connectionPromise: Promise<void> | undefined;

export async function ensureRedisConnected(): Promise<void> {
  if (redisClient.isReady) return;
  connectionPromise ??= redisClient.connect().then(() => undefined);
  try {
    await connectionPromise;
  } catch (error) {
    connectionPromise = undefined;
    throw error;
  }
}

export async function probeRedis(): Promise<void> {
  await ensureRedisConnected();
  await redisClient.ping();
}
