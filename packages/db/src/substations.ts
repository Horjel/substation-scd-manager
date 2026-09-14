import { ConfigurationValidationError, SIMULATOR_VERSION, parseSubstationConfiguration } from "@substation/domain";
import { prepareSnapshot } from "./snapshot";
import { Prisma, ScdGenerationStatus, type PrismaClient } from "./generated/client";
import {
  InvalidIdentifierError,
  OUTBOX_EVENT_NAME,
  OUTBOX_PAYLOAD_VERSION,
  RevisionNotFoundError,
} from "./generations";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIVE_STATES = [ScdGenerationStatus.QUEUED, ScdGenerationStatus.RUNNING] as const;

export class SubstationInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SubstationInputError";
  }
}

export class SubstationNotFoundError extends Error {
  constructor() {
    super("Substation not found.");
    this.name = "SubstationNotFoundError";
  }
}

export class RevisionConflictError extends Error {
  constructor() {
    super("A concurrent revision was created. Please retry.");
    this.name = "RevisionConflictError";
  }
}

function assertUuid(value: string): void {
  if (!UUID_PATTERN.test(value)) throw new InvalidIdentifierError();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSubstationInput(value: unknown): { name: string; description: string | null } {
  if (!isRecord(value)) throw new SubstationInputError("Name is required.");
  for (const key of Object.keys(value)) {
    if (key !== "name" && key !== "description") throw new SubstationInputError("Only name and description are accepted.");
  }
  if (typeof value.name !== "string") throw new SubstationInputError("Name is required.");
  const name = value.name.trim();
  if (name.length < 1 || name.length > 100) throw new SubstationInputError("Name must contain between 1 and 100 characters.");
  if (value.description !== undefined && value.description !== null && typeof value.description !== "string") {
    throw new SubstationInputError("Description must be text.");
  }
  const description = typeof value.description === "string" ? value.description.trim() : "";
  if (description.length > 1000) throw new SubstationInputError("Description cannot exceed 1000 characters.");
  return { name, description: description || null };
}

export interface SubstationSummary {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  revisionCount: number;
  latestRevisionVersion: number | null;
}

export interface GenerationView {
  jobId: string;
  revisionId: string;
  revisionVersion: number;
  generatorVersion: string;
  status: ScdGenerationStatus;
  attemptCount: number;
  createdAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
  errorMessage: string | null;
  isCurrent: boolean;
  canDownload: boolean;
  artifact: { fileName: string; mimeType: string; byteSize: number; checksum: string } | null;
}

export interface SubstationDetail extends SubstationSummary {
  revisions: Array<{ id: string; version: number; content: Prisma.JsonValue; contentHash: string; createdAt: Date }>;
  generations: GenerationView[];
}

function generationView(
  generation: {
    id: string;
    revisionId: string;
    generatorVersion: string;
    status: ScdGenerationStatus;
    attemptCount: number;
    createdAt: Date;
    startedAt: Date | null;
    finishedAt: Date | null;
    errorMessage: string | null;
    revision: { version: number; substationId: string };
    artifact: { fileName: string; mimeType: string; byteSize: number; checksum: string } | null;
  },
  latestRevisionId: string | null,
): GenerationView {
  const isCurrent = generation.revisionId === latestRevisionId;
  return {
    jobId: generation.id,
    revisionId: generation.revisionId,
    revisionVersion: generation.revision.version,
    generatorVersion: generation.generatorVersion,
    status: generation.status,
    attemptCount: generation.attemptCount,
    createdAt: generation.createdAt,
    startedAt: generation.startedAt,
    finishedAt: generation.finishedAt,
    errorMessage: generation.errorMessage,
    isCurrent,
    canDownload: isCurrent && generation.status === ScdGenerationStatus.SUCCEEDED && generation.artifact !== null,
    artifact: generation.artifact,
  };
}

export async function createSubstation(db: PrismaClient, value: unknown) {
  return db.substation.create({ data: parseSubstationInput(value) });
}

export async function listSubstations(db: PrismaClient): Promise<SubstationSummary[]> {
  const substations = await db.substation.findMany({
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: { revisions: { orderBy: { version: "desc" }, take: 1, select: { version: true } }, _count: { select: { revisions: true } } },
  });
  return substations.map((substation) => ({
    id: substation.id,
    name: substation.name,
    description: substation.description,
    createdAt: substation.createdAt,
    revisionCount: substation._count.revisions,
    latestRevisionVersion: substation.revisions[0]?.version ?? null,
  }));
}

export async function getSubstationDetail(db: PrismaClient, substationId: string): Promise<SubstationDetail> {
  assertUuid(substationId);
  const substation = await db.substation.findUnique({
    where: { id: substationId },
    include: {
      revisions: { orderBy: { version: "desc" } },
      _count: { select: { revisions: true } },
    },
  });
  if (!substation) throw new SubstationNotFoundError();
  const latestRevisionId = substation.revisions[0]?.id ?? null;
  const generations = await db.scdGeneration.findMany({
    where: { revision: { substationId } },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    include: {
      revision: { select: { version: true, substationId: true } },
      artifact: { select: { fileName: true, mimeType: true, byteSize: true, checksum: true } },
    },
  });
  return {
    id: substation.id,
    name: substation.name,
    description: substation.description,
    createdAt: substation.createdAt,
    revisionCount: substation._count.revisions,
    latestRevisionVersion: substation.revisions[0]?.version ?? null,
    revisions: substation.revisions.map(({ id, version, content, contentHash, createdAt }) => ({ id, version, content, contentHash, createdAt })),
    generations: generations.map((generation) => generationView(generation, latestRevisionId)),
  };
}

export async function createConfigurationRevision(
  db: PrismaClient,
  substationId: string,
  value: unknown,
  expectedLatestVersion?: number,
) {
  assertUuid(substationId);
  const configuration = parseSubstationConfiguration(value);
  const snapshot = prepareSnapshot(configuration);
  try {
    return await db.$transaction(async (tx) => {
      const substation = await tx.substation.findUnique({ where: { id: substationId }, select: { id: true } });
      if (!substation) throw new SubstationNotFoundError();
      const latest = await tx.configurationRevision.findFirst({ where: { substationId }, orderBy: { version: "desc" }, select: { version: true } });
      if (expectedLatestVersion !== undefined && expectedLatestVersion !== (latest?.version ?? 0)) throw new RevisionConflictError();
      return tx.configurationRevision.create({
        data: {
          substationId,
          version: (latest?.version ?? 0) + 1,
          content: snapshot.content as Prisma.InputJsonValue,
          contentHash: snapshot.contentHash,
        },
      });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new RevisionConflictError();
    throw error;
  }
}

export async function requestLatestGeneration(db: PrismaClient, substationId: string) {
  assertUuid(substationId);
  try {
    return await db.$transaction(async (tx) => {
      const substation = await tx.substation.findUnique({ where: { id: substationId }, select: { id: true } });
      if (!substation) throw new SubstationNotFoundError();
      const revision = await tx.configurationRevision.findFirst({ where: { substationId }, orderBy: { version: "desc" }, select: { id: true } });
      if (!revision) throw new RevisionNotFoundError();
      const existing = await tx.scdGeneration.findFirst({
        where: { revisionId: revision.id, generatorVersion: SIMULATOR_VERSION, status: { in: [...ACTIVE_STATES] } },
        orderBy: { createdAt: "asc" },
      });
      if (existing) return { generation: existing, created: false };
      const generation = await tx.scdGeneration.create({ data: { revisionId: revision.id, generatorVersion: SIMULATOR_VERSION } });
      await tx.generationOutbox.create({ data: { generationId: generation.id, eventName: OUTBOX_EVENT_NAME, payloadVersion: OUTBOX_PAYLOAD_VERSION } });
      return { generation, created: true };
    });
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
    const revision = await db.configurationRevision.findFirst({ where: { substationId }, orderBy: { version: "desc" }, select: { id: true } });
    if (!revision) throw new RevisionNotFoundError();
    const generation = await db.scdGeneration.findFirst({
      where: { revisionId: revision.id, generatorVersion: SIMULATOR_VERSION, status: { in: [...ACTIVE_STATES] } },
      orderBy: { createdAt: "asc" },
    });
    if (!generation) throw error;
    return { generation, created: false };
  }
}

export async function getGenerationView(db: PrismaClient, jobId: string): Promise<GenerationView | null> {
  assertUuid(jobId);
  const generation = await db.scdGeneration.findUnique({
    where: { id: jobId },
    include: {
      revision: { select: { version: true, substationId: true } },
      artifact: { select: { fileName: true, mimeType: true, byteSize: true, checksum: true } },
    },
  });
  if (!generation) return null;
  const latest = await db.configurationRevision.findFirst({
    where: { substationId: generation.revision.substationId },
    orderBy: { version: "desc" },
    select: { id: true },
  });
  return generationView(generation, latest?.id ?? null);
}

export { ConfigurationValidationError };
