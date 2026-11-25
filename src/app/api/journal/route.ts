import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { PUBLIC_NO_STORE_HEADERS } from "@/lib/http/csrf";
import { listPublicJournal } from "@/lib/journal";
import { log } from "@/lib/log";

const querySchema = z.object({
  type: z.enum(["vote", "petition"]).optional(),
});

export async function GET(request: Request): Promise<NextResponse> {
  const url = new URL(request.url);
  const rawType = url.searchParams.get("type") ?? undefined;
  const parsed = querySchema.safeParse({ type: rawType });
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PUBLIC_NO_STORE_HEADERS },
    );
  }

  try {
    const entries = await listPublicJournal(getDb(), {
      targetType: parsed.data.type,
    });
    return NextResponse.json(
      { entries },
      { status: 200, headers: PUBLIC_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "journal.list.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PUBLIC_NO_STORE_HEADERS },
    );
  }
}
