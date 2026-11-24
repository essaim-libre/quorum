import { copy } from "@/copy/fr";
import { formatNumberFr, formatPercentFr } from "@/lib/dates";

export function ParticipationBar({
  ballots,
  electorateSize,
  rate,
}: {
  readonly ballots: number;
  readonly electorateSize: number;
  readonly rate: number;
}) {
  const clampedPercent = Math.max(0, Math.min(100, rate * 100));
  const summary = copy.votes.participationSummary(
    formatNumberFr(ballots),
    formatNumberFr(electorateSize),
    formatPercentFr(rate),
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-label={summary}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(clampedPercent * 10) / 10}
        className="relative h-[2px] w-full bg-rule"
      >
        <div
          className="h-[2px] bg-ink"
          style={{ width: `${clampedPercent}%` }}
        />
      </div>
      <p className="text-right text-mono-xs text-ink-2">{summary}</p>
    </div>
  );
}
