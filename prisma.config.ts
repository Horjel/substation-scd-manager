import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "packages/db/prisma/schema.prisma",
  migrations: {
    path: "packages/db/prisma/migrations",
    seed: "tsx packages/db/prisma/seed.ts",
  },
  // Generation/validation remain possible without a running database.
  // Commands that connect require DATABASE_URL (see README).
  datasource: { url: process.env.DATABASE_URL ?? "" },
});
