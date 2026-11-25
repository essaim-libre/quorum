import Link from "next/link";
import { notFound } from "next/navigation";
import { ArgumentsTabs } from "@/components/ArgumentsTabs";
import { ParticipationBar } from "@/components/ParticipationBar";
import { StickyHeader } from "@/components/StickyHeader";
import { TokenPrefetcher } from "@/components/TokenPrefetcher";
import { VoteStatusIndicator } from "@/components/VoteStatusIndicator";
import { copy } from "@/copy/fr";
import { getCurrentSession } from "@/lib/auth/session";
import {
  formatDateTimeParis,
  formatDurationRemaining,
} from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getPublishedVoteBySlug } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

export default async function VoteDetailPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [result, session] = await Promise.all([
    getPublishedVoteBySlug(getDb(), slug),
    getCurrentSession(),
  ]);
  if (!result) {
    notFound();
  }

  const { vote, serverNow } = result;
  const referenceNow = new Date(serverNow);
  const opensDate = new Date(vote.opensAt);
  const closesDate = new Date(vote.closesAt);

  const statusDetail =
    vote.status === "open"
      ? copy.votes.closesIn(formatDurationRemaining(closesDate, referenceNow))
      : vote.status === "upcoming"
        ? copy.votes.opensAt(formatDateTimeParis(opensDate))
        : copy.votes.closedAt(formatDateTimeParis(closesDate));

  const quickAction =
    vote.status === "open"
      ? { href: `/votes/${vote.slug}/bulletin`, label: copy.votes.voteCta }
      : vote.status === "closed"
        ? { href: `/votes/${vote.slug}/resultats`, label: copy.votes.seeResults }
        : undefined;

  return (
    <main className="quorum-container pb-6">
      <TokenPrefetcher
        voteId={vote.id}
        slug={vote.slug}
        question={vote.question}
        publicKeySpkiBase64={vote.publicKeySpkiBase64}
        enabled={vote.status === "open" && session !== null}
      />
      <StickyHeader
        condensedTitle={vote.question}
        backHref="/votes"
        backLabel={copy.votes.backToVotes}
        quickAction={quickAction}
      />

      <header className="quorum-animate-in flex flex-col gap-4 py-6">
        <VoteStatusIndicator status={vote.status} detail={statusDetail} />
        <h1 className="text-question-detail font-bold text-ink">
          {vote.question}
        </h1>
        {vote.originDetail && (
          <p className="text-meta text-ink-2">{vote.originDetail}</p>
        )}
        <div className="pt-2">
          <ParticipationBar
            ballots={vote.participation.ballots}
            electorateSize={vote.participation.electorateSize}
            rate={vote.participation.rate}
          />
        </div>
      </header>

      <ArgumentsTabs
        argumentPour={vote.argumentPour}
        argumentPourAuthor={vote.argumentPourAuthor}
        argumentContre={vote.argumentContre}
        argumentContreAuthor={vote.argumentContreAuthor}
      />

      {vote.facts && (
        <section className="quorum-section-rule py-6">
          <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
            {copy.votes.factsTitle}
          </h2>
          <p className="text-body mt-4 whitespace-pre-line text-ink">
            {vote.facts}
          </p>
        </section>
      )}

      <section className="quorum-section-rule py-6">
        <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
          {copy.votes.optionsTitle}
        </h2>
        <ul className="mt-4 border-t border-rule">
          {vote.options.map((option) => (
            <li
              key={option.id}
              className="flex items-baseline justify-between border-b border-rule py-3 text-body text-ink"
            >
              <span className={option.isBlank ? "text-ink-2" : "text-ink"}>
                {option.label}
              </span>
              <span className="text-mono-xs text-ink-2">
                {String(option.position).padStart(2, "0")}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
          {copy.votes.rulesTitle}
        </h2>
        <dl className="mt-4 divide-y divide-rule border-t border-b border-rule">
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">{copy.votes.rules.whoLabel}</dt>
            <dd className="text-meta text-ink sm:col-span-2">
              {copy.votes.rules.whoValue}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">
              {copy.votes.rules.opensLabel}
            </dt>
            <dd className="text-mono-xs text-ink sm:col-span-2">
              {formatDateTimeParis(opensDate)}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">
              {copy.votes.rules.closesLabel}
            </dt>
            <dd className="text-mono-xs text-ink sm:col-span-2">
              {formatDateTimeParis(closesDate)}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">
              {copy.votes.rules.resultLabel}
            </dt>
            <dd className="text-meta text-ink sm:col-span-2">
              {copy.votes.rules.resultValue}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">
              {copy.votes.rules.statusLabel}
            </dt>
            <dd className="text-meta text-ink sm:col-span-2">
              {vote.statusNote}
            </dd>
          </div>
          <div className="grid grid-cols-1 gap-1 py-3 sm:grid-cols-3">
            <dt className="text-meta text-ink-2">{copy.votes.rules.keyLabel}</dt>
            <dd className="text-mono-xs break-all text-ink-2 sm:col-span-2">
              {vote.keyFingerprint}
            </dd>
          </div>
        </dl>
      </section>

      <footer className="flex flex-col gap-3 py-6">
        {vote.status === "open" && (
          <Link
            href={`/votes/${vote.slug}/bulletin`}
            className="quorum-pressable flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
          >
            {copy.votes.voteCta}
          </Link>
        )}
        {vote.status === "closed" && (
          <Link
            href={`/votes/${vote.slug}/resultats`}
            className="quorum-pressable flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
          >
            {copy.votes.seeResults}
          </Link>
        )}
        {vote.status === "upcoming" && (
          <p className="text-meta text-ink-2">{copy.votes.upcomingNotice}</p>
        )}
        {vote.status !== "closed" && (
          <div>
            <Link
              href={`/amphi/${vote.slug}`}
              className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
            >
              {copy.votes.amphiLink}
            </Link>
          </div>
        )}
      </footer>
    </main>
  );
}
