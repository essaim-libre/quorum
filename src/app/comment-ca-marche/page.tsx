import Link from "next/link";
import { copy } from "@/copy/fr";

export default function HowItWorksPage() {
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
          {copy.howItWorks.backVotes}
        </Link>
      </header>

      <section className="quorum-section-rule mt-6 pt-4 pb-6">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.howItWorks.title}
        </h1>
        <p className="text-body mt-4 text-ink">{copy.howItWorks.intro}</p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.howItWorks.analogyTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">
          {copy.howItWorks.analogyLead}
        </p>

        <ol className="mt-6 divide-y divide-rule border-t border-b border-rule">
          {copy.howItWorks.steps.map((step) => (
            <li
              key={step.number}
              className="grid grid-cols-1 gap-2 py-5 sm:grid-cols-[48px_1fr]"
            >
              <span className="text-mono-xs font-bold text-ink-2">
                {step.number}
              </span>
              <div className="flex flex-col gap-2">
                <h3 className="text-body font-bold text-ink">{step.title}</h3>
                <p className="text-body text-ink-2">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.howItWorks.storageTitle}
        </h2>

        <div className="mt-6 flex flex-col gap-6">
          <div className="quorum-rule pt-4">
            <h3 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
              {copy.howItWorks.neverStoredTitle}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {copy.howItWorks.neverStoredItems.map((item) => (
                <li key={item} className="text-body text-ink">
                  — {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="quorum-rule pt-4">
            <h3 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
              {copy.howItWorks.storedTempTitle}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {copy.howItWorks.storedTempItems.map((item) => (
                <li key={item} className="text-body text-ink-2">
                  — {item}
                </li>
              ))}
            </ul>
          </div>

          <div className="quorum-rule pt-4">
            <h3 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
              {copy.howItWorks.publicAtCloseTitle}
            </h3>
            <ul className="mt-3 flex flex-col gap-2">
              {copy.howItWorks.publicAtCloseItems.map((item) => (
                <li key={item} className="text-body text-ink-2">
                  — {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.howItWorks.lostDeviceTitle}
        </h2>
        <p className="text-body mt-3 text-ink">
          {copy.howItWorks.lostDeviceBody}
        </p>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.howItWorks.guaranteesTitle}
        </h2>

        <div className="mt-4 overflow-x-auto border-t border-ink">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink text-mono-xs uppercase text-ink-2">
                <th scope="col" className="w-1/2 py-3 pr-4 font-medium">
                  {copy.howItWorks.guaranteesColYes}
                </th>
                <th scope="col" className="w-1/2 py-3 font-medium">
                  {copy.howItWorks.guaranteesColNo}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-rule">
              {copy.howItWorks.guaranteesRows.map((row) => (
                <tr key={row.yes} className="align-top">
                  <td className="py-3 pr-4 text-meta text-ink">{row.yes}</td>
                  <td className="py-3 text-meta text-ink-2">{row.no}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.howItWorks.transparencyTitle}
        </h2>
        <p className="text-body mt-3 text-ink-2">
          {copy.howItWorks.transparencyBody}
        </p>
        <div className="mt-4 flex flex-col items-start gap-1">
          <Link
            href="/journal"
            className="inline-flex min-h-[48px] items-center text-body font-medium text-ink underline underline-offset-4"
          >
            {copy.howItWorks.journalLink}
          </Link>
          <Link
            href="/donnees-personnelles"
            className="inline-flex min-h-[48px] items-center text-body text-ink underline underline-offset-4"
          >
            {copy.howItWorks.privacyLink}
          </Link>
        </div>
      </section>

      <footer className="quorum-rule flex flex-wrap gap-6 pt-4 pb-8">
        <Link
          href="/"
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.howItWorks.backHome}
        </Link>
        <Link
          href="/votes"
          className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
        >
          {copy.howItWorks.backVotes}
        </Link>
      </footer>
    </main>
  );
}
