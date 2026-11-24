"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { copy } from "@/copy/fr";
import { getStoredVoteToken } from "@/lib/client/token-store";

export function VotedReceiptView({
  voteId,
  slug,
  question,
  closesAtLabel,
  isOpen,
}: {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly closesAtLabel: string;
  readonly isOpen: boolean;
}) {
  const [receipt, setReceipt] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let active = true;
    void getStoredVoteToken(voteId).then((token) => {
      if (!active) return;
      setReceipt(token?.receipt ?? null);
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [voteId]);

  async function handleCopy() {
    if (!receipt) {
      return;
    }
    try {
      await navigator.clipboard.writeText(receipt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard indisponible : l'utilisateur peut sélectionner le texte manuellement.
    }
  }

  return (
    <main className="quorum-container flex min-h-dvh flex-col justify-between py-6">
      <div className="flex flex-col gap-6">
        <header className="quorum-section-rule pt-6">
          <h1 className="text-voted font-bold text-ink">
            {copy.voted.heading}
          </h1>
          <p className="text-body mt-4 text-ink-2">{question}</p>
        </header>

        <section className="quorum-rule py-6">
          <p className="text-meta text-ink-2">{copy.voted.receiptLabel}</p>
          {loaded && receipt ? (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-4 border border-ink p-4">
              <span
                data-testid="vote-receipt"
                className="font-mono text-heading font-normal tracking-wider text-ink"
              >
                {receipt}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex min-h-[48px] cursor-pointer items-center text-meta font-medium text-ink underline underline-offset-4"
              >
                {copied ? copy.voted.copied : copy.voted.copyReceipt}
              </button>
            </div>
          ) : loaded ? (
            <p className="text-meta mt-2 text-ink-2">
              {copy.voted.receiptUnavailable}
            </p>
          ) : null}

          <p className="text-meta mt-4 text-ink-2">
            {copy.voted.receiptExplanation}
          </p>
          <p className="text-mono-xs mt-3 text-ink-2">
            {copy.voted.closesAtNotice(closesAtLabel)}
          </p>
        </section>
      </div>

      <footer className="flex flex-col gap-3 pt-6 pb-8">
        <Link
          href="/votes"
          className="flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
        >
          {copy.votes.backToVotes}
        </Link>
        {isOpen && (
          <Link
            href={`/votes/${slug}/bulletin`}
            className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            {copy.voted.revoteLink}
          </Link>
        )}
      </footer>
    </main>
  );
}
