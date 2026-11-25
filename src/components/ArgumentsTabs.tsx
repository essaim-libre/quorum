"use client";

import { type KeyboardEvent, useRef, useState } from "react";
import { copy } from "@/copy/fr";

export function ArgumentsTabs({
  argumentPour,
  argumentPourAuthor,
  argumentContre,
  argumentContreAuthor,
}: {
  readonly argumentPour: string;
  readonly argumentPourAuthor: string;
  readonly argumentContre: string | null;
  readonly argumentContreAuthor: string | null;
}) {
  const [active, setActive] = useState<"pour" | "contre">("pour");
  const pourTabRef = useRef<HTMLButtonElement | null>(null);
  const contreTabRef = useRef<HTMLButtonElement | null>(null);

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
      event.preventDefault();
      if (active === "pour") {
        setActive("contre");
        contreTabRef.current?.focus();
      } else {
        setActive("pour");
        pourTabRef.current?.focus();
      }
    }
  }

  return (
    <section className="quorum-section-rule py-6">
      <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
        {copy.votes.argumentsTitle}
      </h2>

      <div
        role="tablist"
        aria-label={copy.votes.argumentsTitle}
        className="mt-4 grid grid-cols-2 border border-ink"
      >
        <button
          ref={pourTabRef}
          type="button"
          role="tab"
          id="tab-pour"
          aria-selected={active === "pour"}
          aria-controls="panel-pour"
          tabIndex={active === "pour" ? 0 : -1}
          onClick={() => setActive("pour")}
          onKeyDown={handleTabKeyDown}
          className={
            active === "pour"
              ? "min-h-[48px] cursor-pointer border-r border-ink bg-ink px-4 text-meta font-bold text-bg transition-colors duration-150"
              : "min-h-[48px] cursor-pointer border-r border-ink bg-bg px-4 text-meta font-medium text-ink transition-colors duration-150 hover:bg-surface"
          }
        >
          {copy.votes.argumentPourTab}
        </button>
        <button
          ref={contreTabRef}
          type="button"
          role="tab"
          id="tab-contre"
          aria-selected={active === "contre"}
          aria-controls="panel-contre"
          tabIndex={active === "contre" ? 0 : -1}
          onClick={() => setActive("contre")}
          onKeyDown={handleTabKeyDown}
          className={
            active === "contre"
              ? "min-h-[48px] cursor-pointer bg-ink px-4 text-meta font-bold text-bg transition-colors duration-150"
              : "min-h-[48px] cursor-pointer bg-bg px-4 text-meta font-medium text-ink transition-colors duration-150 hover:bg-surface"
          }
        >
          {copy.votes.argumentContreTab}
        </button>
      </div>

      {active === "pour" ? (
        <div
          key="pour"
          id="panel-pour"
          role="tabpanel"
          aria-labelledby="tab-pour"
          className="quorum-animate-in pt-5"
        >
          <p className="text-body whitespace-pre-line text-ink">
            {argumentPour}
          </p>
          <p className="text-mono-xs mt-4 border-t border-rule pt-3 text-ink-2">
            {copy.votes.signedBy(argumentPourAuthor)}
          </p>
        </div>
      ) : (
        <div
          key="contre"
          id="panel-contre"
          role="tabpanel"
          aria-labelledby="tab-contre"
          className="quorum-animate-in pt-5"
        >
          {argumentContre ? (
            <>
              <p className="text-body whitespace-pre-line text-ink">
                {argumentContre}
              </p>
              {argumentContreAuthor && (
                <p className="text-mono-xs mt-4 border-t border-rule pt-3 text-ink-2">
                  {copy.votes.signedBy(argumentContreAuthor)}
                </p>
              )}
            </>
          ) : (
            <p className="text-body text-ink-2">
              {copy.votes.argumentContreEmpty}
            </p>
          )}
        </div>
      )}
    </section>
  );
}
