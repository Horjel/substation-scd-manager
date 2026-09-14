import { randomUUID } from "node:crypto";
import { UnrecoverableError, type Job } from "bullmq";
import {
  ConfigurationValidationError,
} from "@substation/domain";
import {
  MAX_GENERATION_ATTEMPTS,
  claimGeneration,
  completeGeneration,
  failExhaustedQueuedGeneration,
  recordGenerationFailure,
  type PrismaClient,
} from "@substation/db";
import { parseGenerationJobPayload, type GenerationJobPayload } from "@substation/queue";
import { generateSimulatedScd, type GeneratedScd } from "@substation/scd";

export class TransientGenerationError extends Error {
  constructor() {
    super("A transient generation error occurred.");
    this.name = "TransientGenerationError";
  }
}

export class PermanentGenerationError extends Error {
  constructor() {
    super("The generation input cannot be processed.");
    this.name = "PermanentGenerationError";
  }
}

export type ScdGenerator = (input: unknown) => GeneratedScd | Promise<GeneratedScd>;

export interface GenerationProcessorOptions {
  db: PrismaClient;
  generator?: ScdGenerator;
  now?: () => Date;
  tokenFactory?: () => string;
  leaseMs?: number;
}

function classify(error: unknown): { retryable: boolean; message: string } {
  if (error instanceof ConfigurationValidationError || error instanceof PermanentGenerationError) {
    return { retryable: false, message: "The configuration revision is invalid." };
  }
  return { retryable: true, message: "A transient generation error occurred." };
}

export function createGenerationProcessor(options: GenerationProcessorOptions) {
  const generator = options.generator ?? generateSimulatedScd;
  const now = options.now ?? (() => new Date());
  const tokenFactory = options.tokenFactory ?? randomUUID;
  const leaseMs = options.leaseMs ?? 60_000;

  return async (job: Job<GenerationJobPayload | unknown>) => {
    let payload: GenerationJobPayload;
    try {
      payload = parseGenerationJobPayload(job.data);
    } catch {
      throw new UnrecoverableError("Invalid generation job contract.");
    }

    const startedAt = now();
    const attemptToken = tokenFactory();
    const claimed = await claimGeneration(options.db, {
      generationId: payload.jobId,
      attemptToken,
      now: startedAt,
      leaseExpiresAt: new Date(startedAt.getTime() + leaseMs),
    });
    if (!claimed) {
      await failExhaustedQueuedGeneration(options.db, payload.jobId, now());
      return { outcome: "ignored", jobId: payload.jobId };
    }

    try {
      const generated = await generator(claimed.revision.content);
      const completed = await completeGeneration(options.db, {
        generationId: claimed.id,
        attemptToken,
        finishedAt: now(),
        artifact: {
          generationId: claimed.id,
          storageKey: `scd/${claimed.id}/${generated.metadata.checksum}.scd`,
          fileName: generated.metadata.fileName,
          mimeType: generated.metadata.mimeType,
          byteSize: generated.metadata.byteSize,
          checksum: generated.metadata.checksum,
          bytes: generated.bytes,
        },
      });
      return { outcome: completed ? "succeeded" : "stale", jobId: payload.jobId };
    } catch (error) {
      const failure = classify(error);
      const retry = failure.retryable && claimed.attemptCount < MAX_GENERATION_ATTEMPTS;
      await recordGenerationFailure(options.db, {
        generationId: claimed.id,
        attemptToken,
        failedAt: now(),
        message: failure.message,
        retry,
      });
      if (!retry) throw new UnrecoverableError(failure.message);
      throw new TransientGenerationError();
    }
  };
}
