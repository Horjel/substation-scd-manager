import { NextResponse } from "next/server";
import { InvalidIdentifierError, SubstationNotFoundError, createPrismaClient, getSubstationDetail } from "@substation/db";

interface RouteContext { params: Promise<{ substationId: string }> }

export async function GET(_request: Request, context: RouteContext) {
  const db = createPrismaClient();
  try {
    const { substationId } = await context.params;
    return NextResponse.json({ substation: await getSubstationDetail(db, substationId) });
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return NextResponse.json({ error: "A valid substationId is required." }, { status: 400 });
    if (error instanceof SubstationNotFoundError) return NextResponse.json({ error: "Substation not found." }, { status: 404 });
    return NextResponse.json({ error: "Substation could not be loaded." }, { status: 500 });
  } finally { await db.$disconnect(); }
}
