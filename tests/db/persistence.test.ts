import { afterAll, describe, expect, it } from "vitest";
import { createPrismaClient } from "../../packages/db/src/client";
import { prepareSnapshot } from "../../packages/db/src/snapshot";
import type { Prisma } from "../../packages/db/src/generated/client";

const db = createPrismaClient(process.env.TEST_DATABASE_URL);
const rollback = new Error("Test rollback");
async function isolated(run: (tx: Prisma.TransactionClient) => Promise<void>) {
  try {
    await db.$transaction(async (tx) => { await run(tx); throw rollback; });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}
async function fixture(tx: Prisma.TransactionClient) {
  const substation = await tx.substation.create({ data: { name: "Test substation" } });
  const revision = await tx.configurationRevision.create({
    data: { substationId: substation.id, version: 1, ...prepareSnapshot({ name: "original" }) },
  });
  return { substation, revision };
}

afterAll(async () => { await db.$disconnect(); });

describe("PostgreSQL persistence (real database)", () => {
  it("stores new revisions without changing the first and defaults generation to QUEUED", async () => {
    await isolated(async (tx) => {
      const { substation, revision } = await fixture(tx);
      await tx.configurationRevision.create({ data: { substationId: substation.id, version: 2, ...prepareSnapshot({ name: "new" }) } });
      const stored = await tx.configurationRevision.findUniqueOrThrow({ where: { id: revision.id } });
      expect(stored.content).toEqual({ name: "original" });
      const job = await tx.scdGeneration.create({ data: { revisionId: revision.id, generatorVersion: "simulator-v1" } });
      expect(job.status).toBe("QUEUED");
      const startedAt = new Date("2026-01-02T00:00:00.000Z");
      const attemptToken = "10000000-0000-4000-8000-000000000001";
      expect((await tx.scdGeneration.update({
        where: { id: job.id },
        data: {
          status: "RUNNING",
          startedAt,
          attemptToken,
          leaseExpiresAt: new Date("2026-01-02T00:01:00.000Z"),
          attemptCount: 1,
        },
      })).status).toBe("RUNNING");
      expect((await tx.scdGeneration.update({
        where: { id: job.id },
        data: {
          status: "SUCCEEDED",
          finishedAt: new Date("2026-01-02T00:00:01.000Z"),
          attemptToken: null,
          leaseExpiresAt: null,
        },
      })).status).toBe("SUCCEEDED");

      const failedJob = await tx.scdGeneration.create({ data: { revisionId: revision.id, generatorVersion: "simulator-v1" } });
      await tx.scdGeneration.update({
        where: { id: failedJob.id },
        data: {
          status: "RUNNING",
          startedAt,
          attemptToken,
          leaseExpiresAt: new Date("2026-01-02T00:01:00.000Z"),
          attemptCount: 1,
        },
      });
      expect((await tx.scdGeneration.update({
        where: { id: failedJob.id },
        data: {
          status: "FAILED",
          finishedAt: new Date("2026-01-02T00:00:01.000Z"),
          attemptToken: null,
          leaseExpiresAt: null,
          errorMessage: "Controlled failure.",
        },
      })).status).toBe("FAILED");
    });
  });
  it("rejects updates to immutable revisions", async () => {
    await expect(isolated(async (tx) => {
      const { revision } = await fixture(tx);
      await tx.configurationRevision.update({ where: { id: revision.id }, data: { content: { changed: true } } });
    })).rejects.toThrow(/immutable/i);
  });
  it("rejects deletes of immutable revisions", async () => {
    await expect(isolated(async (tx) => {
      const { revision } = await fixture(tx);
      await tx.configurationRevision.delete({ where: { id: revision.id } });
    })).rejects.toThrow(/immutable/i);
  });
  it("rejects duplicate versions", async () => {
    await expect(isolated(async (tx) => {
      const { substation } = await fixture(tx);
      await tx.configurationRevision.create({ data: { substationId: substation.id, version: 1, ...prepareSnapshot({ a: 2 }) } });
    })).rejects.toMatchObject({ code: "P2002" });
  });
  it("rejects invalid revision references", async () => {
    await expect(isolated(async (tx) => {
      await tx.scdGeneration.create({ data: { revisionId: "ffffffff-ffff-4fff-8fff-ffffffffffff", generatorVersion: "simulator-v1" } });
    })).rejects.toMatchObject({ code: "P2003" });
  });
  it("rejects invalid states at the SQL boundary", async () => {
    await expect(isolated(async (tx) => {
      const { revision } = await fixture(tx);
      const job = await tx.scdGeneration.create({ data: { revisionId: revision.id, generatorVersion: "simulator-v1" } });
      await tx.$executeRaw`UPDATE "ScdGeneration" SET status = 'INVALID' WHERE id = ${job.id}::uuid`;
    })).rejects.toThrow(/INVALID|enum/i);
  });
});
