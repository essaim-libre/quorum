"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { copy, getErrorMessage } from "@/copy/fr";
import { formatShortDateTimeParis } from "@/lib/dates";
import {
  PETITION_REJECT_REASON_CODES,
  PETITION_REJECT_REASON_LABELS,
  type PetitionRejectReasonCode,
} from "@/lib/petitions/rules";
import type { AdminPetitionItem } from "@/lib/petitions/service";

export function AdminPetitionQueue({
  petitions,
}: {
  readonly petitions: readonly AdminPetitionItem[];
}) {
  const router = useRouter();
  const [factsById, setFactsById] = useState<Record<string, string>>({});
  const [rewordingById, setRewordingById] = useState<Record<string, string>>(
    {},
  );
  const [rejectCodeById, setRejectCodeById] = useState<
    Record<string, PetitionRejectReasonCode>
  >({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitDecision(
    petitionId: string,
    payload: Record<string, unknown>,
  ) {
    setErrorMessage(null);
    setBusyId(petitionId);
    try {
      const res = await fetch(`/api/admin/petitions/${petitionId}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
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
      setBusyId(null);
    }
  }

  return (
    <section className="quorum-section-rule mb-10 pt-6">
      <h2 className="text-heading font-bold text-ink">
        {copy.petitions.adminQueueTitle}
      </h2>

      {errorMessage && (
        <p
          role="alert"
          className="mt-4 border border-error p-3 text-meta text-error"
        >
          {errorMessage}
        </p>
      )}

      {petitions.length === 0 ? (
        <p className="quorum-rule mt-4 py-6 text-body text-ink-2">
          {copy.petitions.adminQueueEmpty}
        </p>
      ) : (
        <div className="mt-4">
          {petitions.map((p) => {
            const rejectCode =
              rejectCodeById[p.id] ?? "charter_non_compliant";
            return (
              <article
                key={p.id}
                className="quorum-rule flex flex-col gap-4 py-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 text-mono-xs text-ink-2">
                  <span className="font-bold uppercase text-ink">
                    {copy.petitions.states[p.state]}
                  </span>
                  <span>
                    {p.signaturesCount} / {p.threshold} signatures
                    {p.reviewDeadline
                      ? ` · Auto-pub. ${formatShortDateTimeParis(p.reviewDeadline)}`
                      : ""}
                  </span>
                </div>

                <h3 className="text-question-list font-bold text-ink">
                  {p.question}
                </h3>
                <p className="text-meta text-ink-2">
                  Options : {p.options.join(" · ")} · Vote blanc
                </p>
                <p className="text-meta text-ink">
                  Pour ({p.argumentPourAuthor}) : {p.argumentPour}
                </p>
                {p.topContre && (
                  <p className="text-meta text-ink-2">
                    Contre retenu ({p.topContre.authorLabel},{" "}
                    {p.topContre.supports} soutiens) : {p.topContre.text}
                  </p>
                )}

                {p.state === "in_review" && (
                  <div className="flex flex-col gap-4 border-t border-rule pt-4">
                    <div className="flex flex-col gap-2">
                      <label
                        htmlFor={`facts-${p.id}`}
                        className="text-meta text-ink-2"
                      >
                        {copy.admin.fields.facts}
                      </label>
                      <textarea
                        id={`facts-${p.id}`}
                        rows={2}
                        value={factsById[p.id] ?? ""}
                        onChange={(e) =>
                          setFactsById((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        className="rounded-[2px] border border-ink bg-bg p-2 text-meta text-ink"
                      />
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() =>
                          submitDecision(p.id, {
                            decision: "approve",
                            facts: factsById[p.id]?.trim() || null,
                          })
                        }
                        className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-meta font-medium text-bg disabled:opacity-60"
                      >
                        {copy.petitions.adminApprove}
                      </button>
                    </div>

                    <div className="flex flex-col gap-2 border-t border-rule pt-3 sm:flex-row">
                      <input
                        type="text"
                        maxLength={140}
                        placeholder="Reformulation conforme à la charte"
                        aria-label="Reformulation proposée"
                        value={rewordingById[p.id] ?? ""}
                        onChange={(e) =>
                          setRewordingById((prev) => ({
                            ...prev,
                            [p.id]: e.target.value,
                          }))
                        }
                        className="h-[48px] flex-1 rounded-[2px] border border-ink bg-bg px-3 text-meta text-ink"
                      />
                      <button
                        type="button"
                        disabled={
                          busyId !== null ||
                          (rewordingById[p.id]?.trim().length ?? 0) < 5
                        }
                        onClick={() =>
                          submitDecision(p.id, {
                            decision: "request_changes",
                            proposedRewording: rewordingById[p.id]?.trim(),
                          })
                        }
                        className="min-h-[48px] cursor-pointer border border-ink px-4 text-meta text-ink disabled:opacity-40"
                      >
                        {copy.petitions.adminRequestChanges}
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 border-t border-rule pt-3 sm:flex-row">
                  <select
                    aria-label="Motif de rejet"
                    value={rejectCode}
                    onChange={(e) =>
                      setRejectCodeById((prev) => ({
                        ...prev,
                        [p.id]: e.target.value as PetitionRejectReasonCode,
                      }))
                    }
                    className="h-[48px] flex-1 rounded-[2px] border border-ink bg-bg px-3 text-meta text-ink"
                  >
                    {PETITION_REJECT_REASON_CODES.map((code) => (
                      <option key={code} value={code}>
                        {PETITION_REJECT_REASON_LABELS[code]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    onClick={() =>
                      submitDecision(p.id, {
                        decision: "reject",
                        rejectReason: rejectCode,
                      })
                    }
                    className="min-h-[48px] cursor-pointer border border-ink px-4 text-meta text-ink disabled:opacity-60"
                  >
                    {copy.petitions.adminReject}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
