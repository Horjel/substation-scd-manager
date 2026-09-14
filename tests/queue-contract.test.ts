import { describe, expect, it } from "vitest";
import {
  GENERATION_JOB_NAME,
  InvalidGenerationJobError,
  parseGenerationJobPayload,
} from "../packages/queue/src/index";

describe("versioned BullMQ contract", () => {
  it("contains only a stable UUID", () => {
    expect(GENERATION_JOB_NAME).toBe("generate-scd.v1");
    expect(parseGenerationJobPayload({ jobId: "10000000-0000-4000-8000-000000000001" })).toEqual({
      jobId: "10000000-0000-4000-8000-000000000001",
    });
  });

  it("rejects copied state and malformed identifiers", () => {
    expect(() => parseGenerationJobPayload({
      jobId: "10000000-0000-4000-8000-000000000001",
      configuration: {},
    })).toThrow(InvalidGenerationJobError);
    expect(() => parseGenerationJobPayload({ jobId: "not-a-uuid" })).toThrow(InvalidGenerationJobError);
  });
});
