"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { copy, getErrorMessage } from "@/copy/fr";
import { formatShortDateTimeParis } from "@/lib/dates";
import type { AdminVoteSummary } from "@/lib/votes/service";

interface DraftFormState {
  question: string;
  options: string[];
  statusNote: string;
  originDetail: string;
  argumentPour: string;
  argumentPourAuthor: string;
  argumentContre: string;
  argumentContreAuthor: string;
  facts: string;
}

function emptyDraftForm(): DraftFormState {
  return {
    question: "",
    options: ["Pour", "Contre"],
    statusNote: "Consultatif",
    originDetail: "",
    argumentPour: "",
    argumentPourAuthor: "",
    argumentContre: "",
    argumentContreAuthor: "",
    facts: "",
  };
}

function draftFormFromVote(vote: AdminVoteSummary): DraftFormState {
  const regularOptions = vote.options
    .filter((o) => !o.isBlank)
    .map((o) => o.label);
  return {
    question: vote.question,
    options: regularOptions.length >= 2 ? regularOptions : ["Pour", "Contre"],
    statusNote: vote.statusNote,
    originDetail: vote.originDetail ?? "",
    argumentPour: vote.argumentPour,
    argumentPourAuthor: vote.argumentPourAuthor,
    argumentContre: vote.argumentContre ?? "",
    argumentContreAuthor: vote.argumentContreAuthor ?? "",
    facts: vote.facts ?? "",
  };
}

export function AdminVotesManager({
  initialVotes,
}: {
  readonly initialVotes: readonly AdminVoteSummary[];
}) {
  const router = useRouter();
  const [form, setForm] = useState<DraftFormState>(() => emptyDraftForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [publishDurations, setPublishDurations] = useState<
    Record<string, string>
  >({});
  const [publishOpensAt, setPublishOpensAt] = useState<Record<string, string>>(
    {},
  );
  const [cancelReasons, setCancelReasons] = useState<Record<string, string>>(
    {},
  );
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  function updateOption(index: number, value: string) {
    setForm((prev) => {
      const next = [...prev.options];
      next[index] = value;
      return { ...prev, options: next };
    });
  }

  function addOption() {
    setForm((prev) =>
      prev.options.length < 4
        ? { ...prev, options: [...prev.options, ""] }
        : prev,
    );
  }

  function removeOption(index: number) {
    setForm((prev) =>
      prev.options.length > 2
        ? { ...prev, options: prev.options.filter((_, i) => i !== index) }
        : prev,
    );
  }

  async function handleSubmitDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setFeedbackMessage(null);
    setBusyId(editingId ?? "create");

    const payload = {
      question: form.question.trim(),
      options: form.options.map((o) => o.trim()).filter((o) => o.length > 0),
      statusNote: form.statusNote.trim(),
      originDetail: form.originDetail.trim() || null,
      argumentPour: form.argumentPour.trim(),
      argumentPourAuthor: form.argumentPourAuthor.trim(),
      argumentContre: form.argumentContre.trim() || null,
      argumentContreAuthor: form.argumentContreAuthor.trim() || null,
      facts: form.facts.trim() || null,
    };

    try {
      const url = editingId
        ? `/api/admin/votes/${editingId}`
        : "/api/admin/votes";
      const method = editingId ? "PATCH" : "POST";

      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }

      setFeedbackMessage(
        editingId ? copy.admin.feedback.updated : copy.admin.feedback.created,
      );
      setEditingId(null);
      setForm(emptyDraftForm());
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setBusyId(null);
    }
  }

  async function handlePublish(voteId: string) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    setBusyId(`publish:${voteId}`);

    const rawHours = Number(publishDurations[voteId] ?? "72");
    const rawOpens = publishOpensAt[voteId]?.trim();
    const body: { durationHours?: number; opensAt?: string } = {};
    if (Number.isFinite(rawHours) && rawHours > 0) {
      body.durationHours = Math.trunc(rawHours);
    }
    if (rawOpens) {
      const parsedDate = new Date(rawOpens);
      if (!Number.isNaN(parsedDate.getTime())) {
        body.opensAt = parsedDate.toISOString();
      }
    }

    try {
      const response = await fetch(`/api/admin/votes/${voteId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }

      setFeedbackMessage(copy.admin.feedback.published);
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setBusyId(null);
    }
  }

  async function handleCancel(voteId: string) {
    setErrorMessage(null);
    setFeedbackMessage(null);
    const reason = (cancelReasons[voteId] ?? "").trim();
    if (reason.length < 5) {
      setErrorMessage(copy.errors.invalid_request);
      return;
    }

    setBusyId(`cancel:${voteId}`);
    try {
      const response = await fetch(`/api/admin/votes/${voteId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const data = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;

      if (!response.ok) {
        setErrorMessage(getErrorMessage(data?.error));
        return;
      }

      setCancelReasons((prev) => ({ ...prev, [voteId]: "" }));
      setFeedbackMessage(copy.admin.feedback.cancelled);
      router.refresh();
    } catch {
      setErrorMessage(copy.errors.network_error);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-10">
      {feedbackMessage && (
        <p role="status" className="border border-ink p-4 text-meta text-ink">
          {feedbackMessage}
        </p>
      )}

      {errorMessage && (
        <p
          role="alert"
          className="border border-error p-4 text-meta font-medium text-error"
        >
          {errorMessage}
        </p>
      )}

      <section className="quorum-section-rule pt-6">
        <h2 className="text-heading font-bold text-ink">
          {editingId ? copy.admin.actions.editDraft : copy.admin.createSection}
        </h2>

        <form onSubmit={handleSubmitDraft} className="mt-6 flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <label htmlFor="admin-question" className="text-meta font-medium">
              {copy.admin.fields.question}
            </label>
            <input
              id="admin-question"
              type="text"
              maxLength={140}
              required
              value={form.question}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, question: e.target.value }))
              }
              className="h-[52px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <fieldset className="flex flex-col gap-3">
            <legend className="text-meta font-medium">
              {copy.admin.fields.options}
            </legend>
            {form.options.map((opt, index) => (
              <div key={index} className="flex gap-2">
                <input
                  type="text"
                  maxLength={80}
                  required
                  aria-label={`Option ${index + 1}`}
                  value={opt}
                  onChange={(e) => updateOption(index, e.target.value)}
                  className="h-[48px] flex-1 rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
                />
                {form.options.length > 2 && (
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="min-h-[48px] cursor-pointer px-3 text-meta text-ink-2 underline underline-offset-4"
                  >
                    {copy.admin.fields.removeOption}
                  </button>
                )}
              </div>
            ))}
            {form.options.length < 4 && (
              <div>
                <button
                  type="button"
                  onClick={addOption}
                  className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink underline underline-offset-4"
                >
                  {copy.admin.fields.addOption}
                </button>
              </div>
            )}
          </fieldset>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-status" className="text-meta font-medium">
              {copy.admin.fields.statusNote}
            </label>
            <input
              id="admin-status"
              type="text"
              maxLength={240}
              required
              value={form.statusNote}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, statusNote: e.target.value }))
              }
              className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-origin" className="text-meta font-medium">
              {copy.admin.fields.originDetail}
            </label>
            <input
              id="admin-origin"
              type="text"
              maxLength={240}
              value={form.originDetail}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, originDetail: e.target.value }))
              }
              className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-pour" className="text-meta font-medium">
              {copy.admin.fields.argumentPour}
            </label>
            <textarea
              id="admin-pour"
              rows={3}
              maxLength={600}
              required
              value={form.argumentPour}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, argumentPour: e.target.value }))
              }
              className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="admin-pour-author"
              className="text-meta font-medium"
            >
              {copy.admin.fields.argumentPourAuthor}
            </label>
            <input
              id="admin-pour-author"
              type="text"
              maxLength={120}
              required
              value={form.argumentPourAuthor}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  argumentPourAuthor: e.target.value,
                }))
              }
              className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-contre" className="text-meta font-medium">
              {copy.admin.fields.argumentContre}
            </label>
            <textarea
              id="admin-contre"
              rows={3}
              maxLength={600}
              value={form.argumentContre}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, argumentContre: e.target.value }))
              }
              className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label
              htmlFor="admin-contre-author"
              className="text-meta font-medium"
            >
              {copy.admin.fields.argumentContreAuthor}
            </label>
            <input
              id="admin-contre-author"
              type="text"
              maxLength={120}
              value={form.argumentContreAuthor}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  argumentContreAuthor: e.target.value,
                }))
              }
              className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label htmlFor="admin-facts" className="text-meta font-medium">
              {copy.admin.fields.facts}
            </label>
            <textarea
              id="admin-facts"
              rows={3}
              maxLength={2000}
              value={form.facts}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, facts: e.target.value }))
              }
              className="rounded-[2px] border border-ink bg-bg p-3 text-body text-ink"
            />
          </div>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="submit"
              disabled={busyId !== null}
              className="flex h-[52px] w-full cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg disabled:opacity-60"
            >
              {busyId === "create" || busyId === editingId
                ? copy.admin.actions.creating
                : editingId
                  ? copy.admin.actions.saveDraft
                  : copy.admin.actions.createDraft}
            </button>

            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyDraftForm());
                }}
                className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink-2 underline underline-offset-4"
              >
                {copy.admin.actions.cancelEdit}
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="quorum-section-rule pt-6">
        <div className="flex items-baseline justify-between">
          <h2 className="text-heading font-bold text-ink">
            {copy.admin.listSection}
          </h2>
          <Link
            href="/journal"
            className="inline-flex min-h-[48px] items-center text-meta text-ink underline underline-offset-4"
          >
            {copy.admin.journalLink}
          </Link>
        </div>

        {initialVotes.length === 0 ? (
          <p className="quorum-rule mt-4 py-6 text-body text-ink-2">
            {copy.admin.emptyList}
          </p>
        ) : (
          <div className="mt-4">
            {initialVotes.map((vote) => (
              <article
                key={vote.id}
                className="quorum-rule flex flex-col gap-4 py-6"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-mono-xs font-bold uppercase text-ink">
                    {copy.admin.states[vote.state]}
                  </span>
                  <span className="text-mono-xs text-ink-2">{vote.slug}</span>
                </div>

                <h3 className="text-question-list font-bold text-ink">
                  {vote.question}
                </h3>

                <p className="text-meta text-ink-2">
                  {vote.options.map((o) => o.label).join(" · ")}
                </p>

                {vote.opensAt && vote.closesAt && (
                  <p className="text-mono-xs text-ink-2">
                    {formatShortDateTimeParis(vote.opensAt)} →{" "}
                    {formatShortDateTimeParis(vote.closesAt)}
                  </p>
                )}

                {vote.keyFingerprint && (
                  <p className="text-mono-xs break-all text-ink-2">
                    Clé : {vote.keyFingerprint}
                  </p>
                )}

                {vote.cancelReason && (
                  <p className="text-meta text-ink-2">
                    Motif d’annulation : {vote.cancelReason}
                  </p>
                )}

                {vote.state === "draft" && (
                  <div className="flex flex-col gap-4 border-t border-rule pt-4">
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`dur-${vote.id}`}
                          className="text-meta text-ink-2"
                        >
                          {copy.admin.fields.durationHours}
                        </label>
                        <input
                          id={`dur-${vote.id}`}
                          type="number"
                          min={24}
                          max={336}
                          value={publishDurations[vote.id] ?? "72"}
                          onChange={(e) =>
                            setPublishDurations((prev) => ({
                              ...prev,
                              [vote.id]: e.target.value,
                            }))
                          }
                          className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 font-mono text-meta text-ink"
                        />
                      </div>

                      <div className="flex flex-col gap-1">
                        <label
                          htmlFor={`open-${vote.id}`}
                          className="text-meta text-ink-2"
                        >
                          {copy.admin.fields.opensAtOptional}
                        </label>
                        <input
                          id={`open-${vote.id}`}
                          type="datetime-local"
                          value={publishOpensAt[vote.id] ?? ""}
                          onChange={(e) =>
                            setPublishOpensAt((prev) => ({
                              ...prev,
                              [vote.id]: e.target.value,
                            }))
                          }
                          className="h-[48px] rounded-[2px] border border-ink bg-bg px-3 font-mono text-meta text-ink"
                        />
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handlePublish(vote.id)}
                        className="flex h-[52px] cursor-pointer items-center justify-start rounded-[2px] bg-ink px-4 text-left text-meta font-medium text-bg disabled:opacity-60"
                      >
                        {busyId === `publish:${vote.id}`
                          ? copy.admin.actions.publishing
                          : copy.admin.actions.publish}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(vote.id);
                          setForm(draftFormFromVote(vote));
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                        className="inline-flex min-h-[48px] cursor-pointer items-center text-meta text-ink underline underline-offset-4"
                      >
                        {copy.admin.actions.editDraft}
                      </button>
                    </div>
                  </div>
                )}

                {vote.state === "published" && (
                  <div className="flex flex-col gap-3 border-t border-rule pt-4">
                    <Link
                      href={`/votes/${vote.slug}`}
                      className="inline-flex min-h-[48px] items-center text-meta font-medium text-ink underline underline-offset-4"
                    >
                      {copy.admin.actions.openPublicPage}
                    </Link>

                    <div className="flex flex-col gap-2 sm:flex-row">
                      <input
                        type="text"
                        placeholder={copy.admin.fields.cancelReason}
                        aria-label={copy.admin.fields.cancelReason}
                        value={cancelReasons[vote.id] ?? ""}
                        onChange={(e) =>
                          setCancelReasons((prev) => ({
                            ...prev,
                            [vote.id]: e.target.value,
                          }))
                        }
                        className="h-[48px] flex-1 rounded-[2px] border border-ink bg-bg px-3 text-meta text-ink"
                      />
                      <button
                        type="button"
                        disabled={busyId !== null}
                        onClick={() => handleCancel(vote.id)}
                        className="inline-flex min-h-[48px] cursor-pointer items-center border border-ink px-4 text-meta font-medium text-ink disabled:opacity-60"
                      >
                        {busyId === `cancel:${vote.id}`
                          ? copy.admin.actions.cancelling
                          : copy.admin.actions.cancelVote}
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
