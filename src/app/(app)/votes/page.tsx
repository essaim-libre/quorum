import Link from "next/link";
import { ParticipationBar } from "@/components/ParticipationBar";
import { VoteStatusIndicator } from "@/components/VoteStatusIndicator";
import { copy } from "@/copy/fr";
import {
  formatDateTimeParis,
  formatDurationRemaining,
} from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { voteListViewSchema, type VoteListView } from "@/lib/votes/rules";
import { listPublishedVotes } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

const views: readonly VoteListView[] = ["open", "upcoming", "closed"];

export default async function VotesPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const parsedView = voteListViewSchema.safeParse(params.view ?? "open");
  const activeView: VoteListView = parsedView.success ? parsedView.data : "open";

  const { serverNow, votes } = await listPublishedVotes(getDb(), activeView);
  const referenceNow = new Date(serverNow);

  return (
    <main className="quorum-container py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <span className="text-xl font-bold tracking-tight text-ink">
          {copy.app.name}
        </span>
        <span className="text-mono-xs text-ink-2">{copy.app.institution}</span>
      </header>

      <section className="pt-6 pb-4">
        <h1 className="text-question-detail font-bold text-ink">
          {copy.votes.title}
        </h1>

        <nav
          aria-label="Filtrer les scrutins"
          className="mt-2 flex flex-wrap items-center gap-3 text-meta"
        >
          {views.map((view, index) => {
            const isActive = view === activeView;
            return (
              <span key={view} className="inline-flex items-center gap-3">
                {index > 0 && (
                  <span aria-hidden="true" className="text-ink-2">
                    ·
                  </span>
                )}
                <Link
                  href={view === "open" ? "/votes" : `/votes?view=${view}`}
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "inline-flex min-h-[48px] items-center font-bold text-ink underline underline-offset-4"
                      : "inline-flex min-h-[48px] items-center text-ink-2 hover:text-ink"
                  }
                >
                  {copy.votes.views[view]}
                </Link>
              </span>
            );
          })}
        </nav>
      </section>

      <section className="quorum-section-rule pt-3">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
            {copy.votes.views[activeView]}
          </h2>
          <span className="text-mono-xs text-ink-2">
            {copy.votes.countLabel(votes.length)}
          </span>
        </div>

        {votes.length === 0 ? (
          <p className="quorum-rule py-8 text-body text-ink-2">
            {copy.votes.empty[activeView]}
          </p>
        ) : (
          <div>
            {votes.map((vote) => {
              const opensDate = new Date(vote.opensAt);
              const closesDate = new Date(vote.closesAt);
              const detail =
                vote.status === "open"
                  ? copy.votes.closesIn(
                      formatDurationRemaining(closesDate, referenceNow),
                    )
                  : vote.status === "upcoming"
                    ? copy.votes.opensAt(formatDateTimeParis(opensDate))
                    : copy.votes.closedAt(formatDateTimeParis(closesDate));

              return (
                <article
                  key={vote.id}
                  className="quorum-rule flex flex-col gap-3 py-6"
                >
                  <VoteStatusIndicator status={vote.status} detail={detail} />

                  <h3 className="text-question-list font-bold text-ink">
                    <Link
                      href={`/votes/${vote.slug}`}
                      className="hover:underline hover:underline-offset-4"
                    >
                      {vote.question}
                    </Link>
                  </h3>

                  {vote.originDetail && (
                    <p className="text-meta text-ink-2">{vote.originDetail}</p>
                  )}

                  <div className="pt-1">
                    <ParticipationBar
                      ballots={vote.participation.ballots}
                      electorateSize={vote.participation.electorateSize}
                      rate={vote.participation.rate}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <span className="text-meta text-ink-2">
                      {vote.statusNote}
                    </span>
                    <Link
                      href={
                        vote.status === "closed"
                          ? `/votes/${vote.slug}/resultats`
                          : `/votes/${vote.slug}`
                      }
                      className="inline-flex min-h-[48px] shrink-0 items-center text-meta font-bold text-ink underline underline-offset-4"
                    >
                      {vote.status === "closed"
                        ? copy.votes.seeResults
                        : copy.votes.readQuestion}
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}
