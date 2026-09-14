import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import {
  isUuid,
  parseGenerationRequest,
} from "../apps/web/src/app/api/generations/validation";

describe("minimal generation API boundary", () => {
  it("accepts only a revision UUID", () => {
    expect(parseGenerationRequest({
      revisionId: "10000000-0000-4000-8000-000000000001",
    })).toEqual({ revisionId: "10000000-0000-4000-8000-000000000001" });
    expect(isUuid("not-an-id")).toBe(false);
    expect(() => parseGenerationRequest({
      revisionId: "10000000-0000-4000-8000-000000000001",
      configuration: {},
    })).toThrow();
  });

  it("keeps queue and generator imports outside the HTTP acceptance route", async () => {
    const source = await readFile("apps/web/src/app/api/generations/route.ts", "utf8");
    expect(source).not.toMatch(/@substation\/(queue|scd|worker)/);
    expect(source).not.toMatch(/generateSimulatedScd|BullMq/);
  });
});
