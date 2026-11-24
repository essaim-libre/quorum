"use client";

import { useState } from "react";
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
          type="button"
          role="tab"
          id="tab-pour"
          aria-selected={active === "pour"}
          aria-controls="panel-pour"
          onClick={() => setActive("pour")}
          className={
            active === "pour"
              ? "min-h-[48px] cursor-pointer border-r border-ink bg-ink px-4 text-meta font-bold text-bg"
              : "min-h-[48px] cursor-pointer border-r border-ink bg-bg px-4 text-meta font-medium text-ink"
          }
        >
          {copy.votes.argumentPourTab}
        </button>
        <button
          type="button"
          role="tab"
          id="tab-contre"
          aria-selected={active === "contre"}
          aria-controls="panel-contre"
          onClick={() => setActive("contre")}
          className={
            active === "contre"
              ? "min-h-[48px] cursor-pointer bg-ink px-4 text-meta font-bold text-bg"
              : "min-h-[48px] cursor-pointer bg-bg px-4 text-meta font-medium text-ink"
          }
        >
          {copy.votes.argumentContreTab}
        </button>
      </div>

      {active === "pour" ? (
        <div
          id="panel-pour"
          role="tabpanel"
          aria-labelledby="tab-pour"
          className="pt-5"
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
          id="panel-contre"
          role="tabpanel"
          aria-labelledby="tab-contre"
          className="pt-5"
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
