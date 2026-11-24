import Link from "next/link";
import { ProposePetitionFlow } from "@/components/ProposePetitionFlow";
import { copy } from "@/copy/fr";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function ProposePage() {
  const session = await getCurrentSession();

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
          {copy.petitions.proposeTitle}
        </h1>
        <nav
          aria-label="Navigation Proposer"
          className="mt-2 flex items-center gap-3 text-meta"
        >
          <Link
            href="/proposer"
            aria-current="page"
            className="inline-flex min-h-[48px] items-center font-bold text-ink underline underline-offset-4"
          >
            {copy.petitions.tabPropose}
          </Link>
          <span aria-hidden="true" className="text-ink-2">
            ·
          </span>
          <Link
            href="/petitions"
            className="inline-flex min-h-[48px] items-center text-ink-2 hover:text-ink"
          >
            {copy.petitions.tabList}
          </Link>
        </nav>
      </section>

      <ProposePetitionFlow isAuthenticated={session !== null} />
    </main>
  );
}
