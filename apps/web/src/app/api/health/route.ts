import { NextResponse } from "next/server";
import { createPrismaClient } from "@substation/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const db = createPrismaClient();
  try {
    await db.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ status: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  } finally {
    await db.$disconnect();
  }
}
