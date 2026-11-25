import { notFound } from "next/navigation";
import { PetitionDetailClient } from "@/components/PetitionDetailClient";
import { StickyHeader } from "@/components/StickyHeader";
import { copy } from "@/copy/fr";
import { getCurrentSession } from "@/lib/auth/session";
import {
  formatDateTimeParis,
  formatDurationRemaining,
  formatNumberFr,
} from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { getPetitionBySlug } from "@/lib/petitions/service";

export const dynamic = "force-dynamic";

export default async function PetitionDetailPage({
  params,
}: {
  readonly params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const session = await getCurrentSession();
  const petition = await getPetitionBySlug(
    getDb(),
    slug,
    session?.voterId ?? null,
  );
  if (!petition) {
    notFound();
  }

  const pct = Math.min(
    100,
    (petition.signaturesCount / Math.max(1, petition.threshold)) * 100,
  );
  const nowDate = new Date();
  const timingDetail =
    petition.state === "collecting"
      ? copy.petitions.collectEndsIn(
          formatDurationRemaining(new Date(petition.collectUntil), nowDate),
        )
      : petition.reviewDeadline
        ? copy.petitions.reviewEndsAt(
            formatDateTimeParis(petition.reviewDeadline),
          )
        : copy.petitions.states[petition.state];

  return (
    <main className="quorum-container pb-6">
      <StickyHeader
        condensedTitle={petition.question}
        backHref="/petitions"
        backLabel={copy.petitions.tabList}
      />

      <header className="quorum-animate-in flex flex-col gap-4 py-6">
        <p className="text-meta text-ink-2">
          <span className="font-medium text-ink">
            {copy.petitions.states[petition.state]}
          </span>{" "}
          · {timingDetail}
        </p>

        <h1 className="text-question-detail font-bold text-ink">
          {petition.question}
        </h1>

        {petition.originDetail && (
          <p className="text-meta text-ink-2">{petition.originDetail}</p>
        )}

        <div className="flex flex-col gap-2 pt-2">
          <div className="h-[2px] w-full bg-rule">
            <div className="h-[2px] bg-ink" style={{ width: `${pct}%` }} />
          </div>
          <p className="text-right text-mono-xs text-ink">
            {copy.petitions.signaturesProgress(
              formatNumberFr(petition.signaturesCount),
              formatNumberFr(petition.threshold),
            )}
          </p>
        </div>

        {petition.state === "rejected" && petition.decisionReason && (
          <p className="border border-error p-3 text-meta text-error">
            Motif du rejet : {petition.decisionReason}
          </p>
        )}
      </header>

      <section className="quorum-section-rule py-6">
        <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
          {copy.votes.optionsTitle}
        </h2>
        <ul className="mt-3 border-t border-rule">
          {petition.options.map((opt, idx) => (
            <li
              key={opt}
              className="flex items-baseline justify-between border-b border-rule py-3 text-body text-ink"
            >
              <span>{opt}</span>
              <span className="text-mono-xs text-ink-2">
                {String(idx + 1).padStart(2, "0")}
              </span>
            </li>
          ))}
          <li className="flex items-baseline justify-between border-b border-rule py-3 text-body text-ink-2">
            <span>Vote blanc</span>
            <span className="text-mono-xs text-ink-2">
              {String(petition.options.length + 1).padStart(2, "0")}
            </span>
          </li>
        </ul>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
          Argument {copy.votes.argumentPourTab}
        </h2>
        <p className="text-body mt-4 whitespace-pre-line text-ink">
          {petition.argumentPour}
        </p>
        <p className="text-mono-xs mt-3 text-ink-2">
          {copy.votes.signedBy(petition.argumentPourAuthor)}
        </p>
      </section>

      <PetitionDetailClient
        petition={petition}
        isAuthenticated={session !== null}
      />
    </main>
  );
}
