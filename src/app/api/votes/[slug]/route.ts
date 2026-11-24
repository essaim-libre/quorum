import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getPool } from "@/lib/db/client";
import { log } from "@/lib/log";
import { getClosedVoteReportBySlug } from "@/lib/votes/close";
import { getPublishedVoteBySlug } from "@/lib/votes/service";

const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  const parsed = slugParamSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const db = getDb();
    const data = await getPublishedVoteBySlug(db, parsed.data);
    if (!data) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }

    // Invariant n°5 : aucun champ de résultats avant closes_at.
    if (data.vote.status !== "closed") {
      return NextResponse.json(data, { status: 200 });
    }

    const closed = await getClosedVoteReportBySlug(db, getPool(), parsed.data);
    if (!closed.ok) {
      return NextResponse.json(data, { status: 200 });
    }

    return NextResponse.json(
      {
        ...data,
        results: {
          tally: closed.report.tally,
          receiptsCount: closed.report.receipts.length,
          receiptsHash: closed.report.receiptsHash,
        },
      },
      { status: 200 },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "votes.detail.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
