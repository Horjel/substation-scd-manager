import { stat } from "node:fs/promises";
import Redis from "ioredis";
import { createPrismaClient } from "@substation/db";

const healthFile = process.env.WORKER_HEALTH_FILE ?? "/tmp/substation-worker-ready";
const redisUrl = process.env.REDIS_URL;

async function check(): Promise<void> {
  if (!redisUrl) throw new Error("Missing queue configuration.");
  const marker = await stat(healthFile);
  if (Date.now() - marker.mtimeMs > 20_000) throw new Error("Worker heartbeat is stale.");

  const db = createPrismaClient();
  const redis = new Redis(redisUrl, { lazyConnect: true, connectTimeout: 2_000, maxRetriesPerRequest: 1 });
  try {
    await db.$queryRaw`SELECT 1`;
    await redis.connect();
    if ((await redis.ping()) !== "PONG") throw new Error("Queue health check failed.");
  } finally {
    await db.$disconnect();
    if (redis.status !== "end") redis.disconnect();
  }
}

try {
  await check();
  console.log(JSON.stringify({ status: "ok" }));
} catch {
  console.error(JSON.stringify({ status: "unhealthy" }));
  process.exitCode = 1;
}
