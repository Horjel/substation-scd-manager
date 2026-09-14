import { createHash } from "node:crypto";

export type JsonValue = string | number | boolean | null | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

function normalize(value: unknown, ancestors = new Set<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "object" || value === null) throw new TypeError("Snapshot must contain only JSON values.");
  if (ancestors.has(value)) throw new TypeError("Snapshot cannot be cyclic.");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return Array.from(value, (item) => normalize(item, ancestors));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      throw new TypeError("Snapshot must contain plain JSON objects.");
    }
    if (Object.getOwnPropertySymbols(value).length) throw new TypeError("Symbol keys are not JSON.");
    const object = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(object).sort().map((key) => [key, normalize(object[key], ancestors)]));
  } finally {
    ancestors.delete(value);
  }
}

// This is JSON canonicalization, not IEC 61850 domain validation.
export function prepareSnapshot(value: unknown): { content: JsonObject; contentHash: string } {
  const content = normalize(value);
  if (content === null || Array.isArray(content) || typeof content !== "object") {
    throw new TypeError("The snapshot root must be a JSON object.");
  }
  const contentHash = createHash("sha256").update(JSON.stringify(content), "utf8").digest("hex");
  return { content, contentHash };
}
