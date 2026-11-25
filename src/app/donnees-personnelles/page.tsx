import Link from "next/link";
import { copy } from "@/copy/fr";

export default function PrivacyPage() {
  return (
    <main className="quorum-container py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <Link href="/" className="text-xl font-bold tracking-tight text-ink">
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
          {copy.privacy.title}
        </h1>
        <p className="text-body mt-4 text-ink">{copy.privacy.intro}</p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.controllerTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">
          {copy.privacy.controllerBody}
        </p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.purposeTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">{copy.privacy.purposeBody}</p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.tableTitle}
        </h2>

        <div className="mt-4 overflow-x-auto border-t border-ink">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink text-mono-xs uppercase text-ink-2">
                <th scope="col" className="py-3 pr-4 font-medium">
                  {copy.privacy.columns.data}
                </th>
                <th scope="col" className="py-3 pr-4 font-medium">
                  {copy.privacy.columns.nature}
                </th>
                <th scope="col" className="py-3 font-medium">
                  {copy.privacy.columns.retention}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {copy.privacy.rows.map((row) => (
                <tr key={row.data} className="align-top">
                  <td className="py-3 pr-4 text-meta font-medium text-ink">
                    {row.data}
                  </td>
                  <td className="py-3 pr-4 text-meta text-ink-2">
                    {row.nature}
                  </td>
                  <td className="py-3 text-meta text-ink">{row.retention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.hostingTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">{copy.privacy.hostingBody}</p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.rightsTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">{copy.privacy.rightsBody}</p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.privacy.contactTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">{copy.privacy.contactBody}</p>
        <p className="font-mono text-meta mt-2 text-ink">
          {copy.privacy.contactAddress}
        </p>
      </section>

      <footer className="quorum-rule flex flex-wrap gap-6 pt-4 pb-8">
        <Link
          href="/comment-ca-marche"
          className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
        >
          {copy.privacy.howItWorksLink}
        </Link>
        <Link
          href="/journal"
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.privacy.journalLink}
        </Link>
      </footer>
    </main>
  );
}
