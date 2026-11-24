"use client";

import { useEffect, useMemo, useState } from "react";
import { copy } from "@/copy/fr";
import { getStoredVoteToken } from "@/lib/client/token-store";

export function ReceiptsDirectory({
  voteId,
  receipts,
}: {
  readonly voteId: string;
  readonly receipts: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [myReceipt, setMyReceipt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void getStoredVoteToken(voteId)
      .then((token) => {
        if (!active) return;
        if (token?.hasVoted && token.receipt) {
          setMyReceipt(token.receipt);
        }
      })
      .catch(() => {
        // IndexedDB indisponible
      });
    return () => {
      active = false;
    };
  }, [voteId]);

  const myReceiptPresent = useMemo(() => {
    if (!myReceipt) return false;
    return receipts.includes(myReceipt);
  }, [myReceipt, receipts]);

  const normalizedQuery = query.trim().toUpperCase();
  const filtered = useMemo(() => {
    if (!normalizedQuery) return receipts;
    return receipts.filter((r) => r.includes(normalizedQuery));
  }, [normalizedQuery, receipts]);

  return (
    <div className="flex flex-col gap-6">
      {myReceipt && (
        <div
          role="status"
          className={
            myReceiptPresent
              ? "border border-ink p-4 text-meta text-ink"
              : "border border-error p-4 text-meta text-error"
          }
        >
          {myReceiptPresent
            ? copy.receipts.myReceiptFound(myReceipt)
            : copy.receipts.myReceiptMissing(myReceipt)}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label htmlFor="receipt-search" className="text-meta font-medium text-ink">
          {copy.receipts.searchLabel}
        </label>
        <input
          id="receipt-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={copy.receipts.searchPlaceholder}
          className="h-[52px] w-full rounded-[2px] border border-ink bg-bg px-3 font-mono text-body text-ink uppercase placeholder:normal-case placeholder:text-ink-2"
        />
      </div>

      <div className="quorum-section-rule pt-3">
        <div className="flex items-baseline justify-between pb-3">
          <span className="text-mono-xs font-bold uppercase text-ink">
            {copy.receipts.title}
          </span>
          <span className="text-mono-xs text-ink-2">
            {copy.receipts.countLabel(filtered.length)}
          </span>
        </div>

        {receipts.length === 0 ? (
          <p className="quorum-rule py-6 text-body text-ink-2">
            {copy.receipts.emptyList}
          </p>
        ) : filtered.length === 0 ? (
          <p className="quorum-rule py-6 text-body text-ink-2">
            {copy.receipts.noMatch}
          </p>
        ) : (
          <ul className="quorum-rule grid grid-cols-2 gap-2 pt-4 sm:grid-cols-3">
            {filtered.map((receipt) => {
              const isMine = myReceipt === receipt;
              return (
                <li
                  key={receipt}
                  className={
                    isMine
                      ? "border border-ink bg-ink px-3 py-2 font-mono text-meta font-bold text-bg"
                      : "border border-rule px-3 py-2 font-mono text-meta text-ink"
                  }
                >
                  {receipt}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
