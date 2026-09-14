import { NextResponse } from "next/server";
import {
  InvalidIdentifierError,
  RevisionNotFoundError,
  createPrismaClient,
  requestGeneration,
} from "@substation/db";
import { SIMULATOR_VERSION } from "@substation/domain";
import { parseGenerationRequest } from "./validation";

export async function POST(request: Request) {
  const db = createPrismaClient();
  try {
    const body = parseGenerationRequest(await request.json());
    const result = await requestGeneration(db, {
      revisionId: body.revisionId,
      generatorVersion: SIMULATOR_VERSION,
    });
    return NextResponse.json(
      {
        jobId: result.generation.id,
        status: result.generation.status,
        accepted: result.created,
        statusUrl: `/api/generations/${result.generation.id}`,
        artifactUrl: `/api/generations/${result.generation.id}/artifact`,
      },
      { status: 202 },
    );
  } catch (error) {
    if (error instanceof InvalidIdentifierError || error instanceof SyntaxError) {
      return NextResponse.json({ error: "A valid revisionId is required." }, { status: 400 });
    }
    if (error instanceof RevisionNotFoundError) {
      return NextResponse.json({ error: "Configuration revision not found." }, { status: 404 });
    }
    return NextResponse.json({ error: "Generation request could not be accepted." }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
