import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb, getPool } from "@/lib/db/client";
import { log } from "@/lib/log";
import { getClosedVoteReportBySlug } from "@/lib/votes/close";

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
    const res = await getClosedVoteReportBySlug(
      getDb(),
      getPool(),
      parsed.data,
    );
    if (!res.ok) {
      const status = res.error === "not_found" ? 404 : 409;
      return NextResponse.json({ error: res.error }, { status });
    }

    const { report } = res;
    return NextResponse.json(
      {
        voteId: report.voteId,
        slug: report.slug,
        question: report.question,
        closesAt: report.closesAt.toISOString(),
        tokensIssued: report.tally.tokensIssued,
        ballotsCount: report.tally.totalBallots,
        receiptsHash: report.receiptsHash,
        receipts: report.receipts,
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, max-age=60, s-maxage=60",
        },
      },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "votes.receipts.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
