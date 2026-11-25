import Link from "next/link";
import { StickyHeader } from "@/components/StickyHeader";
import { copy } from "@/copy/fr";
import {
  formatDateTimeParis,
  formatDurationRemaining,
  formatNumberFr,
} from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import {
  petitionListViewSchema,
  type PetitionListView,
} from "@/lib/petitions/rules";
import { listPetitions } from "@/lib/petitions/service";

export const dynamic = "force-dynamic";

const views: readonly PetitionListView[] = ["collecting", "in_review"];

export default async function PetitionsListPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ view?: string }>;
}) {
  const params = await searchParams;
  const parsed = petitionListViewSchema.safeParse(params.view ?? "collecting");
  const activeView: PetitionListView = parsed.success
    ? parsed.data
    : "collecting";

  const items = await listPetitions(getDb(), activeView);
  const nowDate = new Date();

  return (
    <main className="quorum-container pb-6">
      <StickyHeader
        condensedTitle={`${copy.petitions.listTitle} · ${copy.petitions.views[activeView]}`}
        rightMeta={copy.app.institution}
      />

      <section className="quorum-animate-in pt-6 pb-4">
        <h1 className="text-question-detail font-bold text-ink">
          {copy.petitions.listTitle}
        </h1>
        <nav
          aria-label="Navigation Proposer"
          className="mt-2 flex items-center gap-3 text-meta"
        >
          <Link
            href="/proposer"
            className="inline-flex min-h-[48px] items-center text-ink-2 hover:text-ink"
          >
            {copy.petitions.tabPropose}
          </Link>
          <span aria-hidden="true" className="text-ink-2">
            ·
          </span>
          <Link
            href="/petitions"
            aria-current="page"
            className="inline-flex min-h-[48px] items-center font-bold text-ink underline underline-offset-4"
          >
            {copy.petitions.tabList}
          </Link>
        </nav>

        <nav
          aria-label="Filtrer les pétitions"
          className="flex items-center gap-3 text-meta"
        >
          {views.map((view, idx) => {
            const isActive = view === activeView;
            return (
              <span key={view} className="inline-flex items-center gap-3">
                {idx > 0 && (
                  <span aria-hidden="true" className="text-ink-2">
                    ·
                  </span>
                )}
                <Link
                  href={
                    view === "collecting"
                      ? "/petitions"
                      : `/petitions?view=${view}`
                  }
                  aria-current={isActive ? "page" : undefined}
                  className={
                    isActive
                      ? "inline-flex min-h-[48px] items-center font-bold text-ink underline underline-offset-4"
                      : "inline-flex min-h-[48px] items-center text-ink-2 hover:text-ink"
                  }
                >
                  {copy.petitions.views[view]}
                </Link>
              </span>
            );
          })}
        </nav>
      </section>

      <section className="quorum-section-rule pt-3">
        <div className="flex items-baseline justify-between pb-3">
          <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
            {copy.petitions.views[activeView]}
          </h2>
          <span className="text-mono-xs text-ink-2">
            {copy.petitions.countLabel(items.length)}
          </span>
        </div>

        {items.length === 0 ? (
          <p className="quorum-rule py-8 text-body text-ink-2">
            {copy.petitions.empty[activeView]}
          </p>
        ) : (
          <div>
            {items.map((petition) => {
              const pct = Math.min(
                100,
                (petition.signaturesCount / Math.max(1, petition.threshold)) *
                  100,
              );
              const detail =
                petition.state === "collecting"
                  ? copy.petitions.collectEndsIn(
                      formatDurationRemaining(
                        new Date(petition.collectUntil),
                        nowDate,
                      ),
                    )
                  : petition.reviewDeadline
                    ? copy.petitions.reviewEndsAt(
                        formatDateTimeParis(petition.reviewDeadline),
                      )
                    : copy.petitions.states[petition.state];

              return (
                <article
                  key={petition.id}
                  className="quorum-rule flex flex-col gap-3 py-6"
                >
                  <p className="text-meta text-ink-2">
                    <span className="font-medium text-ink">
                      {copy.petitions.states[petition.state]}
                    </span>{" "}
                    · {detail}
                  </p>
                  <h3 className="text-question-list font-bold text-ink">
                    <Link
                      href={`/petitions/${petition.slug}`}
                      className="hover:underline hover:underline-offset-4"
                    >
                      {petition.question}
                    </Link>
                  </h3>
                  {petition.originDetail && (
                    <p className="text-meta text-ink-2">
                      {petition.originDetail}
                    </p>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    <div className="h-[2px] w-full bg-rule">
                      <div
                        className="h-[2px] bg-ink"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="text-right text-mono-xs text-ink-2">
                      {copy.petitions.signaturesProgress(
                        formatNumberFr(petition.signaturesCount),
                        formatNumberFr(petition.threshold),
                      )}
                    </p>
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
