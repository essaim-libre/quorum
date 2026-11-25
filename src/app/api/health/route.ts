import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";

export const dynamic = "force-dynamic";

export async function GET(): Promise<NextResponse> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return NextResponse.json(
      { ok: true },
      {
        status: 200,
        headers: { "Cache-Control": "no-store" },
      },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "health.db.failed", { reason });
    return NextResponse.json(
      { ok: false },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }
}
