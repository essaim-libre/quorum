import Link from "next/link";
import { copy } from "@/copy/fr";

export default function HowItWorksPage() {
  return (
    <main className="quorum-container py-8">
      <header className="quorum-section-rule pt-4 pb-6">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.howItWorks.title}
        </h1>
      </header>

      <section className="quorum-rule flex flex-col gap-4 py-6">
        <p className="text-body text-ink">{copy.howItWorks.intro}</p>
        <p className="text-body text-ink-2">{copy.howItWorks.summary}</p>
      </section>

      <footer className="quorum-rule pt-6">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
        >
          {copy.howItWorks.backHome}
        </Link>
      </footer>
    </main>
  );
}
