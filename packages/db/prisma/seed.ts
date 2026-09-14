import "dotenv/config";
import { createPrismaClient } from "../src/client";
import { prepareSnapshot } from "../src/snapshot";

const db = createPrismaClient();
const substationId = "00000000-0000-4000-8000-000000000001";
const revisionId = "00000000-0000-4000-8000-000000000002";
const date = new Date("2026-01-01T00:00:00.000Z");
const snapshot = prepareSnapshot({
  substationName: "Subestación de demostración",
  elements: [{ id: "IED_01", name: "Equipo ficticio", type: "IED" }],
});

try {
  await db.$transaction(async (tx) => {
    const existing = await tx.substation.findUnique({ where: { id: substationId } });
    if (existing && (existing.name !== "Subestación de demostración" || existing.description !== "Datos ficticios para desarrollo")) {
      throw new Error("Seed conflicts with existing substation; no data was overwritten.");
    }
    if (!existing) await tx.substation.create({
      data: { id: substationId, name: "Subestación de demostración", description: "Datos ficticios para desarrollo", createdAt: date, updatedAt: date },
    });
    const revision = await tx.configurationRevision.findUnique({ where: { id: revisionId } });
    if (revision && (revision.substationId !== substationId || revision.version !== 1 ||
      revision.contentHash !== snapshot.contentHash || prepareSnapshot(revision.content).contentHash !== snapshot.contentHash)) {
      throw new Error("Seed conflicts with existing immutable revision; no data was overwritten.");
    }
    if (!revision) await tx.configurationRevision.create({
      data: { id: revisionId, substationId, version: 1, ...snapshot, createdAt: date },
    });
  });
  console.log("Deterministic demo seed ready; no generation jobs created.");
} finally {
  await db.$disconnect();
}
