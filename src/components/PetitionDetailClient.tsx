"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { copy, getErrorMessage } from "@/copy/fr";
import type { PublicPetitionDetail } from "@/lib/petitions/service";

export function PetitionDetailClient({
  petition,
  isAuthenticated,
}: {
  readonly petition: PublicPetitionDetail;
  readonly isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [signing, setSigning] = useState(false);
  const [rewordingBusy, setRewordingBusy] = useState(false);
  const [contreText, setContreText] = useState("");
  const [contreAuthor, setContreAuthor] = useState("");
  const [contreBusy, setContreBusy] = useState(false);
  const [supportingId, setSupportingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleSign() {
    setErrorMessage(null);
    setSigning(true);
    try {
      const res = await fetch(
        `/api/petitions/${encodeURIComponent(petition.slug)}/sign`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setSigning(false);
    }
  }

  async function handleRewording(accept: boolean) {
    setErrorMessage(null);
    setRewordingBusy(true);
    try {
      const res = await fetch(
        `/api/petitions/${encodeURIComponent(petition.slug)}/accept-rewording`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accept }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setRewordingBusy(false);
    }
  }

  async function handleAddContre(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setContreBusy(true);
    try {
      const res = await fetch(
        `/api/petitions/${encodeURIComponent(petition.slug)}/contre`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: contreText.trim(),
            authorLabel: contreAuthor.trim(),
          }),
        },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }
      setContreText("");
      setContreAuthor("");
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setContreBusy(false);
    }
  }

  async function handleSupport(proposalId: string) {
    setErrorMessage(null);
    setSupportingId(proposalId);
    try {
      const res = await fetch(
        `/api/contre/${encodeURIComponent(proposalId)}/support`,
        { method: "POST" },
      );
      const data = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!res.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setSupportingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {errorMessage && (
        <p role="alert" className="border border-error p-3 text-meta text-error">
          {errorMessage}
        </p>
      )}

      {/* Action principale selon l'état */}
      {petition.state === "collecting" && (
        <div>
          {!isAuthenticated ? (
            <Link
              href="/"
              className="flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
            >
              {copy.ballot.loginLink}
            </Link>
          ) : petition.viewer.hasSigned ? (
            <p className="border border-ink p-4 text-meta font-medium text-ink">
              {copy.petitions.alreadySignedLabel}
            </p>
          ) : (
            <button
              type="button"
              disabled={signing}
              onClick={handleSign}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {signing ? copy.petitions.signingCta : copy.petitions.signCta}
            </button>
          )}
        </div>
      )}

      {petition.state === "approved" && petition.voteSlug && (
        <Link
          href={`/votes/${petition.voteSlug}`}
          className="flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
        >
          {copy.petitions.seePublishedVote}
        </Link>
      )}

      {petition.state === "changes_requested" &&
        petition.proposedRewording && (
          <section className="border border-ink p-4">
            <h2 className="text-mono-xs font-bold uppercase text-ink">
              {copy.petitions.rewordingTitle}
            </h2>
            <p className="text-body mt-2 font-medium text-ink">
              {petition.proposedRewording}
            </p>
            {petition.decisionReason && (
              <p className="text-meta mt-2 text-ink-2">
                {petition.decisionReason}
              </p>
            )}
            {petition.viewer.isAuthor && (
              <div className="mt-4 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={rewordingBusy}
                  onClick={() => handleRewording(true)}
                  className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
                >
                  {copy.petitions.acceptRewording}
                </button>
                <button
                  type="button"
                  disabled={rewordingBusy}
                  onClick={() => handleRewording(false)}
                  className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
                >
                  {copy.petitions.refuseRewording}
                </button>
              </div>
            )}
          </section>
        )}

      {/* Section Arguments Contre (§3.3) */}
      <section className="quorum-section-rule flex flex-col gap-5 pt-6">
        <div>
          <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
            {copy.petitions.contreSectionTitle}
          </h2>
          <p className="text-meta mt-2 text-ink-2">
            {copy.petitions.contreIntro}
          </p>
        </div>

        {petition.contreProposals.length === 0 ? (
          <p className="quorum-rule py-4 text-body text-ink-2">
            {copy.petitions.contreEmpty}
          </p>
        ) : (
          <div className="divide-y divide-rule border-t border-b border-rule">
            {petition.contreProposals.map((prop) => {
              const isSupported =
                petition.viewer.supportedContreId === prop.id;
              return (
                <article key={prop.id} className="flex flex-col gap-3 py-5">
                  <p className="text-body whitespace-pre-line text-ink">
                    {prop.text}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span className="text-mono-xs text-ink-2">
                      {copy.petitions.contreStudentPrefix}
                      {copy.votes.signedBy(prop.authorLabel)} ·{" "}
                      {copy.petitions.supportsCount(prop.supports)}
                    </span>
                    {petition.state === "collecting" && isAuthenticated && (
                      <button
                        type="button"
                        disabled={supportingId !== null}
                        onClick={() => handleSupport(prop.id)}
                        className={
                          isSupported
                            ? "min-h-[48px] cursor-pointer border border-ink bg-ink px-4 text-meta font-bold text-bg"
                            : "min-h-[48px] cursor-pointer border border-ink bg-bg px-4 text-meta text-ink"
                        }
                      >
                        {isSupported
                          ? copy.petitions.supportedAction
                          : copy.petitions.supportAction}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {petition.state === "collecting" && isAuthenticated && (
          <form
            onSubmit={handleAddContre}
            className="quorum-rule flex flex-col gap-4 pt-5"
          >
            <div className="flex flex-col gap-2">
              <label htmlFor="contre-text" className="text-meta font-medium">
                {copy.petitions.contreTextLabel}
              </label>
              <textarea
                id="contre-text"
                rows={3}
                maxLength={600}
                required
                value={contreText}
                onChange={(e) => setContreText(e.target.value)}
                className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
              />
            </div>
            <div className="flex flex-col gap-2">
              <label htmlFor="contre-author" className="text-meta font-medium">
                {copy.petitions.contreAuthorLabel}
              </label>
              <input
                id="contre-author"
                type="text"
                maxLength={120}
                required
                value={contreAuthor}
                onChange={(e) => setContreAuthor(e.target.value)}
                className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
              />
            </div>
            <button
              type="submit"
              disabled={contreBusy}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {copy.petitions.contreSubmit}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}
