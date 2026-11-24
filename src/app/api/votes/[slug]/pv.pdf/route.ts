import { NextResponse } from "next/server";
import { z } from "zod";
import { now } from "@/lib/clock";
import { getDb, getPool } from "@/lib/db/client";
import { log } from "@/lib/log";
import { getClosedVoteReportBySlug } from "@/lib/votes/close";
import { generateProcesVerbalPdf } from "@/lib/votes/pv-pdf";

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
    const pdfBuffer = generateProcesVerbalPdf({
      voteId: report.voteId,
      slug: report.slug,
      question: report.question,
      originDetail: report.originDetail,
      statusNote: report.statusNote,
      opensAt: report.opensAt,
      closesAt: report.closesAt,
      keyFingerprint: report.keyFingerprint,
      receiptsCount: report.receipts.length,
      receiptsHash: report.receiptsHash,
      tally: report.tally,
      generatedAt: now(),
    });

    return new NextResponse(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="pv-${report.slug}.pdf"`,
        "Cache-Control": "public, max-age=300, s-maxage=300",
      },
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "votes.pv.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
