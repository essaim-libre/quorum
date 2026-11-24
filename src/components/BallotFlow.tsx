"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { copy, getErrorMessage } from "@/copy/fr";
import type { StoredVoteToken } from "@/lib/client/token-store";
import {
  castAnonymousBallot,
  ensureVoteToken,
} from "@/lib/client/voting-client";
import type { PublicVoteOption } from "@/lib/votes/service";

type Step = "choose" | "confirm";

export function BallotFlow({
  voteId,
  slug,
  question,
  publicKeySpkiBase64,
  options,
}: {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly publicKeySpkiBase64: string;
  readonly options: readonly PublicVoteOption[];
}) {
  const router = useRouter();
  const [step, setStep] = useState<Step>("choose");
  // Invariant n°10 et §2.3 : aucune présélection, jamais persisté sur l'appareil.
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  const [token, setToken] = useState<StoredVoteToken | null>(null);
  const [tokenLoading, setTokenLoading] = useState(true);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    async function loadToken() {
      setTokenLoading(true);
      setTokenError(null);
      const res = await ensureVoteToken({
        voteId,
        slug,
        question,
        publicKeySpkiBase64,
      });
      if (!active) {
        return;
      }
      if (res.ok) {
        setToken(res.token);
      } else {
        setTokenError(res.error);
      }
      setTokenLoading(false);
    }
    void loadToken();
    return () => {
      active = false;
    };
  }, [publicKeySpkiBase64, question, slug, voteId]);

  const selectedOption =
    options.find((opt) => opt.id === selectedOptionId) ?? null;

  async function handleConfirmVote() {
    if (!token || !selectedOption) {
      return;
    }
    setSubmitError(null);
    setIsSubmitting(true);

    const res = await castAnonymousBallot({
      token,
      optionId: selectedOption.id,
    });

    if (!res.ok) {
      setSubmitError(getErrorMessage(res.error));
      setIsSubmitting(false);
      return;
    }

    router.push(`/votes/${slug}/a-vote`);
    router.refresh();
  }

  return (
    <main className="quorum-container flex min-h-dvh flex-col justify-between py-6">
      <div className="flex flex-col gap-6">
        <div className="border-b border-rule pb-2">
          <Link
            href={`/votes/${slug}`}
            className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            {copy.ballot.backToQuestion}
          </Link>
        </div>

        <header className="quorum-section-rule pt-4">
          <p className="text-mono-xs uppercase text-ink-2">
            {step === "choose"
              ? copy.ballot.stepChoose
              : copy.ballot.stepConfirm}
          </p>
          <h1 className="text-heading mt-2 font-bold text-ink">{question}</h1>
        </header>

        {tokenLoading && (
          <p role="status" className="text-meta text-ink-2">
            {copy.ballot.preparingToken}
          </p>
        )}

        {tokenError === "unauthorized" && (
          <div role="alert" className="border border-ink p-4">
            <p className="text-body text-ink">{copy.errors.unauthorized}</p>
            <Link
              href="/"
              className="mt-2 inline-flex min-h-[48px] items-center text-meta font-bold text-ink underline underline-offset-4"
            >
              {copy.ballot.loginLink}
            </Link>
          </div>
        )}

        {tokenError === "token_already_issued" && (
          <div role="alert" className="border border-ink p-4">
            <p className="text-body font-medium text-ink">
              {copy.ballot.tokenLostTitle}
            </p>
            <p className="text-meta mt-2 text-ink-2">
              {copy.ballot.tokenLostBody}
            </p>
            <Link
              href="/comment-ca-marche"
              className="mt-2 inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
            >
              {copy.auth.anonymityLink}
            </Link>
          </div>
        )}

        {tokenError &&
          tokenError !== "unauthorized" &&
          tokenError !== "token_already_issued" && (
            <p role="alert" className="text-meta font-medium text-error">
              {getErrorMessage(tokenError)}
            </p>
          )}

        {!tokenError && step === "choose" && (
          <fieldset className="flex flex-col gap-3">
            <legend className="text-meta text-ink-2">
              {token?.hasVoted
                ? copy.ballot.revoteHint
                : copy.ballot.chooseHint}
            </legend>
            <div className="flex flex-col gap-3 pt-1">
              {options.map((option) => {
                const selected = option.id === selectedOptionId;
                return (
                  <button
                    key={option.id}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedOptionId(option.id)}
                    className={
                      selected
                        ? "flex min-h-[56px] w-full cursor-pointer items-center justify-between border border-ink bg-ink px-4 py-3 text-left text-body font-bold text-bg"
                        : "flex min-h-[56px] w-full cursor-pointer items-center justify-between border border-ink bg-bg px-4 py-3 text-left text-body font-normal text-ink"
                    }
                  >
                    <span>{option.label}</span>
                    <span className="text-mono-xs">
                      {String(option.position).padStart(2, "0")}
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {!tokenError && step === "confirm" && selectedOption && (
          <section className="quorum-rule flex flex-col gap-4 pt-6">
            <p className="text-meta text-ink-2">{copy.ballot.selectedLabel}</p>
            <div className="border border-ink bg-ink p-5 text-heading font-bold text-bg">
              {selectedOption.label}
            </div>
            <p className="text-meta text-ink-2">
              {copy.ballot.confirmPrivacyNote}
            </p>
            {submitError && (
              <p role="alert" className="text-meta font-medium text-error">
                {submitError}
              </p>
            )}
          </section>
        )}
      </div>

      <footer className="flex flex-col gap-3 pt-8 pb-6">
        {!tokenError && step === "choose" && (
          <button
            type="button"
            disabled={!selectedOption || !token || tokenLoading}
            onClick={() => {
              setSubmitError(null);
              setStep("confirm");
            }}
            className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.ballot.continueCta}
          </button>
        )}

        {!tokenError && step === "confirm" && (
          <>
            <button
              type="button"
              disabled={isSubmitting || !token}
              onClick={handleConfirmVote}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {isSubmitting
                ? copy.ballot.submittingCta
                : copy.ballot.confirmCta}
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => {
                setSubmitError(null);
                setStep("choose");
              }}
              className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink disabled:opacity-60"
            >
              {copy.ballot.changeChoice}
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
