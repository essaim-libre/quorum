import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { StickyHeader } from "@/components/StickyHeader";
import { copy } from "@/copy/fr";
import {
  formatDateTimeParis,
  formatNumberFr,
  formatPercentFr,
} from "@/lib/dates";
import { getDb, getPool } from "@/lib/db/client";
import { getClosedVoteReportBySlug } from "@/lib/votes/close";
import { formatOutcomeHeadline } from "@/lib/votes/tally";

export const dynamic = "force-dynamic";

function formatSingleDecimalPercent(pct: number): string {
  return `${pct.toFixed(1).replace(/\.0$/, "").replace(".", ",")} %`;
}

export default async function VoteResultsPage({
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
  const { tally } = report;

  const headline =
    tally.outcome.kind === "winner" &&
    tally.outcome.option.expressedPercent !== null
      ? copy.results.winnerSummary(
          tally.outcome.option.label,
          formatSingleDecimalPercent(tally.outcome.option.expressedPercent),
        )
      : formatOutcomeHeadline(tally.outcome);

  const tokensLabel =
    tally.tokensIssued !== null ? formatNumberFr(tally.tokensIssued) : "—";

  return (
    <main className="quorum-container pb-6">
      <StickyHeader
        condensedTitle={report.question}
        backHref="/votes?view=closed"
        backLabel={copy.votes.backToVotes}
        rightMeta={copy.results.pageLabel}
      />

      <header className="quorum-animate-in flex flex-col gap-3 py-6">
        <p className="text-mono-xs text-ink-2">
          {copy.results.deadlineLabel(formatDateTimeParis(report.closesAt))}
        </p>
        <h1 className="text-heading font-bold text-ink">{report.question}</h1>
        {report.originDetail && (
          <p className="text-meta text-ink-2">{report.originDetail}</p>
        )}
      </header>

      <section className="pb-8">
        <div className="flex flex-wrap items-baseline gap-3">
          <span className="text-display font-mono font-bold text-ink">
            {formatPercentFr(tally.participationRate)}
          </span>
          <span className="text-body text-ink-2">
            {copy.results.participationOf}
          </span>
        </div>
        <div className="quorum-rule mt-3 flex flex-col gap-1 pt-3 text-mono-xs text-ink-2 sm:flex-row sm:justify-between">
          <span>
            {formatNumberFr(tally.totalBallots)} votants sur{" "}
            {formatNumberFr(tally.electorateSize)} inscrits
          </span>
          <span className="text-ink">
            {copy.results.ballotsAndTokens(
              formatNumberFr(tally.totalBallots),
              tokensLabel,
            )}
          </span>
        </div>
      </section>

      <section className="quorum-section-rule py-6">
        <p className="text-question-list font-bold text-ink">{headline}</p>
        <p className="text-mono-xs mt-2 text-ink-2">
          {copy.results.expressedTotal(formatNumberFr(tally.expressedCount))}
        </p>

        <div className="mt-6 flex flex-col gap-5">
          {tally.options.map((opt, index) => {
            const pct = opt.expressedPercent ?? 0;
            const pctText = formatSingleDecimalPercent(pct);
            const votesText = copy.results.votesCount(
              formatNumberFr(opt.count),
            );
            const ariaLabel = `${opt.label}, ${pctText}, ${votesText}`;

            return (
              <div key={opt.optionId} className="flex flex-col gap-2">
                <div className="flex items-baseline justify-between gap-2 text-body">
                  <span className="font-bold text-ink">{opt.label}</span>
                  <span className="font-mono text-meta font-medium text-ink">
                    {pctText} · {votesText}
                  </span>
                </div>
                <div
                  role="img"
                  aria-label={ariaLabel}
                  className="h-6 w-full bg-rule"
                >
                  <div
                    className="quorum-bar-animated h-6 bg-ink"
                    style={{
                      width: `${Math.max(0, Math.min(100, pct))}%`,
                      animationDelay: `${index * 60}ms`,
                    }}
                  />
                </div>
              </div>
            );
          })}

          {tally.blankOption && (
            <div className="quorum-rule mt-2 flex flex-col gap-2 pt-4">
              <div className="flex items-baseline justify-between gap-2 text-meta text-ink-2">
                <span>{copy.results.blankLabel}</span>
                <span className="font-mono">
                  {copy.results.blankCount(formatNumberFr(tally.blankCount))}
                </span>
              </div>
              {tally.totalBallots > 0 && (
                <div
                  role="img"
                  aria-label={`${copy.results.blankLabel}, ${copy.results.blankCount(formatNumberFr(tally.blankCount))}`}
                  className="h-6 w-full bg-rule"
                >
                  <div
                    className="quorum-bar-animated h-6 bg-blank"
                    style={{
                      width: `${Math.max(
                        0,
                        Math.min(100, (tally.blankCount / tally.totalBallots) * 100),
                      )}%`,
                      animationDelay: `${tally.options.length * 60}ms`,
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </div>
      </section>

      <section className="quorum-section-rule flex flex-col gap-4 py-6">
        <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
          {copy.results.integritySection}
        </h2>

        <p
          className={
            tally.integrityBallotsLeqTokens
              ? "text-meta text-ink"
              : "text-meta font-bold text-error"
          }
        >
          {tally.integrityBallotsLeqTokens
            ? copy.results.integrityOk
            : copy.results.integrityAlert}
        </p>

        <dl className="divide-y divide-rule border-t border-b border-rule">
          <div className="py-3">
            <dt className="text-meta text-ink-2">
              {copy.results.keyFingerprintLabel}
            </dt>
            <dd className="text-mono-xs mt-1 break-all text-ink">
              {report.keyFingerprint}
            </dd>
          </div>
          <div className="py-3">
            <dt className="text-meta text-ink-2">
              {copy.results.receiptsHashLabel}
            </dt>
            <dd className="text-mono-xs mt-1 break-all text-ink">
              {report.receiptsHash}
            </dd>
          </div>
        </dl>

        <p className="text-meta text-ink-2">
          <span className="font-medium text-ink">
            {copy.results.statusPrefix}
          </span>{" "}
          {report.statusNote}
        </p>

        <div className="flex flex-col items-start gap-1 pt-2">
          <Link
            href={`/votes/${report.slug}/recus`}
            className="inline-flex min-h-[48px] items-center text-body font-medium text-ink underline underline-offset-4"
          >
            {copy.results.receiptsListLink} ({formatNumberFr(report.receipts.length)})
          </Link>
          <a
            href={`/api/votes/${report.slug}/pv.pdf`}
            className="inline-flex min-h-[48px] items-center text-body font-medium text-ink underline underline-offset-4"
          >
            {copy.results.downloadPvLink}
          </a>
          <Link
            href={`/votes/${report.slug}`}
            className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            {copy.results.backToQuestionLink}
          </Link>
        </div>
      </section>
    </main>
  );
}
