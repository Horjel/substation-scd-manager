import { NextResponse } from "next/server";
import { InvalidIdentifierError, createPrismaClient, getGenerationView } from "@substation/db";

interface RouteContext {
  params: Promise<{ jobId: string }>;
}

export async function GET(_request: Request, context: RouteContext) {
  const db = createPrismaClient();
  try {
    const { jobId } = await context.params;
    const generation = await getGenerationView(db, jobId);
    if (!generation) return NextResponse.json({ error: "Generation not found." }, { status: 404 });
    return NextResponse.json(generation);
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return NextResponse.json({ error: "A valid jobId is required." }, { status: 400 });
    return NextResponse.json({ error: "Generation could not be loaded." }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
