"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { StickyHeader } from "@/components/StickyHeader";
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

  const radioRefs = useRef<Array<HTMLButtonElement | null>>([]);

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

  function handleOptionKeyDown(
    index: number,
    event: KeyboardEvent<HTMLButtonElement>,
  ) {
    if (options.length === 0) {
      return;
    }
    if (event.key === "ArrowDown" || event.key === "ArrowRight") {
      event.preventDefault();
      const nextIndex = (index + 1) % options.length;
      const nextOpt = options[nextIndex];
      if (nextOpt) {
        setSelectedOptionId(nextOpt.id);
        radioRefs.current[nextIndex]?.focus();
      }
    } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
      event.preventDefault();
      const prevIndex = (index - 1 + options.length) % options.length;
      const prevOpt = options[prevIndex];
      if (prevOpt) {
        setSelectedOptionId(prevOpt.id);
        radioRefs.current[prevIndex]?.focus();
      }
    }
  }

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

  const stepProgressPercent = step === "choose" ? 50 : 100;

  return (
    <main className="quorum-container flex min-h-dvh flex-col justify-between pb-6">
      <div className="flex flex-col gap-6">
        <StickyHeader
          condensedTitle={question}
          backHref={`/votes/${slug}`}
          backLabel={copy.ballot.backToQuestion}
          rightMeta={step === "choose" ? "01 / 02" : "02 / 02"}
        />

        {/* Filet fin de progression d'étape (2 px) */}
        <div aria-hidden="true" className="h-[2px] w-full bg-rule">
          <div
            className="h-[2px] bg-ink transition-[width] duration-300 ease-[var(--ease-quorum)]"
            style={{ width: `${stepProgressPercent}%` }}
          />
        </div>

        <header className="pt-2">
          <p className="text-mono-xs uppercase text-ink-2">
            {step === "choose"
              ? copy.ballot.stepChoose
              : copy.ballot.stepConfirm}
          </p>
          <h1 className="text-heading mt-2 font-bold text-ink">{question}</h1>
        </header>

        {tokenLoading && (
          <div role="status" className="flex flex-col gap-2">
            <p className="text-meta text-ink-2">{copy.ballot.preparingToken}</p>
            <div className="h-[2px] w-full overflow-hidden bg-rule">
              <div className="quorum-indeterminate-bar h-[2px] w-1/2 bg-ink" />
            </div>
          </div>
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
          <fieldset key="choose" className="quorum-animate-in flex flex-col gap-3">
            <legend className="text-meta text-ink-2">
              {token?.hasVoted
                ? copy.ballot.revoteHint
                : copy.ballot.chooseHint}
            </legend>
            <div
              role="radiogroup"
              aria-label={question}
              className="flex flex-col gap-3 pt-1"
            >
              {options.map((option, index) => {
                const selected = option.id === selectedOptionId;
                return (
                  <button
                    key={option.id}
                    ref={(el) => {
                      radioRefs.current[index] = el;
                    }}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    onClick={() => setSelectedOptionId(option.id)}
                    onKeyDown={(event) => handleOptionKeyDown(index, event)}
                    className={
                      selected
                        ? "quorum-pressable flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-4 border border-ink bg-ink px-4 py-3 text-left text-body font-bold text-bg"
                        : "quorum-pressable flex min-h-[56px] w-full cursor-pointer items-center justify-between gap-4 border border-ink bg-bg px-4 py-3 text-left text-body font-normal text-ink hover:bg-surface"
                    }
                  >
                    <span>{option.label}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-mono-xs">
                        {String(option.position).padStart(2, "0")}
                      </span>
                      <span
                        aria-hidden="true"
                        className={
                          selected
                            ? "inline-block h-2.5 w-2.5 border border-bg bg-bg"
                            : "inline-block h-2.5 w-2.5 border border-ink bg-transparent"
                        }
                      />
                    </span>
                  </button>
                );
              })}
            </div>
          </fieldset>
        )}

        {!tokenError && step === "confirm" && selectedOption && (
          <section
            key="confirm"
            className="quorum-animate-in quorum-rule flex flex-col gap-4 pt-6"
          >
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
            className="quorum-pressable flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:cursor-not-allowed disabled:opacity-40"
          >
            {copy.ballot.continueCta}
          </button>
        )}

        {!tokenError && step === "confirm" && (
          <>
            {isSubmitting && (
              <div
                aria-hidden="true"
                className="h-[2px] w-full overflow-hidden bg-rule"
              >
                <div className="quorum-indeterminate-bar h-[2px] w-1/2 bg-ink" />
              </div>
            )}
            <button
              type="button"
              disabled={isSubmitting || !token}
              onClick={handleConfirmVote}
              className="quorum-pressable flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
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
              className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4 transition-colors duration-150 hover:text-ink disabled:opacity-60"
            >
              {copy.ballot.changeChoice}
            </button>
          </>
        )}
      </footer>
    </main>
  );
}
