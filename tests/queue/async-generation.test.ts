import { Queue } from "bullmq";
import Redis from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  ArtifactConflictError,
  PostgresArtifactStore,
  claimGeneration,
  completeGeneration,
  createPrismaClient,
  prepareSnapshot,
  recoverExpiredGenerationLeases,
  requestGeneration,
} from "../../packages/db/src/index";
import {
  BullMqGenerationPublisher,
  dispatchGenerationOutbox,
  type GenerationPublisher,
} from "../../packages/queue/src/index";
import { generateSimulatedScd } from "../../packages/scd/src/index";
import {
  PermanentGenerationError,
  TransientGenerationError,
  startWorkerRuntime,
} from "../../apps/worker/src/index";

const databaseUrl = process.env.TEST_DATABASE_URL;
const redisUrl = process.env.TEST_REDIS_URL;
if (!databaseUrl || !redisUrl) throw new Error("Queue integration environment is incomplete.");

const queueName = "scd-generation-integration-v1";
const db = createPrismaClient(databaseUrl);
const adminConnection = new Redis(redisUrl, { maxRetriesPerRequest: 1 });
const adminQueue = new Queue(queueName, { connection: adminConnection });
const silentLogger = { info: () => undefined, error: () => undefined };

async function clearState(): Promise<void> {
  await adminQueue.obliterate({ force: true });
  await db.$executeRawUnsafe(
    'TRUNCATE TABLE "GeneratedArtifact", "GenerationOutbox", "ScdGeneration", "ConfigurationRevision", "Substation" CASCADE',
  );
}

async function fixture(content: unknown = {
  substationName: "Integration demo",
  elements: [{ id: "IED_01", name: "Device", type: "IED" }],
}) {
  const substation = await db.substation.create({ data: { name: "Integration substation" } });
  return db.configurationRevision.create({
    data: { substationId: substation.id, version: 1, ...prepareSnapshot(content) },
  });
}

async function waitForStatus(jobId: string, status: "SUCCEEDED" | "FAILED") {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    const generation = await db.scdGeneration.findUniqueOrThrow({
      where: { id: jobId },
      include: { artifact: true },
    });
    if (generation.status === status) return generation;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Generation ${jobId} did not reach ${status}.`);
}

beforeAll(async () => {
  await adminQueue.waitUntilReady();
});

beforeEach(clearState);

afterAll(async () => {
  await adminQueue.obliterate({ force: true });
  await adminQueue.close();
  if (adminConnection.status !== "end") await adminConnection.quit();
  await db.$disconnect();
});

describe("PostgreSQL outbox and BullMQ worker", () => {
  it("keeps acceptance in PostgreSQL and recovers a failed Redis publication", async () => {
    const revision = await fixture();
    const first = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    const duplicate = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    expect(duplicate.generation.id).toBe(first.generation.id);
    expect(await db.generationOutbox.count()).toBe(1);

    let shouldFail = true;
    const published: string[] = [];
    const publisher: GenerationPublisher = {
      async publish(jobId) {
        if (shouldFail) throw new Error("Redis unavailable");
        published.push(jobId);
      },
      async has() { return false; },
      async close() {},
    };
    const firstCycle = await dispatchGenerationOutbox(db, publisher, new Date("2030-01-01T00:00:00.000Z"));
    expect(firstCycle).toEqual({ published: 0, failed: 1 });
    expect((await db.generationOutbox.findFirstOrThrow()).publishedAt).toBeNull();

    shouldFail = false;
    const secondCycle = await dispatchGenerationOutbox(db, publisher, new Date("2030-01-01T00:00:01.000Z"));
    expect(secondCycle).toEqual({ published: 1, failed: 0 });
    expect(published).toEqual([first.generation.id]);
  });

  it("rebuilds a lost Redis queue from PostgreSQL without duplicating the generation", async () => {
    const revision = await fixture({
      substationName: "Redis recovery",
      elements: [{ id: "IED_RECOVERY", name: "Recovery device", type: "IED" }],
    });
    const requested = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    const publisher = new BullMqGenerationPublisher(redisUrl, { queueName, backoffDelayMs: 10 });
    try {
      expect(await dispatchGenerationOutbox(db, publisher, new Date("2030-01-01T00:00:00.000Z"))).toEqual({ published: 1, failed: 0 });
      expect(await publisher.has(requested.generation.id)).toBe(true);
    } finally {
      await publisher.close();
    }

    const beforeRedisLoss = {
      generation: await db.scdGeneration.findUniqueOrThrow({ where: { id: requested.generation.id } }),
      generationCount: await db.scdGeneration.count(),
      revisionCount: await db.configurationRevision.count(),
      outbox: await db.generationOutbox.findUniqueOrThrow({ where: { generationId: requested.generation.id } }),
    };
    expect(beforeRedisLoss.generation.status).toBe("QUEUED");
    expect(beforeRedisLoss.outbox.publishedAt).not.toBeNull();

    await adminConnection.flushdb();
    expect(await adminQueue.getJob(requested.generation.id)).toBeUndefined();
    expect(await db.scdGeneration.count()).toBe(beforeRedisLoss.generationCount);
    expect(await db.configurationRevision.count()).toBe(beforeRedisLoss.revisionCount);
    expect(await db.generationOutbox.count()).toBe(1);
    expect((await db.scdGeneration.findUniqueOrThrow({ where: { id: requested.generation.id } })).status).toBe("QUEUED");

    const runtime = await startWorkerRuntime({
      databaseUrl,
      redisUrl,
      queueName,
      dispatcherIntervalMs: 20,
      backoffDelayMs: 10,
      logger: silentLogger,
    });
    try {
      const completed = await waitForStatus(requested.generation.id, "SUCCEEDED");
      expect(completed.id).toBe(beforeRedisLoss.generation.id);
      expect(completed.artifact).not.toBeNull();
      expect(await db.scdGeneration.count()).toBe(1);
      expect(await db.generationOutbox.count()).toBe(1);
      expect(await db.generatedArtifact.count()).toBe(1);
    } finally {
      await runtime.close();
    }
  });

  it("retries transient failures and ignores duplicate deliveries", async () => {
    const revision = await fixture();
    const requested = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    const duplicate = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    expect(duplicate.generation.id).toBe(requested.generation.id);

    let calls = 0;
    const runtimeDb = createPrismaClient(databaseUrl);
    const runtime = await startWorkerRuntime({
      db: runtimeDb,
      redisUrl,
      queueName,
      dispatcherIntervalMs: 20,
      backoffDelayMs: 10,
      logger: silentLogger,
      generator(input) {
        calls += 1;
        if (calls < 3) throw new TransientGenerationError();
        return generateSimulatedScd(input);
      },
    });
    try {
      const generation = await waitForStatus(requested.generation.id, "SUCCEEDED");
      expect(generation.attemptCount).toBe(3);
      expect(generation.artifact?.mimeType).toBe("application/xml");
      expect(calls).toBe(3);

      const publisher = new BullMqGenerationPublisher(redisUrl, { queueName, backoffDelayMs: 10 });
      await publisher.publish(requested.generation.id);
      await publisher.publish(requested.generation.id);
      await publisher.close();
      await expect((await adminQueue.getJob(requested.generation.id))?.getState()).resolves.toBe("completed");
      expect((await db.scdGeneration.findUniqueOrThrow({ where: { id: requested.generation.id } })).attemptCount).toBe(3);

      const artifact = await new PostgresArtifactStore(db).getByGenerationId(requested.generation.id);
      if (!artifact) throw new Error("Expected persisted artifact.");
      expect((await new PostgresArtifactStore(db).put(artifact)).created).toBe(false);
      await expect(new PostgresArtifactStore(db).put({
        ...artifact,
        bytes: Buffer.from("different"),
      })).rejects.toBeInstanceOf(ArtifactConflictError);
    } finally {
      await runtime.close();
    }
  });

  it("persists a sanitized terminal failure without retrying", async () => {
    const revision = await fixture();
    const requested = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    const runtimeDb = createPrismaClient(databaseUrl);
    const runtime = await startWorkerRuntime({
      db: runtimeDb,
      redisUrl,
      queueName,
      dispatcherIntervalMs: 20,
      backoffDelayMs: 10,
      logger: silentLogger,
      generator() {
        throw new PermanentGenerationError();
      },
    });
    try {
      const generation = await waitForStatus(requested.generation.id, "FAILED");
      expect(generation.attemptCount).toBe(1);
      expect(generation.errorMessage).toBe("The configuration revision is invalid.");
      expect(generation.artifact).toBeNull();
    } finally {
      await runtime.close();
    }
  });

  it("rejects a stale attempt after recovering an expired lease", async () => {
    const revision = await fixture();
    const requested = await requestGeneration(db, { revisionId: revision.id, generatorVersion: "simulator-v1" });
    const firstToken = "10000000-0000-4000-8000-000000000001";
    const secondToken = "20000000-0000-4000-8000-000000000002";
    const firstClaim = await claimGeneration(db, {
      generationId: requested.generation.id,
      attemptToken: firstToken,
      now: new Date("2026-01-01T00:00:00.000Z"),
      leaseExpiresAt: new Date("2026-01-01T00:01:00.000Z"),
    });
    expect(firstClaim?.attemptCount).toBe(1);
    expect(await recoverExpiredGenerationLeases(db, new Date("2026-01-01T00:02:00.000Z"))).toBe(1);

    const secondClaim = await claimGeneration(db, {
      generationId: requested.generation.id,
      attemptToken: secondToken,
      now: new Date("2026-01-01T00:02:00.000Z"),
      leaseExpiresAt: new Date("2026-01-01T00:03:00.000Z"),
    });
    if (!secondClaim) throw new Error("Expected the recovered generation to be claimable.");
    const generated = generateSimulatedScd(secondClaim.revision.content);
    const artifact = {
      generationId: secondClaim.id,
      storageKey: `scd/${secondClaim.id}/${generated.metadata.checksum}.scd`,
      fileName: generated.metadata.fileName,
      mimeType: generated.metadata.mimeType,
      byteSize: generated.metadata.byteSize,
      checksum: generated.metadata.checksum,
      bytes: generated.bytes,
    };

    expect(await completeGeneration(db, {
      generationId: secondClaim.id,
      attemptToken: firstToken,
      finishedAt: new Date("2026-01-01T00:02:01.000Z"),
      artifact,
    })).toBe(false);
    expect(await db.generatedArtifact.count()).toBe(0);
    expect(await completeGeneration(db, {
      generationId: secondClaim.id,
      attemptToken: secondToken,
      finishedAt: new Date("2026-01-01T00:02:02.000Z"),
      artifact,
    })).toBe(true);
  });

  it("rolls back SUCCEEDED when artifact persistence conflicts", async () => {
    const firstRevision = await fixture();
    const secondSubstation = await db.substation.create({ data: { name: "Second substation" } });
    const secondRevision = await db.configurationRevision.create({
      data: {
        substationId: secondSubstation.id,
        version: 1,
        ...prepareSnapshot({
          substationName: "Second demo",
          elements: [{ id: "BAY_01", name: "Bay", type: "BAY" }],
        }),
      },
    });
    const first = await requestGeneration(db, { revisionId: firstRevision.id, generatorVersion: "simulator-v1" });
    const second = await requestGeneration(db, { revisionId: secondRevision.id, generatorVersion: "simulator-v1" });
    const firstToken = "30000000-0000-4000-8000-000000000003";
    const secondToken = "40000000-0000-4000-8000-000000000004";
    const now = new Date("2026-01-01T00:00:00.000Z");
    const leaseExpiresAt = new Date("2026-01-01T00:01:00.000Z");
    const firstClaim = await claimGeneration(db, {
      generationId: first.generation.id,
      attemptToken: firstToken,
      now,
      leaseExpiresAt,
    });
    const secondClaim = await claimGeneration(db, {
      generationId: second.generation.id,
      attemptToken: secondToken,
      now,
      leaseExpiresAt,
    });
    if (!firstClaim || !secondClaim) throw new Error("Expected both generations to be claimed.");
    const firstGenerated = generateSimulatedScd(firstClaim.revision.content);
    const secondGenerated = generateSimulatedScd(secondClaim.revision.content);
    const sharedStorageKey = "scd/shared-key.scd";

    expect(await completeGeneration(db, {
      generationId: firstClaim.id,
      attemptToken: firstToken,
      finishedAt: new Date("2026-01-01T00:00:01.000Z"),
      artifact: {
        generationId: firstClaim.id,
        storageKey: sharedStorageKey,
        fileName: firstGenerated.metadata.fileName,
        mimeType: firstGenerated.metadata.mimeType,
        byteSize: firstGenerated.metadata.byteSize,
        checksum: firstGenerated.metadata.checksum,
        bytes: firstGenerated.bytes,
      },
    })).toBe(true);

    await expect(completeGeneration(db, {
      generationId: secondClaim.id,
      attemptToken: secondToken,
      finishedAt: new Date("2026-01-01T00:00:02.000Z"),
      artifact: {
        generationId: secondClaim.id,
        storageKey: sharedStorageKey,
        fileName: secondGenerated.metadata.fileName,
        mimeType: secondGenerated.metadata.mimeType,
        byteSize: secondGenerated.metadata.byteSize,
        checksum: secondGenerated.metadata.checksum,
        bytes: secondGenerated.bytes,
      },
    })).rejects.toBeInstanceOf(ArtifactConflictError);
    expect((await db.scdGeneration.findUniqueOrThrow({ where: { id: secondClaim.id } })).status).toBe("RUNNING");
    expect(await db.generatedArtifact.count({ where: { generationId: secondClaim.id } })).toBe(0);
  });

  it("processes the queued immutable snapshot even when a newer revision exists", async () => {
    const firstRevision = await fixture({
      substationName: "Original snapshot",
      elements: [{ id: "IED_ORIGINAL", name: "Original device", type: "IED" }],
    });
    const requested = await requestGeneration(db, { revisionId: firstRevision.id, generatorVersion: "simulator-v1" });
    await db.configurationRevision.create({
      data: {
        substationId: firstRevision.substationId,
        version: 2,
        ...prepareSnapshot({
          substationName: "Newer snapshot",
          elements: [{ id: "BAY_NEW", name: "New bay", type: "BAY" }],
        }),
      },
    });

    const runtime = await startWorkerRuntime({
      databaseUrl,
      redisUrl,
      queueName,
      dispatcherIntervalMs: 20,
      backoffDelayMs: 10,
      logger: silentLogger,
    });
    try {
      const completed = await waitForStatus(requested.generation.id, "SUCCEEDED");
      if (!completed.artifact) throw new Error("Expected an artifact for the queued snapshot.");
      const xml = Buffer.from(completed.artifact.content).toString("utf8");
      expect(xml).toContain("Original snapshot");
      expect(xml).toContain("IED_ORIGINAL");
      expect(xml).not.toContain("Newer snapshot");
      expect(xml).not.toContain("BAY_NEW");
    } finally {
      await runtime.close();
    }
  });
});
