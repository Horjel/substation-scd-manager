import type { ArtifactInput, ArtifactStore, StoredArtifact } from "@substation/storage";
import type { Prisma, PrismaClient } from "./generated/client";

type ArtifactDatabase = Pick<PrismaClient, "generatedArtifact"> | Pick<Prisma.TransactionClient, "generatedArtifact">;

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
  return Buffer.from(left).equals(Buffer.from(right));
}

export class ArtifactConflictError extends Error {
  constructor() {
    super("An artifact key is already associated with different content.");
    this.name = "ArtifactConflictError";
  }
}

export class PostgresArtifactStore implements ArtifactStore {
  constructor(private readonly db: ArtifactDatabase) {}

  async put(input: ArtifactInput): Promise<{ created: boolean }> {
    const existing = await this.db.generatedArtifact.findFirst({
      where: { OR: [{ generationId: input.generationId }, { storageKey: input.storageKey }] },
    });
    if (existing) {
      if (
        existing.generationId !== input.generationId ||
        existing.storageKey !== input.storageKey ||
        existing.fileName !== input.fileName ||
        existing.mimeType !== input.mimeType ||
        existing.byteSize !== input.byteSize ||
        existing.checksum !== input.checksum ||
        !sameBytes(existing.content, input.bytes)
      ) {
        throw new ArtifactConflictError();
      }
      return { created: false };
    }

    await this.db.generatedArtifact.create({
      data: {
        generationId: input.generationId,
        storageProvider: "postgresql",
        storageKey: input.storageKey,
        fileName: input.fileName,
        mimeType: input.mimeType,
        byteSize: input.byteSize,
        checksum: input.checksum,
        content: new Uint8Array(input.bytes),
      },
    });
    return { created: true };
  }

  async getByGenerationId(generationId: string): Promise<StoredArtifact | null> {
    const artifact = await this.db.generatedArtifact.findUnique({ where: { generationId } });
    if (!artifact) return null;
    return {
      generationId: artifact.generationId,
      storageKey: artifact.storageKey,
      fileName: artifact.fileName,
      mimeType: "application/xml",
      byteSize: artifact.byteSize,
      checksum: artifact.checksum,
      bytes: artifact.content,
      createdAt: artifact.createdAt,
    };
  }
}
