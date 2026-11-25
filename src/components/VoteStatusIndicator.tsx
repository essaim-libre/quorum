import { copy } from "@/copy/fr";
import type { PublishedVoteStatus } from "@/lib/votes/rules";

export function VoteStatusIndicator({
  status,
  detail,
  live = false,
}: {
  readonly status: PublishedVoteStatus;
  readonly detail: string;
  readonly live?: boolean;
}) {
  return (
    <div className="flex items-center gap-2 text-meta text-ink-2">
      {status === "open" && (
        <span
          aria-hidden="true"
          className={`inline-block h-2 w-2 shrink-0 bg-ink ${
            live ? "quorum-live-square" : ""
          }`}
        />
      )}
      {status === "upcoming" && (
        <span
          aria-hidden="true"
          className="inline-block h-2 w-2 shrink-0 border border-ink bg-bg"
        />
      )}
      <span className="font-medium text-ink">{copy.votes.status[status]}</span>
      <span aria-hidden="true">·</span>
      <span>{detail}</span>
    </div>
  );
}
