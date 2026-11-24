import Link from "next/link";
import { copy } from "@/copy/fr";
import { formatShortDateTimeParis } from "@/lib/dates";
import { getDb } from "@/lib/db/client";
import { listPublicJournal } from "@/lib/journal";

export const dynamic = "force-dynamic";

function formatActionLabel(action: string): string {
  const map: Record<string, string> = copy.journal.actions;
  return map[action] ?? action;
}

export default async function JournalPage() {
  const entries = await listPublicJournal(getDb());

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
        <h1 className="text-question-detail font-bold text-ink">
          {copy.journal.title}
        </h1>
        <p className="text-body mt-3 text-ink-2">{copy.journal.intro}</p>
      </section>

      {entries.length === 0 ? (
        <p className="quorum-rule py-6 text-body text-ink-2">
          {copy.journal.empty}
        </p>
      ) : (
        <div className="overflow-x-auto border-t border-ink">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink text-mono-xs uppercase text-ink-2">
                <th className="py-3 pr-4 font-medium">
                  {copy.journal.columns.date}
                </th>
                <th className="py-3 pr-4 font-medium">
                  {copy.journal.columns.action}
                </th>
                <th className="py-3 pr-4 font-medium">
                  {copy.journal.columns.target}
                </th>
                <th className="py-3 font-medium">
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
                  <td className="py-3 pr-4 text-mono-xs text-ink-2">
                    {entry.targetType}:{entry.targetId.slice(0, 8)}
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
    </main>
  );
}
