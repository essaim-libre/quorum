import Link from "next/link";
import { copy } from "@/copy/fr";
import { formatShortDateTimeParis } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { type JournalTargetType, listPublicJournal } from "@/lib/journal";

export const dynamic = "force-dynamic";

type FilterValue = "all" | JournalTargetType;

function parseFilter(raw: string | string[] | undefined): FilterValue {
  if (raw === "vote" || raw === "petition") {
    return raw;
  }
  return "all";
}

function formatActionLabel(action: string): string {
  const map: Record<string, string> = copy.journal.actions;
  return map[action] ?? action;
}

export default async function JournalPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ type?: string | string[] }>;
}) {
  const resolvedParams = await searchParams;
  const activeFilter = parseFilter(resolvedParams.type);

  const entries = await listPublicJournal(getDb(), {
    targetType: activeFilter === "all" ? undefined : activeFilter,
  });

  const filterLinks: ReadonlyArray<{
    readonly value: FilterValue;
    readonly label: string;
    readonly href: string;
  }> = [
    { value: "all", label: copy.journal.filters.all, href: "/journal" },
    {
      value: "vote",
      label: copy.journal.filters.vote,
      href: "/journal?type=vote",
    },
    {
      value: "petition",
      label: copy.journal.filters.petition,
      href: "/journal?type=petition",
    },
  ];

  return (
    <main className="quorum-container py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <Link href="/votes" className="text-xl font-bold tracking-tight text-ink">
          {copy.app.name}
        </Link>
        <Link
          href="/votes"
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.votes.backToVotes}
        </Link>
      </header>

      <section className="quorum-section-rule mt-6 pt-4 pb-6">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.journal.title}
        </h1>
        <p className="text-body mt-3 text-ink-2">{copy.journal.intro}</p>
      </section>

      <nav
        aria-label={copy.journal.title}
        className="flex flex-wrap items-baseline justify-between gap-4 border-t border-rule"
      >
        <div className="flex items-center gap-6">
          {filterLinks.map((item) => {
            const isActive = item.value === activeFilter;
            return (
              <Link
                key={item.value}
                href={item.href}
                aria-current={isActive ? "page" : undefined}
                className={
                  isActive
                    ? "inline-flex min-h-[48px] items-center border-t-2 border-ink pt-1 text-meta font-bold text-ink"
                    : "inline-flex min-h-[48px] items-center border-t-2 border-transparent pt-1 text-meta text-ink-2 hover:text-ink"
                }
              >
                {item.label}
              </Link>
            );
          })}
        </div>
        <span className="text-mono-xs text-ink-2">
          {copy.journal.countLabel(entries.length)}
        </span>
      </nav>

      {entries.length === 0 ? (
        <p className="quorum-rule py-6 text-body text-ink-2">
          {copy.journal.empty}
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-ink">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink text-mono-xs uppercase text-ink-2">
                <th scope="col" className="py-3 pr-4 font-medium">
                  {copy.journal.columns.date}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {copy.journal.columns.action}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {copy.journal.columns.target}
                </th>
                <th scope="col" className="py-3 font-medium">
                  {copy.journal.columns.reason}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {entries.map((entry) => (
                <tr key={entry.id} className="align-top">
                  <td className="py-3 pr-4 text-mono-xs whitespace-nowrap text-ink-2">
                    {formatShortDateTimeParis(entry.at)}
                  </td>
                  <td className="py-3 pr-4 text-meta font-medium text-ink">
                    {formatActionLabel(entry.action)}
                  </td>
                  <td className="py-3 pr-4 text-meta text-ink">
                    {entry.targetHref ? (
                      <Link
                        href={entry.targetHref}
                        className="underline underline-offset-4 hover:text-ink-2"
                      >
                        {entry.targetLabel}
                      </Link>
                    ) : (
                      <span className="text-ink-2">{entry.targetLabel}</span>
                    )}
                    <div className="text-mono-xs mt-1 text-ink-2">
                      {entry.targetType}:{entry.targetId.slice(0, 8)}
                    </div>
                  </td>
                  <td className="py-3 text-meta text-ink">
                    {entry.reason ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <footer className="quorum-rule mt-8 flex flex-wrap gap-6 pt-4 pb-6">
        <Link
          href="/comment-ca-marche"
          className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
        >
          {copy.me.howItWorksLink}
        </Link>
        <Link
          href="/donnees-personnelles"
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.me.privacyLink}
        </Link>
      </footer>
    </main>
  );
}
