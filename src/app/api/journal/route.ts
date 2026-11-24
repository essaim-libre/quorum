import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { listPublicJournal } from "@/lib/journal";
import { log } from "@/lib/log";

export async function GET(): Promise<NextResponse> {
  try {
    const entries = await listPublicJournal(getDb());
    return NextResponse.json({ entries }, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "journal.list.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
