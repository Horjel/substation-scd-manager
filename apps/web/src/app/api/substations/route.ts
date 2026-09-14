import { NextResponse } from "next/server";
import { SubstationInputError, createPrismaClient, createSubstation, listSubstations } from "@substation/db";

export async function GET() {
  const db = createPrismaClient();
  try {
    return NextResponse.json({ substations: await listSubstations(db) });
  } catch {
    return NextResponse.json({ error: "Substations could not be loaded." }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}

export async function POST(request: Request) {
  const db = createPrismaClient();
  try {
    const substation = await createSubstation(db, await request.json());
    return NextResponse.json({ substation }, { status: 201 });
  } catch (error) {
    if (error instanceof SubstationInputError || error instanceof SyntaxError) {
      return NextResponse.json(
        { error: error instanceof SubstationInputError ? error.message : "A valid JSON body is required." },
        { status: 422 },
      );
    }
    return NextResponse.json({ error: "Substation could not be created." }, { status: 500 });
  } finally {
    await db.$disconnect();
  }
}
