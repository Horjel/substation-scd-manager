import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createPrismaClient, requestLatestGeneration } from "../../packages/db/src/index";
import { GET as listSubstations, POST as createSubstation } from "../../apps/web/src/app/api/substations/route";
import { GET as getSubstation } from "../../apps/web/src/app/api/substations/[substationId]/route";
import { POST as createRevision } from "../../apps/web/src/app/api/substations/[substationId]/revisions/route";
import { GET as listGenerations, POST as createGeneration } from "../../apps/web/src/app/api/substations/[substationId]/generations/route";
import { GET as getGeneration } from "../../apps/web/src/app/api/generations/[jobId]/route";
import { GET as downloadArtifact } from "../../apps/web/src/app/api/generations/[jobId]/artifact/route";

const databaseUrl = process.env.TEST_DATABASE_URL;
if (!databaseUrl) throw new Error("TEST_DATABASE_URL is required.");
const previousDatabaseUrl = process.env.DATABASE_URL;
const db = createPrismaClient(databaseUrl);
const request = (url: string, method = "GET", body?: unknown) => new Request(url, {
  method,
  ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }),
});
const context = (substationId: string) => ({ params: Promise.resolve({ substationId }) });
const jobContext = (jobId: string) => ({ params: Promise.resolve({ jobId }) });

async function clearState() {
  await db.$executeRawUnsafe('TRUNCATE TABLE "GeneratedArtifact", "GenerationOutbox", "ScdGeneration", "ConfigurationRevision", "Substation" CASCADE');
}

beforeAll(() => { process.env.DATABASE_URL = databaseUrl; });
beforeEach(clearState);
afterAll(async () => {
  await clearState();
  await db.$disconnect();
  if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = previousDatabaseUrl;
});

describe("API vertical de subestaciones", () => {
  it("crea, lista y consulta una subestación con persistencia real", async () => {
    const createdResponse = await createSubstation(request("http://test/api/substations", "POST", { name: "  SE API  ", description: "Demo" }));
    expect(createdResponse.status).toBe(201);
    const created = (await createdResponse.json()) as { substation: { id: string; name: string } };
    expect(created.substation.name).toBe("SE API");

    const listResponse = await listSubstations();
    expect(listResponse.status).toBe(200);
    expect(((await listResponse.json()) as { substations: unknown[] }).substations).toHaveLength(1);

    const detailResponse = await getSubstation(request("http://test"), context(created.substation.id));
    const detail = (await detailResponse.json()) as { substation: { id: string; revisionCount: number } };
    expect(detail).toMatchObject({ substation: { id: created.substation.id, revisionCount: 0 } });
    expect(await db.substation.findUnique({ where: { id: created.substation.id } })).not.toBeNull();
  });

  it("valida entradas y crea revisiones consecutivas sin modificar snapshots previos", async () => {
    expect((await createSubstation(request("http://test", "POST", { name: "" }))).status).toBe(422);
    const substation = await db.substation.create({ data: { name: "SE Revisions" } });
    const firstPayload = { substationName: "SE Revisions", elements: [{ id: "IED_01", name: "Protection", type: "IED" }] };
    const first = await createRevision(request("http://test", "POST", firstPayload), context(substation.id));
    expect(first.status).toBe(201);
    const invalid = await createRevision(request("http://test", "POST", { substationName: "SE", elements: [] }), context(substation.id));
    expect(invalid.status).toBe(422);
    const second = await createRevision(request("http://test", "POST", { ...firstPayload, elements: [{ id: "BAY_01", name: "Bay", type: "BAY" }] }), context(substation.id));
    expect(second.status).toBe(201);
    const revisions = await db.configurationRevision.findMany({ where: { substationId: substation.id }, orderBy: { version: "asc" } });
    expect(revisions.map((revision) => revision.version)).toEqual([1, 2]);
    expect(revisions[0]?.content).toEqual(firstPayload);
  });

  it("responde 409 cuando el cliente intenta guardar desde una versión desactualizada", async () => {
    const substation = await db.substation.create({ data: { name: "SE Conflict" } });
    const payload = { substationName: "SE Conflict", elements: [{ id: "IED_01", name: "IED", type: "IED" }] };
    const firstRequest = request("http://test", "POST", payload);
    firstRequest.headers.set("If-Match", "0");
    expect((await createRevision(firstRequest, context(substation.id))).status).toBe(201);
    const staleRequest = request("http://test", "POST", payload);
    staleRequest.headers.set("If-Match", "0");
    const conflict = await createRevision(staleRequest, context(substation.id));
    expect(conflict.status).toBe(409);
    expect(await db.configurationRevision.count({ where: { substationId: substation.id } })).toBe(1);
  });

  it("solicita la revisión vigente, reutiliza el trabajo activo y consulta PostgreSQL", async () => {
    const substation = await db.substation.create({ data: { name: "SE Queue" } });
    await createRevision(request("http://test", "POST", { substationName: "SE Queue", elements: [{ id: "IED_01", name: "IED", type: "IED" }] }), context(substation.id));
    const firstResponse = await createGeneration(request("http://test", "POST"), context(substation.id));
    const secondResponse = await createGeneration(request("http://test", "POST"), context(substation.id));
    expect(firstResponse.status).toBe(202);
    expect(secondResponse.status).toBe(202);
    const first = (await firstResponse.json()) as { jobId: string; accepted: boolean };
    const second = (await secondResponse.json()) as { jobId: string; accepted: boolean };
    expect(second).toEqual(expect.objectContaining({ jobId: first.jobId, accepted: false }));
    expect(await db.generationOutbox.count()).toBe(1);
    const status = await getGeneration(request("http://test"), jobContext(first.jobId));
    expect(await status.json()).toEqual(expect.objectContaining({ jobId: first.jobId, status: "QUEUED", isCurrent: true, canDownload: false }));
    const listed = await listGenerations(request("http://test"), context(substation.id));
    expect(((await listed.json()) as { generations: unknown[] }).generations).toHaveLength(1);
  });

  it("revierte la generación si el outbox no puede persistirse", async () => {
    const substation = await db.substation.create({ data: { name: "SE Atomic" } });
    await db.configurationRevision.create({ data: { substationId: substation.id, version: 1, content: { substationName: "SE Atomic", elements: [{ id: "IED_01", name: "IED", type: "IED" }] }, contentHash: "d".repeat(64) } });
    await db.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION test_reject_generation_outbox() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'controlled outbox failure'; END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER test_reject_generation_outbox
      BEFORE INSERT ON "GenerationOutbox"
      FOR EACH ROW EXECUTE FUNCTION test_reject_generation_outbox();
    `);
    try {
      await expect(requestLatestGeneration(db, substation.id)).rejects.toThrow();
      expect(await db.scdGeneration.count()).toBe(0);
      expect(await db.generationOutbox.count()).toBe(0);
    } finally {
      await db.$executeRawUnsafe(`
        DROP TRIGGER IF EXISTS test_reject_generation_outbox ON "GenerationOutbox";
        DROP FUNCTION IF EXISTS test_reject_generation_outbox();
      `);
    }
  });

  it("marca un SCD anterior como obsoleto y rechaza su descarga", async () => {
    const substation = await db.substation.create({ data: { name: "SE Obsolete" } });
    const revision = await db.configurationRevision.create({ data: { substationId: substation.id, version: 1, content: { substationName: "SE Obsolete", elements: [{ id: "IED_01", name: "IED", type: "IED" }] }, contentHash: "a".repeat(64) } });
    const generation = await db.scdGeneration.create({ data: { revisionId: revision.id, generatorVersion: "simulator-v1", status: "SUCCEEDED", attemptCount: 1, startedAt: new Date("2026-01-01T00:00:00.000Z"), finishedAt: new Date("2026-01-01T00:00:01.000Z") } });
    await db.generatedArtifact.create({ data: { generationId: generation.id, storageProvider: "postgresql", storageKey: `scd/${generation.id}/test.scd`, fileName: "test.scd", mimeType: "application/xml", byteSize: 7, checksum: "b".repeat(64), content: Buffer.from("<SCD />") } });
    await db.configurationRevision.create({ data: { substationId: substation.id, version: 2, content: { substationName: "SE Obsolete", elements: [{ id: "BAY_01", name: "Bay", type: "BAY" }] }, contentHash: "c".repeat(64) } });

    const status = await getGeneration(request("http://test"), jobContext(generation.id));
    expect(await status.json()).toEqual(expect.objectContaining({ isCurrent: false, canDownload: false }));
    const download = await downloadArtifact(request("http://test"), jobContext(generation.id));
    expect(download.status).toBe(409);
    expect(await download.json()).toEqual({ error: "This SCD is obsolete because a newer configuration revision exists." });
  });
});
