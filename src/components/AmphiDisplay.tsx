"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ParticipationBar } from "@/components/ParticipationBar";
import { VoteStatusIndicator } from "@/components/VoteStatusIndicator";
import { copy } from "@/copy/fr";
import {
  formatDateTimeParis,
  formatNumberFr,
  formatPercentFr,
} from "@/lib/dates";
import type { PublishedVoteStatus } from "@/lib/votes/rules";

const POLL_INTERVAL_MS = 10_000;

interface ParticipationState {
  readonly ballots: number;
  readonly electorateSize: number;
  readonly rate: number;
}

function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const hh = String(hours).padStart(2, "0");
  const mm = String(minutes).padStart(2, "0");
  const ss = String(seconds).padStart(2, "0");

  if (days > 0) {
    return `${days} j ${hh}:${mm}:${ss}`;
  }
  return `${hh}:${mm}:${ss}`;
}

function formatParisTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

function deriveStatus(
  nowMs: number,
  opensMs: number,
  closesMs: number,
): PublishedVoteStatus {
  if (nowMs < opensMs) {
    return "upcoming";
  }
  if (nowMs >= closesMs) {
    return "closed";
  }
  return "open";
}

export function AmphiDisplay({
  slug,
  question,
  originDetail,
  statusNote,
  opensAt,
  closesAt,
  serverNow,
  keyFingerprint,
  initialParticipation,
  voteUrl,
  qrViewBoxSize,
  qrPathData,
}: {
  readonly slug: string;
  readonly question: string;
  readonly originDetail: string | null;
  readonly statusNote: string;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly serverNow: string;
  readonly keyFingerprint: string;
  readonly initialParticipation: ParticipationState;
  readonly voteUrl: string;
  readonly qrViewBoxSize: number;
  readonly qrPathData: string;
}) {
  const opensMs = useMemo(() => new Date(opensAt).getTime(), [opensAt]);
  const closesMs = useMemo(() => new Date(closesAt).getTime(), [closesAt]);
  const serverNowMs = useMemo(() => new Date(serverNow).getTime(), [serverNow]);

  // Synchronise l'horloge locale sur l'heure serveur (base) pour un compte à rebours fiable
  const [clockOffsetMs] = useState<number>(() => serverNowMs - Date.now());
  const [nowMs, setNowMs] = useState<number>(serverNowMs);
  const [participation, setParticipation] =
    useState<ParticipationState>(initialParticipation);
  const [lastUpdatedLabel, setLastUpdatedLabel] = useState<string>(() =>
    formatParisTime(new Date(serverNowMs)),
  );

  const status = deriveStatus(nowMs, opensMs, closesMs);

  // Compte à rebours chaque seconde tant que le scrutin n'est pas clos
  useEffect(() => {
    if (status === "closed") {
      return;
    }
    const timer = window.setInterval(() => {
      setNowMs(Date.now() + clockOffsetMs);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [clockOffsetMs, status]);

  // Rafraîchissement automatique de la participation toutes les 10 s (§9)
  useEffect(() => {
    if (status === "closed") {
      return;
    }

    let cancelled = false;

    async function fetchParticipation() {
      try {
        const response = await fetch(`/api/votes/${slug}/participation`, {
          cache: "no-store",
        });
        if (!response.ok || cancelled) {
          return;
        }
        const data = (await response.json()) as Partial<ParticipationState>;
        if (
          !cancelled &&
          typeof data.ballots === "number" &&
          typeof data.electorateSize === "number" &&
          typeof data.rate === "number"
        ) {
          setParticipation({
            ballots: data.ballots,
            electorateSize: data.electorateSize,
            rate: data.rate,
          });
          setLastUpdatedLabel(formatParisTime(new Date(Date.now() + clockOffsetMs)));
        }
      } catch {
        // Garde le dernier compteur affiché en cas de coupure réseau temporaire
      }
    }

    const interval = window.setInterval(() => {
      void fetchParticipation();
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [slug, status, clockOffsetMs]);

  const targetMs = status === "upcoming" ? opensMs : closesMs;
  const remainingMs = Math.max(0, targetMs - nowMs);
  const countdownText = formatCountdown(remainingMs);
  const formattedBallots = formatNumberFr(participation.ballots);
  const formattedElectorate = formatNumberFr(participation.electorateSize);
  const formattedRate = formatPercentFr(participation.rate);

  const statusDetail =
    status === "upcoming"
      ? copy.amphi.opensLabel(formatDateTimeParis(opensAt))
      : copy.amphi.deadlineLabel(formatDateTimeParis(closesAt));

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[1200px] flex-col justify-between px-5 py-6 sm:px-8 sm:py-8">
      <header className="flex flex-wrap items-baseline justify-between gap-4 border-b border-rule pb-4">
        <div className="flex flex-wrap items-baseline gap-4">
          <span className="text-xl font-bold tracking-tight text-ink">
            {copy.app.name}
          </span>
          <span className="text-mono-xs uppercase text-ink-2">
            {copy.amphi.modeLabel}
          </span>
          <span className="text-mono-xs text-ink-2">{copy.app.institution}</span>
        </div>

        <Link
          href={`/votes/${slug}`}
          className="inline-flex min-h-[48px] items-center text-meta text-ink-2 underline underline-offset-4 hover:text-ink"
        >
          {copy.amphi.backToVote}
        </Link>
      </header>

      <div className="my-auto grid grid-cols-1 gap-10 py-8 lg:grid-cols-[1fr_320px] lg:items-start lg:gap-12">
        <section className="flex flex-col gap-8">
          <div className="flex flex-col gap-3">
            <VoteStatusIndicator status={status} detail={statusDetail} />
            <h1 className="text-question-detail font-bold text-ink lg:text-[3rem] lg:leading-[3.25rem]">
              {question}
            </h1>
            {originDetail && (
              <p className="text-body text-ink-2">{originDetail}</p>
            )}
            <p className="text-meta text-ink-2">
              {copy.results.statusPrefix} {statusNote}
            </p>
          </div>

          <div className="quorum-section-rule grid grid-cols-1 gap-8 pt-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-mono-xs uppercase text-ink-2">
                {copy.amphi.participationLabel}
              </p>
              <p
                data-testid="amphi-ballots-count"
                className="text-display font-bold text-ink"
              >
                {formattedBallots}
              </p>
              <p className="text-body text-ink-2">
                {copy.amphi.votersCountLabel(formattedElectorate, formattedRate)}
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:border-l sm:border-rule sm:pl-6">
              {status === "closed" ? (
                <>
                  <p className="text-mono-xs uppercase text-ink-2">
                    {copy.amphi.closedHeadline}
                  </p>
                  <p className="text-body text-ink">{copy.amphi.closedNotice}</p>
                  <div className="pt-2">
                    <Link
                      href={`/votes/${slug}/resultats`}
                      className="flex h-[52px] w-full items-center justify-start rounded-[2px] bg-ink px-4 text-left text-body font-medium text-bg"
                    >
                      {copy.amphi.seeResultsCta}
                    </Link>
                  </div>
                </>
              ) : (
                <>
                  <p className="text-mono-xs uppercase text-ink-2">
                    {status === "upcoming"
                      ? copy.amphi.countdownUpcomingLabel
                      : copy.amphi.countdownOpenLabel}
                  </p>
                  <p
                    data-testid="amphi-countdown"
                    className="font-mono text-question-detail font-bold text-ink"
                  >
                    {countdownText}
                  </p>
                  <p className="text-mono-xs text-ink-2">
                    {copy.amphi.refreshNote}
                  </p>
                </>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <ParticipationBar
              ballots={participation.ballots}
              electorateSize={participation.electorateSize}
              rate={participation.rate}
            />
            {status !== "closed" && (
              <p className="text-meta text-ink-2">
                {copy.amphi.noPartialResultsNotice}
              </p>
            )}
          </div>
        </section>

        <aside className="quorum-section-rule flex flex-col gap-4 pt-6 lg:border-t-0 lg:border-l lg:border-ink lg:pt-0 lg:pl-8">
          <h2 className="text-mono-xs font-bold uppercase tracking-wider text-ink">
            {copy.amphi.scanTitle}
          </h2>

          {/* Fond blanc fixe (#FFFFFF) et modules noirs (#0A0A0A) pour garantir le scan même en mode sombre */}
          <div className="inline-block w-full max-w-[260px] border border-ink bg-[#FFFFFF] p-2">
            <svg
              role="img"
              aria-label={copy.amphi.qrAlt(question)}
              viewBox={`0 0 ${qrViewBoxSize} ${qrViewBoxSize}`}
              shapeRendering="crispEdges"
              className="block h-auto w-full"
            >
              <rect
                width={qrViewBoxSize}
                height={qrViewBoxSize}
                fill="#FFFFFF"
              />
              <path d={qrPathData} fill="#0A0A0A" />
            </svg>
          </div>

          <p className="text-meta text-ink-2">{copy.amphi.scanInstruction}</p>
          <p className="font-mono text-meta break-all text-ink">{voteUrl}</p>
        </aside>
      </div>

      <footer className="flex flex-wrap items-baseline justify-between gap-4 border-t border-rule pt-4 text-mono-xs text-ink-2">
        <span className="break-all">
          {copy.amphi.keyLabel} : {keyFingerprint}
        </span>
        <span>{copy.amphi.lastUpdated(lastUpdatedLabel)}</span>
      </footer>
    </main>
  );
}
