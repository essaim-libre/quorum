import { copy } from "@/copy/fr";

export default function HomePage() {
  return (
    <main className="quorum-container py-12">
      <header className="quorum-section-rule pt-4 pb-8">
        <p className="text-mono-xs uppercase text-ink-2">
          {copy.app.institution}
        </p>
        <h1 className="text-question-detail mt-2 font-bold">
          {copy.app.name}
        </h1>
        <p className="text-body mt-4 text-ink-2">{copy.app.tagline}</p>
      </header>

      <section className="quorum-rule pt-6">
        <p className="text-meta text-ink-2">{copy.app.socleNotice}</p>
      </section>
    </main>
  );
}
