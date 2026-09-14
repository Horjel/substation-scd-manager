import { createHash } from "node:crypto";
import { parseSubstationConfiguration, SIMULATOR_VERSION } from "@substation/domain";
import { MAX_ARTIFACT_BYTES } from "@substation/storage";

export interface GeneratedScd {
  bytes: Uint8Array;
  xml: string;
  metadata: {
    generatorVersion: typeof SIMULATOR_VERSION;
    mimeType: "application/xml";
    fileName: string;
    byteSize: number;
    checksum: string;
  };
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function compareIds(left: { id: string }, right: { id: string }): number {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

export function assertArtifactSize(bytes: Uint8Array): void {
  if (bytes.byteLength > MAX_ARTIFACT_BYTES) throw new Error("The simulated artifact exceeds the 1 MiB limit.");
}

export function generateSimulatedScd(input: unknown): GeneratedScd {
  const configuration = parseSubstationConfiguration(input);
  const elementLines = [...configuration.elements].sort(compareIds).map(
    (element) =>
      `      <Element id="${escapeXml(element.id)}" name="${escapeXml(element.name)}" type="${element.type}" />`,
  );
  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<SCD data-generator="substation-scd-manager-simulator" data-conformance="none">',
    `  <Header generatorVersion="${SIMULATOR_VERSION}" simulated="true" />`,
    `  <Substation name="${escapeXml(configuration.substationName)}">`,
    "    <SimulatedElements>",
    ...elementLines,
    "    </SimulatedElements>",
    "  </Substation>",
    "</SCD>",
    "",
  ].join("\n");
  const bytes = Buffer.from(xml, "utf8");
  assertArtifactSize(bytes);
  const checksum = createHash("sha256").update(bytes).digest("hex");

  return {
    bytes,
    xml,
    metadata: {
      generatorVersion: SIMULATOR_VERSION,
      mimeType: "application/xml",
      fileName: `simulated-${checksum.slice(0, 12)}.scd`,
      byteSize: bytes.byteLength,
      checksum,
    },
  };
}
