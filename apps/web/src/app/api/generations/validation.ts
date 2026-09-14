import { InvalidIdentifierError } from "@substation/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

export function parseGenerationRequest(value: unknown): { revisionId: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new InvalidIdentifierError();
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length !== 1 || typeof record.revisionId !== "string" || !isUuid(record.revisionId)) {
    throw new InvalidIdentifierError();
  }
  return { revisionId: record.revisionId };
}
