import { copy } from "@/copy/fr";

export const dynamic = "force-dynamic";

export default function VotesPage() {
  return (
    <main className="quorum-container py-8">
      <header className="quorum-section-rule pt-4 pb-6">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.votes.title}
        </h1>
      </header>

      <section className="quorum-rule pt-6">
        <p className="text-body text-ink-2">{copy.votes.emptySoon}</p>
      </section>
    </main>
  );
}
