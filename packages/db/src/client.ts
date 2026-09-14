import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/client";

export function createPrismaClient(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for database operations.");
  }

  const url = new URL(connectionString);
  if (!["postgres:", "postgresql:"].includes(url.protocol)) {
    throw new Error("A PostgreSQL connection URL is required.");
  }

  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}
