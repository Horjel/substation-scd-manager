import { NextResponse } from "next/server";
import { InvalidIdentifierError, RevisionNotFoundError, SubstationNotFoundError, createPrismaClient, getSubstationDetail, requestLatestGeneration } from "@substation/db";

interface RouteContext { params: Promise<{ substationId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const db = createPrismaClient();
  try {
    const { substationId } = await context.params;
    const detail = await getSubstationDetail(db, substationId);
    return NextResponse.json({ generations: detail.generations, latestRevisionVersion: detail.latestRevisionVersion });
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return NextResponse.json({ error: "A valid substationId is required." }, { status: 400 });
    if (error instanceof SubstationNotFoundError) return NextResponse.json({ error: "Substation not found." }, { status: 404 });
    return NextResponse.json({ error: "Generations could not be loaded." }, { status: 500 });
  } finally { await db.$disconnect(); }
}

export async function POST(_request: Request, context: RouteContext) {
  const db = createPrismaClient();
  try {
    const { substationId } = await context.params;
    const result = await requestLatestGeneration(db, substationId);
    return NextResponse.json({
      jobId: result.generation.id,
      status: result.generation.status,
      accepted: result.created,
      statusUrl: `/api/generations/${result.generation.id}`,
      artifactUrl: `/api/generations/${result.generation.id}/artifact`,
    }, { status: 202 });
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return NextResponse.json({ error: "A valid substationId is required." }, { status: 400 });
    if (error instanceof SubstationNotFoundError) return NextResponse.json({ error: "Substation not found." }, { status: 404 });
    if (error instanceof RevisionNotFoundError) return NextResponse.json({ error: "Create a configuration revision first." }, { status: 409 });
    return NextResponse.json({ error: "Generation request could not be accepted." }, { status: 500 });
  } finally { await db.$disconnect(); }
}
