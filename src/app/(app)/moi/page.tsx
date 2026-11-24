import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton } from "@/components/LogoutButton";
import { MyReceiptsList } from "@/components/MyReceiptsList";
import { copy } from "@/copy/fr";
import { getCurrentSession } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export default async function MePage() {
  const session = await getCurrentSession();
  if (!session) {
    redirect("/");
  }

  return (
    <main className="quorum-container py-8">
      <header className="quorum-section-rule pt-4 pb-6">
        <p className="text-mono-xs text-ink-2">{copy.app.institution}</p>
        <h1 className="text-question-detail mt-2 font-bold text-ink">
          {copy.me.title}
        </h1>
      </header>

      <section className="quorum-rule py-6">
        <p className="text-meta text-ink-2">{copy.me.connectedLabel}</p>
        <p className="text-body mt-1 text-ink">{copy.me.connectedValue}</p>
        {session.isAdmin && (
          <div className="mt-3 flex flex-col items-start gap-1">
            <p className="text-mono-xs text-ink-2">{copy.me.adminRoleNote}</p>
            <Link
              href="/admin"
              className="inline-flex min-h-[48px] items-center text-meta font-bold text-ink underline underline-offset-4"
            >
              {copy.me.adminLink}
            </Link>
          </div>
        )}
      </section>

      <section className="quorum-section-rule py-6">
        <h2 className="text-heading font-bold text-ink">
          {copy.me.receiptsTitle}
        </h2>
        <MyReceiptsList />
      </section>

      <section className="quorum-rule flex flex-col items-start gap-1 pt-6">
        <Link
          href="/comment-ca-marche"
          className="inline-flex min-h-[48px] items-center text-body text-ink underline underline-offset-4"
        >
          {copy.me.howItWorksLink}
        </Link>
        <Link
          href="/journal"
          className="inline-flex min-h-[48px] items-center text-body text-ink underline underline-offset-4"
        >
          {copy.me.journalLink}
        </Link>
        <LogoutButton />
      </section>
    </main>
  );
}
