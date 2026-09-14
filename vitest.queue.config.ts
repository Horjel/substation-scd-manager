import "dotenv/config";
import { defineConfig } from "vitest/config";

if (!process.env.TEST_DATABASE_URL) throw new Error("TEST_DATABASE_URL is required for queue integration.");
if (!process.env.TEST_REDIS_URL) throw new Error("TEST_REDIS_URL is required for queue integration.");
if (process.env.TEST_DATABASE_URL === process.env.DATABASE_URL) {
  throw new Error("TEST_DATABASE_URL must differ from the development DATABASE_URL.");
}
if (process.env.TEST_REDIS_URL === process.env.REDIS_URL) {
  throw new Error("TEST_REDIS_URL must differ from the development REDIS_URL.");
}

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/queue/**/*.test.ts"],
    fileParallelism: false,
    testTimeout: 15_000,
    hookTimeout: 15_000,
  },
});
