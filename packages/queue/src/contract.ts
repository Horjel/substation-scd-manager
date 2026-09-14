export const GENERATION_QUEUE_NAME = "scd-generation-v1";
export const GENERATION_JOB_NAME = "generate-scd.v1";
export const GENERATION_JOB_CONTRACT_VERSION = 1;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface GenerationJobPayload {
  jobId: string;
}

export class InvalidGenerationJobError extends Error {
  constructor() {
    super("Invalid generate-scd.v1 job payload.");
    this.name = "InvalidGenerationJobError";
  }
}

export function parseGenerationJobPayload(value: unknown): GenerationJobPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidGenerationJobError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.jobId !== "string" || !UUID_PATTERN.test(record.jobId)) {
    throw new InvalidGenerationJobError();
  }
  return { jobId: record.jobId };
}
