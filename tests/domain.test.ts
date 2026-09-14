import { describe, expect, it } from "vitest";
import {
  ConfigurationValidationError,
  parseSubstationConfiguration,
} from "../packages/domain/src/index";

describe("substation configuration contract", () => {
  it("normalizes supported fields", () => {
    expect(parseSubstationConfiguration({
      substationName: "  Demo  ",
      elements: [{ id: "IED_01", name: "  Protection  ", type: "IED" }],
    })).toEqual({
      substationName: "Demo",
      elements: [{ id: "IED_01", name: "Protection", type: "IED" }],
    });
  });

  it("rejects duplicate identifiers and unexpected fields", () => {
    expect(() => parseSubstationConfiguration({
      substationName: "Demo",
      unexpected: true,
      elements: [
        { id: "BAY_01", name: "Bay", type: "BAY" },
        { id: "BAY_01", name: "Duplicate", type: "BAY" },
      ],
    })).toThrow(ConfigurationValidationError);
  });
});
