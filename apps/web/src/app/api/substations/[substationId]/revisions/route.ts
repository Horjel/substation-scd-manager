import { NextResponse } from "next/server";
import { ConfigurationValidationError, InvalidIdentifierError, RevisionConflictError, SubstationNotFoundError, createConfigurationRevision, createPrismaClient } from "@substation/db";

interface RouteContext { params: Promise<{ substationId: string }> }

export async function POST(request: Request, context: RouteContext) {
  const db = createPrismaClient();
  try {
    const { substationId } = await context.params;
    const ifMatch = request.headers.get("If-Match");
    const expectedVersion = ifMatch === null ? undefined : Number(ifMatch);
    if (expectedVersion !== undefined && (!Number.isInteger(expectedVersion) || expectedVersion < 0)) {
      return NextResponse.json({ error: "If-Match must contain the last observed revision version." }, { status: 400 });
    }
    const revision = await createConfigurationRevision(db, substationId, await request.json(), expectedVersion);
    return NextResponse.json({ revision }, { status: 201 });
  } catch (error) {
    if (error instanceof InvalidIdentifierError) return NextResponse.json({ error: "A valid substationId is required." }, { status: 400 });
    if (error instanceof SubstationNotFoundError) return NextResponse.json({ error: "Substation not found." }, { status: 404 });
    if (error instanceof RevisionConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof ConfigurationValidationError) return NextResponse.json({ error: "Configuration is invalid.", issues: error.issues }, { status: 422 });
    if (error instanceof SyntaxError) return NextResponse.json({ error: "A valid JSON body is required." }, { status: 422 });
    return NextResponse.json({ error: "Configuration revision could not be created." }, { status: 500 });
  } finally { await db.$disconnect(); }
}
