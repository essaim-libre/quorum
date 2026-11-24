import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { voteListViewSchema } from "@/lib/votes/rules";
import { listPublishedVotes } from "@/lib/votes/service";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const rawView = searchParams.get("view") ?? "open";
  const parsedView = voteListViewSchema.safeParse(rawView);

  if (!parsedView.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const data = await listPublishedVotes(getDb(), parsedView.data);
    return NextResponse.json(data, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "votes.list.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
