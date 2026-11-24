import { createHash } from "node:crypto";

export interface TallyOptionInput {
  readonly optionId: string;
  readonly label: string;
  readonly position: number;
  readonly isBlank: boolean;
  readonly count: number;
}

export interface TallyOptionResult extends TallyOptionInput {
  /** Pourcentage sur les suffrages exprimés (null pour le vote blanc). */
  readonly expressedPercent: number | null;
}

export type TallyOutcome =
  | { readonly kind: "no_expressed" }
  | {
      readonly kind: "winner";
      readonly option: TallyOptionResult;
    }
  | {
      readonly kind: "tie";
      readonly options: readonly TallyOptionResult[];
    };

export interface TallySummary {
  readonly totalBallots: number;
  readonly expressedCount: number;
  readonly blankCount: number;
  readonly electorateSize: number;
  readonly participationRate: number;
  readonly tokensIssued: number | null;
  readonly integrityBallotsLeqTokens: boolean;
  readonly options: readonly TallyOptionResult[];
  readonly blankOption: TallyOptionResult | null;
  readonly outcome: TallyOutcome;
}

/**
 * Calcule le dépouillement selon les règles du cahier §2.2 et §6.6 :
 * - Suffrages exprimés = bulletins hors blancs.
 * - Pourcentages calculés sur les suffrages exprimés uniquement.
 * - Blancs comptés et affichés à part, en nombre.
 * - Gagnant / Égalité / Aucun suffrage exprimé.
 */
export function computeTally(params: {
  readonly rows: readonly TallyOptionInput[];
  readonly electorateSize: number;
  readonly tokensIssued: number | null;
}): TallySummary {
  const sorted = [...params.rows].sort((a, b) => a.position - b.position);

  let totalBallots = 0;
  let blankCount = 0;

  for (const row of sorted) {
    totalBallots += row.count;
    if (row.isBlank) {
      blankCount += row.count;
    }
  }

  const expressedCount = totalBallots - blankCount;

  const nonBlankOptions: TallyOptionResult[] = [];
  let blankOption: TallyOptionResult | null = null;

  for (const row of sorted) {
    if (row.isBlank) {
      blankOption = {
        ...row,
        expressedPercent: null,
      };
    } else {
      const pct = expressedCount > 0 ? (row.count / expressedCount) * 100 : 0;
      nonBlankOptions.push({
        ...row,
        expressedPercent: Math.round(pct * 10) / 10,
      });
    }
  }

  let outcome: TallyOutcome;
  if (expressedCount === 0) {
    outcome = { kind: "no_expressed" };
  } else {
    let maxVotes = -1;
    for (const opt of nonBlankOptions) {
      if (opt.count > maxVotes) {
        maxVotes = opt.count;
      }
    }
    const leaders = nonBlankOptions.filter((opt) => opt.count === maxVotes);
    if (leaders.length === 1 && leaders[0]) {
      outcome = { kind: "winner", option: leaders[0] };
    } else {
      outcome = { kind: "tie", options: leaders };
    }
  }

  const participationRate =
    params.electorateSize > 0 ? totalBallots / params.electorateSize : 0;

  const integrityBallotsLeqTokens =
    params.tokensIssued === null ? true : totalBallots <= params.tokensIssued;

  return {
    totalBallots,
    expressedCount,
    blankCount,
    electorateSize: params.electorateSize,
    participationRate,
    tokensIssued: params.tokensIssued,
    integrityBallotsLeqTokens,
    options: nonBlankOptions,
    blankOption,
    outcome,
  };
}

export function formatOutcomeHeadline(outcome: TallyOutcome): string {
  if (outcome.kind === "no_expressed") {
    return "Aucun suffrage exprimé";
  }
  if (outcome.kind === "winner") {
    return outcome.option.label;
  }
  const labels = outcome.options.map((o) => o.label);
  if (labels.length === 2) {
    return `Égalité entre ${labels[0]} et ${labels[1]}`;
  }
  const last = labels[labels.length - 1] ?? "";
  const head = labels.slice(0, -1).join(", ");
  return `Égalité entre ${head} et ${last}`;
}

/**
 * Empreinte SHA-256 de la liste triée des reçus publics (§6.6).
 */
export function computeReceiptsListHash(sortedReceipts: readonly string[]): string {
  const hash = createHash("sha256");
  hash.update(sortedReceipts.join("\n"), "utf8");
  return hash.digest("hex");
}
