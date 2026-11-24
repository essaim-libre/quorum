import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReceiptsDirectory } from "@/components/ReceiptsDirectory";
import { copy } from "@/copy/fr";
import { formatNumberFr } from "@/lib/dates";
import { getDb, getPool } from "@/lib/db/client";
import { getClosedVoteReportBySlug } from "@/lib/votes/close";

export const dynamic = "force-dynamic";

export default async function VoteReceiptsPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const res = await getClosedVoteReportBySlug(getDb(), getPool(), slug);

  if (!res.ok) {
    if (res.error === "vote_not_closed") {
      redirect(`/votes/${slug}`);
    }
    notFound();
  }

  const { report } = res;
  const tokensLabel =
    report.tally.tokensIssued !== null
      ? formatNumberFr(report.tally.tokensIssued)
      : "—";

  return (
    <main className="quorum-container py-6">
      <div className="border-b border-rule pb-2">
        <Link
          href={`/votes/${report.slug}/resultats`}
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.receipts.backToResults}
        </Link>
      </div>

      <header className="flex flex-col gap-3 py-6">
        <h1 className="text-heading font-bold text-ink">
          {copy.receipts.title}
        </h1>
        <p className="text-body text-ink">{report.question}</p>
        <p className="text-meta text-ink-2">{copy.receipts.intro}</p>
        <div className="quorum-rule mt-2 flex flex-col gap-1 pt-3 text-mono-xs text-ink-2">
          <span>
            {copy.results.ballotsAndTokens(
              formatNumberFr(report.tally.totalBallots),
              tokensLabel,
            )}
          </span>
          <span className="break-all">
            SHA-256 : {report.receiptsHash}
          </span>
        </div>
      </header>

      <ReceiptsDirectory voteId={report.voteId} receipts={report.receipts} />
    </main>
  );
}
