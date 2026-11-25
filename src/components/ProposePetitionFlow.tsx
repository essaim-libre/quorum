"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { copy, getErrorMessage } from "@/copy/fr";

const TOTAL_STEPS = 4;

export function ProposePetitionFlow({
  isAuthenticated,
}: {
  readonly isAuthenticated: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["Pour", "Contre"]);
  const [argumentPour, setArgumentPour] = useState("");
  const [argumentPourAuthor, setArgumentPourAuthor] = useState("");
  const [isAgDecision, setIsAgDecision] = useState(false);
  const [originDetail, setOriginDetail] = useState("");
  const [agDate, setAgDate] = useState("");
  const [agLocation, setAgLocation] = useState("");
  const [agAttendees, setAgAttendees] = useState("");
  const [agResult, setAgResult] = useState("");
  const [durationHours, setDurationHours] = useState(72);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isAuthenticated) {
    return (
      <section className="quorum-rule py-6">
        <p className="text-body text-ink">{copy.petitions.loginToSign}</p>
        <Link
          href="/"
          className="mt-4 flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
        >
          {copy.ballot.loginLink}
        </Link>
      </section>
    );
  }

  function validateStep(currentStep: number): string | null {
    if (currentStep === 0) {
      if (question.trim().length < 5 || question.trim().length > 140) {
        return "La question doit contenir entre 5 et 140 caractères.";
      }
    }
    if (currentStep === 1) {
      const clean = options.map((o) => o.trim()).filter((o) => o.length > 0);
      if (clean.length < 2 || clean.length > 4) {
        return "Indique entre 2 et 4 options distinctes.";
      }
      if (new Set(clean.map((o) => o.toLowerCase())).size !== clean.length) {
        return "Les options doivent être distinctes.";
      }
      if (clean.some((o) => o.toLowerCase() === "vote blanc")) {
        return "« Vote blanc » est ajouté automatiquement.";
      }
    }
    if (currentStep === 2) {
      if (argumentPour.trim().length < 5 || argumentPourAuthor.trim().length < 1) {
        return "Renseigne l’argument Pour et une signature libre.";
      }
      if (
        isAgDecision &&
        (!agDate.trim() ||
          !agLocation.trim() ||
          !Number.isFinite(Number(agAttendees)) ||
          Number(agAttendees) <= 0 ||
          !agResult.trim())
      ) {
        return "Pour une décision d’AG, renseigne date, lieu, nombre de présents et résultat.";
      }
    }
    return null;
  }

  function handleNext() {
    const err = validateStep(step);
    if (err) {
      setErrorMessage(err);
      return;
    }
    setErrorMessage(null);
    setStep((prev) => Math.min(TOTAL_STEPS - 1, prev + 1));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const err = validateStep(step);
    if (err) {
      setErrorMessage(err);
      return;
    }

    setErrorMessage(null);
    setSubmitting(true);

    try {
      const response = await fetch("/api/petitions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: question.trim(),
          options: options.map((o) => o.trim()).filter((o) => o.length > 0),
          argumentPour: argumentPour.trim(),
          argumentPourAuthor: argumentPourAuthor.trim(),
          requestedDurationHours: durationHours,
          isAgDecision,
          ...(isAgDecision
            ? {
                agDate: agDate.trim(),
                agLocation: agLocation.trim(),
                agAttendees: Number(agAttendees),
                agResult: agResult.trim(),
              }
            : { originDetail: originDetail.trim() || null }),
        }),
      });

      const payload = (await response.json().catch(() => null)) as {
        slug?: string;
        error?: string;
      } | null;

      if (!response.ok || !payload?.slug) {
        setErrorMessage(getErrorMessage(payload?.error));
        return;
      }

      router.push(`/petitions/${payload.slug}`);
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 pt-4" noValidate>
      {/* Indicateur d'étapes 1/4 à 4/4 + filet de progression continu */}
      <div>
        <ol className="grid grid-cols-4 border-t border-b border-ink">
          {copy.petitions.steps.map((label, index) => {
            const isActive = index === step;
            const isDone = index < step;
            return (
              <li
                key={label}
                className={
                  isActive
                    ? "bg-ink px-2 py-3 text-center text-mono-xs font-bold text-bg transition-colors duration-150"
                    : isDone
                      ? "px-2 py-3 text-center text-mono-xs font-medium text-ink transition-colors duration-150"
                      : "px-2 py-3 text-center text-mono-xs text-ink-2 transition-colors duration-150"
                }
              >
                {index + 1}. {label}
              </li>
            );
          })}
        </ol>
        <div aria-hidden="true" className="h-[2px] w-full bg-rule">
          <div
            className="h-[2px] bg-ink transition-[width] duration-300 ease-[var(--ease-quorum)]"
            style={{ width: `${((step + 1) / TOTAL_STEPS) * 100}%` }}
          />
        </div>
      </div>

      {step === 0 && (
        <div key="step-0" className="quorum-animate-in flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="petition-question" className="text-meta font-medium">
                {copy.admin.fields.question}
              </label>
              <span className="text-mono-xs text-ink-2">
                {question.trim().length} / 140
              </span>
            </div>
            <textarea
              id="petition-question"
              rows={3}
              maxLength={140}
              required
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={copy.petitions.charterGoodExample}
              className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
            />
          </div>

          {/* Charte de formulation (§3.5) */}
          <section className="quorum-section-rule flex flex-col gap-3 pt-4">
            <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
              {copy.petitions.charterTitle}
            </h2>
            <ol className="list-decimal space-y-1 pl-5 text-meta text-ink-2">
              {copy.petitions.charterRules.map((rule) => (
                <li key={rule}>{rule}</li>
              ))}
            </ol>
            <div className="quorum-rule flex flex-col gap-2 pt-3 text-meta">
              <p className="text-ink-2 line-through">
                {copy.petitions.charterBadExample}
              </p>
              <p className="font-medium text-ink">
                {copy.petitions.charterGoodExample}
              </p>
            </div>
          </section>
        </div>
      )}

      {step === 1 && (
        <fieldset key="step-1" className="quorum-animate-in flex flex-col gap-3">
          <legend className="text-meta font-medium text-ink">
            {copy.admin.fields.options}
          </legend>
          {options.map((opt, index) => (
            <div key={index} className="flex gap-2">
              <input
                type="text"
                maxLength={80}
                required
                aria-label={`Option ${index + 1}`}
                value={opt}
                onChange={(e) =>
                  setOptions((prev) =>
                    prev.map((item, i) => (i === index ? e.target.value : item)),
                  )
                }
                className="h-[52px] flex-1 rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
              />
              {options.length > 2 && (
                <button
                  type="button"
                  onClick={() =>
                    setOptions((prev) => prev.filter((_, i) => i !== index))
                  }
                  className="min-h-[52px] cursor-pointer px-3 text-meta text-ink-2 underline underline-offset-4"
                >
                  {copy.admin.fields.removeOption}
                </button>
              )}
            </div>
          ))}
          {options.length < 4 && (
            <div>
              <button
                type="button"
                onClick={() => setOptions((prev) => [...prev, ""])}
                className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink underline underline-offset-4"
              >
                {copy.admin.fields.addOption}
              </button>
            </div>
          )}
        </fieldset>
      )}

      {step === 2 && (
        <div key="step-2" className="quorum-animate-in flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <label htmlFor="petition-pour" className="text-meta font-medium">
                {copy.admin.fields.argumentPour}
              </label>
              <span className="text-mono-xs text-ink-2">
                {argumentPour.trim().length} / 600
              </span>
            </div>
            <textarea
              id="petition-pour"
              rows={4}
              maxLength={600}
              required
              value={argumentPour}
              onChange={(e) => setArgumentPour(e.target.value)}
              className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="petition-pour-author"
              className="text-meta font-medium"
            >
              {copy.admin.fields.argumentPourAuthor}
            </label>
            <input
              id="petition-pour-author"
              type="text"
              maxLength={120}
              required
              value={argumentPourAuthor}
              onChange={(e) => setArgumentPourAuthor(e.target.value)}
              placeholder="Ex. Comité étudiant, Anonyme…"
              className="h-[52px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <div className="quorum-rule flex flex-col gap-4 pt-4">
            <label className="flex min-h-[48px] cursor-pointer items-center gap-3 text-body text-ink">
              <input
                type="checkbox"
                checked={isAgDecision}
                onChange={(e) => setIsAgDecision(e.target.checked)}
                className="h-5 w-5 accent-ink"
              />
              <span>{copy.petitions.agCheckbox}</span>
            </label>

            {isAgDecision ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <label htmlFor="ag-date" className="text-meta text-ink-2">
                    {copy.petitions.agDateLabel}
                  </label>
                  <input
                    id="ag-date"
                    type="text"
                    placeholder="26 nov. 2026"
                    value={agDate}
                    onChange={(e) => setAgDate(e.target.value)}
                    className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ag-loc" className="text-meta text-ink-2">
                    {copy.petitions.agLocationLabel}
                  </label>
                  <input
                    id="ag-loc"
                    type="text"
                    placeholder="Amphi A"
                    value={agLocation}
                    onChange={(e) => setAgLocation(e.target.value)}
                    className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ag-att" className="text-meta text-ink-2">
                    {copy.petitions.agAttendeesLabel}
                  </label>
                  <input
                    id="ag-att"
                    type="number"
                    min={1}
                    placeholder="412"
                    value={agAttendees}
                    onChange={(e) => setAgAttendees(e.target.value)}
                    className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 font-mono text-body text-ink"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label htmlFor="ag-res" className="text-meta text-ink-2">
                    {copy.petitions.agResultLabel}
                  </label>
                  <input
                    id="ag-res"
                    type="text"
                    placeholder="Pour 310 / Contre 82"
                    value={agResult}
                    onChange={(e) => setAgResult(e.target.value)}
                    className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
                  />
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <label htmlFor="petition-origin" className="text-meta text-ink-2">
                  {copy.admin.fields.originDetail}
                </label>
                <input
                  id="petition-origin"
                  type="text"
                  maxLength={240}
                  value={originDetail}
                  onChange={(e) => setOriginDetail(e.target.value)}
                  className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {step === 3 && (
        <div key="step-3" className="quorum-animate-in flex flex-col gap-5">
          <div className="flex flex-col gap-3">
            <label htmlFor="petition-duration" className="text-meta font-medium">
              {copy.petitions.durationLabel}
            </label>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {copy.petitions.durationPresets.map((preset) => {
                const selected = durationHours === preset.hours;
                return (
                  <button
                    key={preset.hours}
                    type="button"
                    onClick={() => setDurationHours(preset.hours)}
                    className={
                      selected
                        ? "quorum-pressable min-h-[48px] cursor-pointer border border-ink bg-ink px-3 text-meta font-bold text-bg"
                        : "quorum-pressable min-h-[48px] cursor-pointer border border-ink bg-bg px-3 text-meta text-ink hover:bg-surface"
                    }
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>
            <input
              id="petition-duration"
              type="number"
              min={24}
              max={336}
              value={durationHours}
              onChange={(e) => setDurationHours(Number(e.target.value))}
              className="h-[48px] w-40 rounded-[2px] border border-ink bg-bg px-3 font-mono text-body text-ink"
            />
          </div>

          <section className="quorum-rule flex flex-col gap-2 pt-4 text-meta text-ink-2">
            <p className="font-bold text-ink">{question}</p>
            <p>{options.join(" · ")} · Vote blanc</p>
            <p>{copy.votes.signedBy(argumentPourAuthor)}</p>
          </section>
        </div>
      )}

      {errorMessage && (
        <p role="alert" className="text-meta font-medium text-error">
          {errorMessage}
        </p>
      )}

      <footer className="flex flex-col gap-3 pt-4">
        {step < TOTAL_STEPS - 1 ? (
          <button
            type="button"
            onClick={handleNext}
            className="quorum-pressable flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
          >
            {copy.ballot.continueCta}
          </button>
        ) : (
          <button
            type="submit"
            disabled={submitting}
            className="quorum-pressable flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
          >
            {submitting
              ? copy.petitions.submittingPetition
              : copy.petitions.submitPetition}
          </button>
        )}

        {step > 0 && (
          <button
            type="button"
            onClick={() => {
              setErrorMessage(null);
              setStep((prev) => Math.max(0, prev - 1));
            }}
            className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
          >
            {copy.auth.backLabel}
          </button>
        )}
      </footer>
    </form>
  );
}
