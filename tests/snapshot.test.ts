import { describe, expect, it } from "vitest";
import { prepareSnapshot } from "../packages/db/src/snapshot";

describe("Immutable revision snapshots", () => {
  it("ignores object key order, including nested objects", () => {
    expect(prepareSnapshot({ z: 2, a: { y: true, x: 1 } }))
      .toEqual(prepareSnapshot({ a: { x: 1, y: true }, z: 2 }));
  });
  it("preserves array order and changes the hash with the content", () => {
    expect(prepareSnapshot({ a: [1, 2] }).contentHash)
      .not.toBe(prepareSnapshot({ a: [2, 1] }).contentHash);
  });
  it("clones the source so later edits cannot change the snapshot", () => {
    const original = { a: { b: "before" } };
    const snapshot = prepareSnapshot(original);
    original.a.b = "after";
    expect(snapshot.content).toEqual({ a: { b: "before" } });
    expect(snapshot.contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
  it.each([undefined, null, [], 1, { n: NaN }, { n: Infinity }, { n: undefined }, { date: new Date() }])(
    "rejects a non-JSON object or invalid value: %s", (input) => {
      expect(() => prepareSnapshot(input)).toThrow(TypeError);
    },
  );
  it("rejects cycles", () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => prepareSnapshot(cyclic)).toThrow("cyclic");
  });
});
