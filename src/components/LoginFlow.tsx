"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  type ClipboardEvent,
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { copy, getErrorMessage } from "@/copy/fr";

type Step = "welcome" | "email" | "code";

const CODE_LENGTH = 6;
const RESEND_DELAY_SECONDS = 60;

export function LoginFlow() {
  const router = useRouter();
  const [step, setStep] = useState<Step>("welcome");
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState<string[]>(() =>
    Array.from({ length: CODE_LENGTH }, () => ""),
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [resendSeconds, setResendSeconds] = useState(0);

  const emailInputRef = useRef<HTMLInputElement | null>(null);
  const digitRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (step === "email") {
      emailInputRef.current?.focus();
    } else if (step === "code") {
      digitRefs.current[0]?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (resendSeconds <= 0) {
      return;
    }
    const timer = window.setInterval(() => {
      setResendSeconds((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendSeconds]);

  async function requestCode(targetEmail: string, isResend: boolean) {
    setErrorMessage(null);
    setStatusMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        devCode?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(getErrorMessage(payload?.error));
        return;
      }

      setDigits(Array.from({ length: CODE_LENGTH }, () => ""));
      setDevCode(
        typeof payload?.devCode === "string" && /^\d{6}$/.test(payload.devCode)
          ? payload.devCode
          : null,
      );
      setResendSeconds(RESEND_DELAY_SECONDS);
      setStep("code");
      if (isResend) {
        setStatusMessage(copy.auth.resendSuccess);
      }
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleEmailSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await requestCode(email, false);
  }

  async function handleCodeSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = digits.join("");
    if (!/^\d{6}$/.test(code)) {
      setErrorMessage(copy.errors.invalid_code);
      return;
    }

    setErrorMessage(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });

      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(getErrorMessage(payload?.error));
        return;
      }

      router.push("/votes");
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDigitChange(index: number, rawValue: string) {
    const onlyDigits = rawValue.replace(/\D/g, "");
    if (onlyDigits.length === 0) {
      setDigits((prev) => {
        const next = [...prev];
        next[index] = "";
        return next;
      });
      return;
    }

    if (onlyDigits.length > 1) {
      applyPastedDigits(onlyDigits, index);
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      next[index] = onlyDigits;
      return next;
    });

    if (index < CODE_LENGTH - 1) {
      digitRefs.current[index + 1]?.focus();
    }
  }

  function applyPastedDigits(rawDigits: string, startIndex: number) {
    const clean = rawDigits.replace(/\D/g, "").slice(0, CODE_LENGTH);
    if (clean.length === 0) {
      return;
    }

    setDigits((prev) => {
      const next = [...prev];
      const offset = clean.length === CODE_LENGTH ? 0 : startIndex;
      for (let i = 0; i < clean.length && offset + i < CODE_LENGTH; i += 1) {
        next[offset + i] = clean[i] ?? "";
      }
      return next;
    });

    const targetIndex = Math.min(
      CODE_LENGTH - 1,
      (clean.length === CODE_LENGTH ? 0 : startIndex) + clean.length - 1,
    );
    digitRefs.current[targetIndex]?.focus();
  }

  function handleDigitPaste(
    index: number,
    event: ClipboardEvent<HTMLInputElement>,
  ) {
    event.preventDefault();
    applyPastedDigits(event.clipboardData.getData("text"), index);
  }

  function handleDigitKeyDown(
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) {
    if (event.key === "Backspace" && !digits[index] && index > 0) {
      event.preventDefault();
      setDigits((prev) => {
        const next = [...prev];
        next[index - 1] = "";
        return next;
      });
      digitRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowLeft" && index > 0) {
      event.preventDefault();
      digitRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < CODE_LENGTH - 1) {
      event.preventDefault();
      digitRefs.current[index + 1]?.focus();
    }
  }

  function handleBack() {
    setErrorMessage(null);
    setStatusMessage(null);
    if (step === "code") {
      setStep("email");
    } else {
      setStep("welcome");
    }
  }

  return (
    <main className="quorum-container flex min-h-dvh flex-col justify-between py-6">
      <header className="flex items-baseline justify-between border-b border-rule pb-4">
        <span className="text-xl font-bold tracking-tight text-ink">
          {copy.app.name}
        </span>
        <span className="text-mono-xs text-ink-2">{copy.app.institution}</span>
      </header>

      {step === "welcome" && (
        <>
          <div className="my-auto py-12">
            <p className="text-question-list font-normal text-ink">
              {copy.app.tagline}
            </p>
          </div>

          <footer className="flex flex-col gap-4 pb-6">
            <button
              type="button"
              onClick={() => {
                setErrorMessage(null);
                setStep("email");
              }}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
            >
              {copy.auth.startCta}
            </button>

            <div className="pt-1">
              <Link
                href="/comment-ca-marche"
                className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                {copy.auth.anonymityLink}
              </Link>
            </div>
          </footer>
        </>
      )}

      {step === "email" && (
        <form
          onSubmit={handleEmailSubmit}
          className="flex flex-1 flex-col justify-between py-8"
          noValidate
        >
          <div className="flex flex-col gap-6">
            <div>
              <button
                type="button"
                onClick={handleBack}
                aria-label={copy.auth.backLabel}
                className="-ml-3 inline-flex h-12 w-12 cursor-pointer items-center justify-center text-ink"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 4.5L7 10L12.5 15.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="square"
                  />
                </svg>
              </button>
            </div>

            <div className="quorum-section-rule pt-4">
              <h1 className="text-heading font-bold text-ink">
                {copy.auth.emailTitle}
              </h1>
            </div>

            <div className="flex flex-col gap-2">
              <label
                htmlFor="student-email"
                className="text-meta font-medium text-ink"
              >
                {copy.auth.emailLabel}
              </label>
              <input
                ref={emailInputRef}
                id="student-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={copy.auth.emailPlaceholder}
                aria-describedby="email-help"
                className="h-[52px] w-full rounded-[2px] border border-ink bg-bg px-3 text-body text-ink placeholder:text-ink-2"
              />
              <p id="email-help" className="text-meta text-ink-2">
                {copy.auth.emailHelp}
              </p>
            </div>

            {errorMessage && (
              <p role="alert" className="text-meta font-medium text-error">
                {errorMessage}
              </p>
            )}
          </div>

          <footer className="flex flex-col gap-4 pt-8 pb-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {isSubmitting ? copy.auth.emailSubmitting : copy.auth.emailSubmit}
            </button>
          </footer>
        </form>
      )}

      {step === "code" && (
        <form
          onSubmit={handleCodeSubmit}
          className="flex flex-1 flex-col justify-between py-8"
          noValidate
        >
          <div className="flex flex-col gap-6">
            <div>
              <button
                type="button"
                onClick={handleBack}
                aria-label={copy.auth.backLabel}
                className="-ml-3 inline-flex h-12 w-12 cursor-pointer items-center justify-center text-ink"
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12.5 4.5L7 10L12.5 15.5"
                    stroke="currentColor"
                    strokeWidth="1.5"
                    strokeLinecap="square"
                  />
                </svg>
              </button>
            </div>

            <div className="quorum-section-rule pt-4">
              <h1 className="text-heading font-bold text-ink">
                {copy.auth.codeTitle}
              </h1>
              <p className="text-body mt-3 text-ink-2">
                {copy.auth.codeSentNotice}
              </p>
            </div>

            <fieldset className="flex flex-col gap-3">
              <legend className="text-meta font-medium text-ink">
                {copy.auth.codeGroupLabel}
              </legend>
              <div className="grid grid-cols-6 gap-2 sm:gap-3">
                {digits.map((digit, index) => (
                  <input
                    key={index}
                    ref={(el) => {
                      digitRefs.current[index] = el;
                    }}
                    type="text"
                    inputMode="numeric"
                    autoComplete={index === 0 ? "one-time-code" : "off"}
                    maxLength={CODE_LENGTH}
                    aria-label={copy.auth.codeDigitLabel(index + 1)}
                    value={digit}
                    onChange={(event) =>
                      handleDigitChange(index, event.target.value)
                    }
                    onPaste={(event) => handleDigitPaste(index, event)}
                    onKeyDown={(event) => handleDigitKeyDown(index, event)}
                    className="h-[52px] w-full rounded-[2px] border border-ink bg-bg text-center font-mono text-heading text-ink"
                  />
                ))}
              </div>
            </fieldset>

            {devCode && (
              <div
                role="status"
                className="flex items-center justify-between border border-ink p-3"
              >
                <span className="text-mono-xs text-ink">
                  {copy.auth.devCodeNotice(devCode)}
                </span>
                <button
                  type="button"
                  onClick={() => applyPastedDigits(devCode, 0)}
                  className="inline-flex min-h-[48px] cursor-pointer items-center pl-3 text-meta font-medium text-ink underline underline-offset-4"
                >
                  {copy.auth.devCodeFill}
                </button>
              </div>
            )}

            {statusMessage && (
              <p role="status" className="text-meta text-ink-2">
                {statusMessage}
              </p>
            )}

            {errorMessage && (
              <p role="alert" className="text-meta font-medium text-error">
                {errorMessage}
              </p>
            )}

            <div className="flex flex-col items-start gap-1">
              {resendSeconds > 0 ? (
                <p className="text-mono-xs py-2 text-ink-2">
                  {copy.auth.resendCountdown(resendSeconds)}
                </p>
              ) : (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => requestCode(email, true)}
                  className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink underline underline-offset-4 disabled:opacity-60"
                >
                  {copy.auth.resendAction}
                </button>
              )}

              <button
                type="button"
                onClick={handleBack}
                className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
              >
                {copy.auth.changeEmailAction}
              </button>
            </div>
          </div>

          <footer className="flex flex-col gap-4 pt-8 pb-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {isSubmitting ? copy.auth.codeSubmitting : copy.auth.codeSubmit}
            </button>
          </footer>
        </form>
      )}
    </main>
  );
}
