import { createHash } from "node:crypto";
import { XMLValidator } from "fast-xml-parser";
import { describe, expect, it } from "vitest";
import { assertArtifactSize, generateSimulatedScd } from "../packages/scd/src/index";

const input = {
  substationName: 'Demo & "safe"',
  elements: [
    { id: "IED_02", name: "Second > device", type: "IED" },
    { id: "BAY_01", name: "First < bay", type: "BAY" },
  ],
};

describe("simulated SCD generator", () => {
  it("produces deterministic, valid and explicitly non-conformant XML", () => {
    const first = generateSimulatedScd(input);
    const second = generateSimulatedScd(structuredClone(input));

    expect(Buffer.from(first.bytes).equals(Buffer.from(second.bytes))).toBe(true);
    expect(first.metadata).toEqual(second.metadata);
    expect(XMLValidator.validate(first.xml)).toBe(true);
    expect(first.xml).toContain('data-conformance="none"');
    expect(first.xml).toContain('simulated="true"');
    expect(first.xml.indexOf('id="BAY_01"')).toBeLessThan(first.xml.indexOf('id="IED_02"'));
    expect(first.xml).toContain("Demo &amp; &quot;safe&quot;");
    expect(first.metadata.checksum).toBe(createHash("sha256").update(first.bytes).digest("hex"));
    expect(first.metadata.byteSize).toBe(first.bytes.byteLength);
    expect(first.metadata.fileName).toMatch(/^simulated-[0-9a-f]{12}\.scd$/);
  });

  it("rejects artifacts over the explicit 1 MiB limit", () => {
    expect(() => assertArtifactSize(new Uint8Array(1024 * 1024 + 1))).toThrow(/1 MiB/);
  });
});
