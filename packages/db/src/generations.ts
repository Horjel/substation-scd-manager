import type { ArtifactInput } from "@substation/storage";
import { PostgresArtifactStore } from "./artifact-store";
import { Prisma, ScdGenerationStatus, type PrismaClient } from "./generated/client";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATES = [ScdGenerationStatus.QUEUED, ScdGenerationStatus.RUNNING] as const;

export const OUTBOX_EVENT_NAME = "generate-scd.v1";
export const OUTBOX_PAYLOAD_VERSION = 1;
export const MAX_GENERATION_ATTEMPTS = 3;

export class InvalidIdentifierError extends Error {
  constructor() {
    super("A valid UUID identifier is required.");
    this.name = "InvalidIdentifierError";
  }
}

export class RevisionNotFoundError extends Error {
  constructor() {
    super("Configuration revision not found.");
    this.name = "RevisionNotFoundError";
  }
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new InvalidIdentifierError();
}

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function requestGeneration(
  db: PrismaClient,
  input: { revisionId: string; generatorVersion: string },
) {
  assertUuid(input.revisionId);
  try {
    return await db.$transaction(async (tx) => {
      const revision = await tx.configurationRevision.findUnique({
        where: { id: input.revisionId },
        select: { id: true },
      });
      if (!revision) throw new RevisionNotFoundError();

      const existing = await tx.scdGeneration.findFirst({
        where: {
          revisionId: input.revisionId,
          generatorVersion: input.generatorVersion,
          status: { in: [...ACTIVE_STATES] },
        },
        orderBy: { createdAt: "asc" },
      });
      if (existing) return { generation: existing, created: false };

      const generation = await tx.scdGeneration.create({
        data: { revisionId: input.revisionId, generatorVersion: input.generatorVersion },
      });
      await tx.generationOutbox.create({
        data: {
          generationId: generation.id,
          eventName: OUTBOX_EVENT_NAME,
          payloadVersion: OUTBOX_PAYLOAD_VERSION,
        },
      });
      return { generation, created: true };
    });
  } catch (error) {
    if (!isUniqueConstraintError(error)) throw error;
    const generation = await db.scdGeneration.findFirst({
      where: {
        revisionId: input.revisionId,
        generatorVersion: input.generatorVersion,
        status: { in: [...ACTIVE_STATES] },
      },
      orderBy: { createdAt: "asc" },
    });
    if (!generation) throw error;
    return { generation, created: false };
  }
}

export async function claimGeneration(
  db: PrismaClient,
  input: { generationId: string; attemptToken: string; now: Date; leaseExpiresAt: Date },
) {
  assertUuid(input.generationId);
  assertUuid(input.attemptToken);
  const result = await db.scdGeneration.updateMany({
    where: {
      id: input.generationId,
      status: ScdGenerationStatus.QUEUED,
      attemptCount: { lt: MAX_GENERATION_ATTEMPTS },
    },
    data: {
      status: ScdGenerationStatus.RUNNING,
      startedAt: input.now,
      finishedAt: null,
      attemptToken: input.attemptToken,
      leaseExpiresAt: input.leaseExpiresAt,
      errorMessage: null,
      attemptCount: { increment: 1 },
    },
  });
  if (result.count === 0) return null;
  return db.scdGeneration.findUniqueOrThrow({
    where: { id: input.generationId },
    include: { revision: true },
  });
}

export async function completeGeneration(
  db: PrismaClient,
  input: { generationId: string; attemptToken: string; finishedAt: Date; artifact: ArtifactInput },
): Promise<boolean> {
  return db.$transaction(async (tx) => {
    const updated = await tx.scdGeneration.updateMany({
      where: {
        id: input.generationId,
        status: ScdGenerationStatus.RUNNING,
        attemptToken: input.attemptToken,
      },
      data: {
        status: ScdGenerationStatus.SUCCEEDED,
        finishedAt: input.finishedAt,
        attemptToken: null,
        leaseExpiresAt: null,
        errorMessage: null,
      },
    });
    if (updated.count === 0) return false;
    await new PostgresArtifactStore(tx).put(input.artifact);
    return true;
  });
}

export async function recordGenerationFailure(
  db: PrismaClient,
  input: {
    generationId: string;
    attemptToken: string;
    failedAt: Date;
    message: string;
    retry: boolean;
  },
): Promise<boolean> {
  const updated = await db.scdGeneration.updateMany({
    where: {
      id: input.generationId,
      status: ScdGenerationStatus.RUNNING,
      attemptToken: input.attemptToken,
    },
    data: input.retry
      ? {
          status: ScdGenerationStatus.QUEUED,
          startedAt: null,
          finishedAt: null,
          attemptToken: null,
          leaseExpiresAt: null,
          errorMessage: input.message,
        }
      : {
          status: ScdGenerationStatus.FAILED,
          finishedAt: input.failedAt,
          attemptToken: null,
          leaseExpiresAt: null,
          errorMessage: input.message,
        },
  });
  return updated.count === 1;
}

export async function failExhaustedQueuedGeneration(
  db: PrismaClient,
  generationId: string,
  finishedAt: Date,
): Promise<void> {
  await db.scdGeneration.updateMany({
    where: {
      id: generationId,
      status: ScdGenerationStatus.QUEUED,
      attemptCount: { gte: MAX_GENERATION_ATTEMPTS },
    },
    data: {
      status: ScdGenerationStatus.FAILED,
      startedAt: finishedAt,
      finishedAt,
      errorMessage: "Generation failed after the maximum number of attempts.",
    },
  });
}

export async function recoverExpiredGenerationLeases(db: PrismaClient, now: Date): Promise<number> {
  return db.$transaction(async (tx) => {
    const terminal = await tx.scdGeneration.updateMany({
      where: {
        status: ScdGenerationStatus.RUNNING,
        leaseExpiresAt: { lte: now },
        attemptCount: { gte: MAX_GENERATION_ATTEMPTS },
      },
      data: {
        status: ScdGenerationStatus.FAILED,
        finishedAt: now,
        attemptToken: null,
        leaseExpiresAt: null,
        errorMessage: "Generation failed after the maximum number of attempts.",
      },
    });
    const retryable = await tx.scdGeneration.updateMany({
      where: {
        status: ScdGenerationStatus.RUNNING,
        leaseExpiresAt: { lte: now },
        attemptCount: { lt: MAX_GENERATION_ATTEMPTS },
      },
      data: {
        status: ScdGenerationStatus.QUEUED,
        startedAt: null,
        attemptToken: null,
        leaseExpiresAt: null,
        errorMessage: "Worker lease expired; generation was queued again.",
      },
    });
    return terminal.count + retryable.count;
  });
}
