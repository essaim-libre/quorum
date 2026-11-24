"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { copy } from "@/copy/fr";
import {
  listVotedReceipts,
  type StoredVoteToken,
} from "@/lib/client/token-store";

export function MyReceiptsList() {
  const [receipts, setReceipts] = useState<StoredVoteToken[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    void listVotedReceipts()
      .then((items) => {
        if (!active) return;
        setReceipts(items);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!loaded) {
    return null;
  }

  if (receipts.length === 0) {
    return <p className="text-body mt-3 text-ink-2">{copy.me.receiptsEmpty}</p>;
  }

  return (
    <ul className="mt-4 divide-y divide-rule border-t border-b border-rule">
      {receipts.map((item) => (
        <li
          key={item.key}
          className="flex flex-col gap-2 py-4 sm:flex-row sm:items-baseline sm:justify-between"
        >
          <div className="flex flex-col gap-1">
            <Link
              href={`/votes/${item.slug}`}
              className="text-body font-medium text-ink hover:underline hover:underline-offset-4"
            >
              {item.question}
            </Link>
            <span className="text-mono-xs text-ink-2">
              {copy.me.receiptCodeLabel}
            </span>
          </div>
          <span
            data-testid={`my-receipt-${item.slug}`}
            className="font-mono text-body text-ink"
          >
            {item.receipt}
          </span>
        </li>
      ))}
    </ul>
  );
}
