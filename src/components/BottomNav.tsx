"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { copy } from "@/copy/fr";

const items = [
  { href: "/votes", label: copy.nav.votes },
  { href: "/proposer", label: copy.nav.propose },
  { href: "/moi", label: copy.nav.me },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale"
      className="fixed right-0 bottom-0 left-0 border-t border-rule bg-bg"
    >
      <div className="quorum-container grid grid-cols-3">
        {items.map((item) => {
          const active =
            pathname === item.href ||
            pathname.startsWith(`${item.href}/`) ||
            (item.href === "/proposer" && pathname.startsWith("/petitions"));
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={
                active
                  ? "-mt-px flex min-h-[52px] items-center justify-center border-t-2 border-ink text-meta font-bold text-ink"
                  : "flex min-h-[52px] items-center justify-center text-meta font-normal text-ink-2 hover:text-ink"
              }
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
