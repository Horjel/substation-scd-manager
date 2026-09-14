import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GenerationPanel } from "../apps/web/src/components/GenerationPanel";
import type { GenerationDto, GenerationStatus } from "../apps/web/src/lib/contracts";

function generation(status: GenerationStatus, index: number, overrides: Partial<GenerationDto> = {}): GenerationDto {
  return {
    jobId: `00000000-0000-4000-8000-00000000000${index}`,
    revisionId: "10000000-0000-4000-8000-000000000001",
    revisionVersion: 1,
    generatorVersion: "simulator-v1",
    status,
    attemptCount: status === "QUEUED" ? 0 : 1,
    createdAt: "2026-01-01T00:00:00.000Z",
    startedAt: status === "QUEUED" ? null : "2026-01-01T00:00:01.000Z",
    finishedAt: status === "SUCCEEDED" || status === "FAILED" ? "2026-01-01T00:00:02.000Z" : null,
    errorMessage: status === "FAILED" ? "C:\\private\\secret.txt: database-password" : null,
    isCurrent: true,
    canDownload: status === "SUCCEEDED",
    artifact: status === "SUCCEEDED" ? { fileName: "simulated.scd", mimeType: "application/xml", byteSize: 10, checksum: "a".repeat(64) } : null,
    ...overrides,
  };
}

describe("Panel de generaciones", () => {
  it("presenta los cuatro estados, una descarga vigente y fallos sanitizados", () => {
    const html = renderToStaticMarkup(<GenerationPanel
      substationId="20000000-0000-4000-8000-000000000002"
      hasRevisions
      initialGenerations={[
        generation("QUEUED", 1),
        generation("RUNNING", 2),
        generation("SUCCEEDED", 3),
        generation("FAILED", 4),
      ]}
    />);
    expect(html).toContain("En cola");
    expect(html).toContain("Procesando");
    expect(html).toContain("Completado");
    expect(html).toContain("Fallido");
    expect(html).toContain("Descargar SCD");
    expect(html).toContain("La generación no pudo completarse");
    expect(html).not.toContain("private");
    expect(html).not.toContain("database-password");
  });

  it("deshabilita la descarga y explica cuándo un resultado está obsoleto", () => {
    const html = renderToStaticMarkup(<GenerationPanel
      substationId="20000000-0000-4000-8000-000000000002"
      hasRevisions
      initialGenerations={[generation("SUCCEEDED", 1, { isCurrent: false, canDownload: false })]}
    />);
    expect(html).toContain("Obsoleto: existe una revisión de configuración más reciente.");
    expect(html).toContain("Descarga deshabilitada");
    expect(html).not.toContain("href=\"/api/generations/");
  });
});
