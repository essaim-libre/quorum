"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { copy } from "@/copy/fr";

export interface StickyHeaderAction {
  readonly href: string;
  readonly label: string;
}

/**
 * En-tête fixe contextuel (opaque, zéro flou, zéro ombre — §10).
 * Au repos : marque ou lien retour + filet `rule` (1 px).
 * Dès que l'élément cible (`observeTargetId`, par défaut le premier `<h1>` du document)
 * sort de l'écran : filet `ink` (1 px) + titre condensé sur une ligne + action rapide optionnelle.
 */
export function StickyHeader({
  condensedTitle,
  backHref,
  backLabel,
  rightMeta,
  quickAction,
  observeTargetId,
  brandHref = "/votes",
}: {
  readonly condensedTitle: string;
  readonly backHref?: string;
  readonly backLabel?: string;
  readonly rightMeta?: string;
  readonly quickAction?: StickyHeaderAction;
  readonly observeTargetId?: string;
  readonly brandHref?: string;
}) {
  const [condensed, setCondensed] = useState(false);

  useEffect(() => {
    const target = observeTargetId
      ? document.getElementById(observeTargetId)
      : document.querySelector("main h1");

    if (!target || typeof IntersectionObserver === "undefined") {
      const handleScroll = () => {
        setCondensed(window.scrollY > 72);
      };
      handleScroll();
      window.addEventListener("scroll", handleScroll, { passive: true });
      return () => window.removeEventListener("scroll", handleScroll);
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) {
          return;
        }
        // Passe en mode condensé uniquement quand le h1 est sorti par le haut du viewport
        setCondensed(!entry.isIntersecting && entry.boundingClientRect.top < 64);
      },
      {
        rootMargin: "-56px 0px 0px 0px",
        threshold: 0,
      },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [observeTargetId]);

  return (
    <header
      data-condensed={condensed ? "true" : "false"}
      className={`sticky top-0 z-30 -mx-5 bg-bg px-5 transition-colors duration-200 ${
        condensed ? "border-b border-ink" : "border-b border-rule"
      }`}
    >
      <div className="flex min-h-[56px] items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {backHref && backLabel ? (
            <Link
              href={backHref}
              className="inline-flex min-h-[48px] shrink-0 items-center text-meta text-ink-2 underline underline-offset-4 transition-colors duration-150 hover:text-ink"
            >
              {backLabel}
            </Link>
          ) : (
            <Link
              href={brandHref}
              className="inline-flex min-h-[48px] shrink-0 items-center text-xl font-bold tracking-tight text-ink transition-opacity duration-150 hover:opacity-80"
            >
              {copy.app.name}
            </Link>
          )}

          <span
            aria-hidden={!condensed}
            className={`truncate border-l border-rule pl-3 text-meta font-bold text-ink transition-all duration-200 ease-[var(--ease-quorum)] ${
              condensed
                ? "translate-y-0 opacity-100"
                : "pointer-events-none translate-y-1 opacity-0"
            }`}
          >
            {condensedTitle}
          </span>
        </div>

        <div className="flex shrink-0 items-center">
          {quickAction && condensed ? (
            <Link
              href={quickAction.href}
              className="quorum-pressable inline-flex min-h-[48px] items-center bg-ink px-4 text-meta font-medium text-bg rounded-[2px]"
            >
              {quickAction.label}
            </Link>
          ) : rightMeta ? (
            <span className="text-mono-xs text-ink-2">{rightMeta}</span>
          ) : null}
        </div>
      </div>
    </header>
  );
}
