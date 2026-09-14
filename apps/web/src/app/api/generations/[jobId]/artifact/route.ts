import { NextResponse } from "next/server";
import {
  PostgresArtifactStore,
  ScdGenerationStatus,
  createPrismaClient,
} from "@substation/db";
import { isUuid } from "../../validation";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const { jobId } = await context.params;
  if (!isUuid(jobId)) return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
  const db = createPrismaClient();
  try {
    const generation = await db.scdGeneration.findUnique({
      where: { id: jobId },
      select: { status: true, revisionId: true, revision: { select: { substationId: true } } },
    });
    if (!generation) return NextResponse.json({ error: "Generation not found." }, { status: 404 });
    if (generation.status !== ScdGenerationStatus.SUCCEEDED) {
      return NextResponse.json({ error: "Artifact is not available for this generation state." }, { status: 409 });
    }
    const latestRevision = await db.configurationRevision.findFirst({
      where: { substationId: generation.revision.substationId },
      orderBy: { version: "desc" },
      select: { id: true },
    });
    if (latestRevision?.id !== generation.revisionId) {
      return NextResponse.json({ error: "This SCD is obsolete because a newer configuration revision exists." }, { status: 409 });
    }
    const artifact = await new PostgresArtifactStore(db).getByGenerationId(jobId);
    if (!artifact) return NextResponse.json({ error: "Artifact metadata is inconsistent." }, { status: 500 });
    return new Response(Buffer.from(artifact.bytes), {
      status: 200,
      headers: {
        "Content-Type": artifact.mimeType,
        "Content-Length": String(artifact.byteSize),
        "Content-Disposition": `attachment; filename="${artifact.fileName}"`,
        "X-Content-SHA256": artifact.checksum,
        "X-SCD-Conformance": "none-simulated",
      },
    });
  } finally {
    await db.$disconnect();
  }
}
