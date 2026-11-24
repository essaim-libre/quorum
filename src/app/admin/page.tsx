import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminPetitionQueue } from "@/components/AdminPetitionQueue";
import { AdminVotesManager } from "@/components/AdminVotesManager";
import { copy } from "@/copy/fr";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listAdminPetitionsForReview } from "@/lib/petitions/service";
import { listAdminVotes } from "@/lib/votes/service";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }

  if (!session.isAdmin) {
    return (
      <main className="quorum-container py-10">
        <header className="quorum-section-rule pt-4 pb-6">
          <h1 className="text-heading font-bold text-ink">
            {copy.admin.title}
          </h1>
          <p className="text-body mt-4 text-error">{copy.admin.forbidden}</p>
        </header>
        <Link
          href="/votes"
          className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
        >
          {copy.votes.backToVotes}
        </Link>
      </main>
    );
  }

  const db = getDb();
  const [votes, reviewPetitions] = await Promise.all([
    listAdminVotes(db),
    listAdminPetitionsForReview(db),
  ]);

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

      <div className="pt-6 pb-8">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.admin.title}
        </h1>
      </div>

      <AdminPetitionQueue petitions={reviewPetitions} />
      <AdminVotesManager initialVotes={votes} />
    </main>
  );
}
