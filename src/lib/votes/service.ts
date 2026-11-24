import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gt, inArray, lte, sql } from "drizzle-orm";
import { generateVoteKeyPair } from "@/lib/crypto/vote-keys";
import type { Database } from "@/lib/db/client";
import {
  ballots,
  emargement,
  voteOptions,
  voteReceipts,
  votes,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { recordAdminAction } from "@/lib/journal";
import { log } from "@/lib/log";
import {
  buildVoteOptionsWithBlank,
  type CancelVoteInput,
  classifyPublishedVote,
  computeParticipationRate,
  type CreateVoteDraftInput,
  type PublishedVoteStatus,
  type PublishVoteInput,
  slugifyQuestion,
  type UpdateVoteDraftInput,
  VOTE_DEFAULT_DURATION_HOURS,
  VOTE_MAX_DURATION_MS,
  VOTE_MIN_DURATION_MS,
  type VoteListView,
} from "@/lib/votes/rules";

export interface PublicVoteOption {
  readonly id: string;
  readonly label: string;
  readonly position: number;
  readonly isBlank: boolean;
}

export interface ParticipationSummary {
  readonly ballots: number;
  readonly electorateSize: number;
  readonly rate: number;
}

export interface PublicVoteListItem {
  readonly id: string;
  readonly slug: string;
  readonly question: string;
  readonly origin: "admin" | "petition";
  readonly originDetail: string | null;
  readonly statusNote: string;
  readonly status: PublishedVoteStatus;
  readonly opensAt: string;
  readonly closesAt: string;
  readonly participation: ParticipationSummary;
}

export interface PublicVoteDetail extends PublicVoteListItem {
  readonly argumentPour: string;
  readonly argumentPourAuthor: string;
  readonly argumentContre: string | null;
  readonly argumentContreAuthor: string | null;
  readonly facts: string | null;
  readonly publicKeySpkiBase64: string;
  readonly keyFingerprint: string;
  readonly options: readonly PublicVoteOption[];
}

export interface AdminVoteSummary {
  readonly id: string;
  readonly slug: string;
  readonly question: string;
  readonly origin: "admin" | "petition";
  readonly originDetail: string | null;
  readonly statusNote: string;
  readonly argumentPour: string;
  readonly argumentPourAuthor: string;
  readonly argumentContre: string | null;
  readonly argumentContreAuthor: string | null;
  readonly facts: string | null;
  readonly state: "draft" | "published" | "cancelled";
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly keyFingerprint: string | null;
  readonly cancelReason: string | null;
  readonly options: readonly PublicVoteOption[];
  readonly participation: ParticipationSummary;
}

export type VoteMutationResult<T> =
  | { readonly ok: true; readonly data: T }
  | {
      readonly ok: false;
      readonly error:
        | "not_found"
        | "vote_immutable"
        | "invalid_duration"
        | "invalid_options"
        | "vote_not_cancellable"
        | "vote_already_closed";
    };

async function getDatabaseNow(
  executor: Pick<Database, "execute">,
): Promise<Date> {
  const res = await executor.execute(sql`SELECT now() AS db_now`);
  const row = res.rows[0] as { db_now?: string | Date } | undefined;
  if (!row?.db_now) {
    return new Date();
  }
  return row.db_now instanceof Date ? row.db_now : new Date(row.db_now);
}

async function generateUniqueSlug(
  tx: Pick<Database, "select">,
  question: string,
): Promise<string> {
  const base = slugifyQuestion(question);
  const existing = await tx
    .select({ id: votes.id })
    .from(votes)
    .where(eq(votes.slug, base))
    .limit(1);

  if (existing.length === 0) {
    return base;
  }

  for (let attempt = 0; attempt < 10; attempt += 1) {
    const candidate = `${base}-${randomBytes(3).toString("hex")}`;
    const conflict = await tx
      .select({ id: votes.id })
      .from(votes)
      .where(eq(votes.slug, candidate))
      .limit(1);
    if (conflict.length === 0) {
      return candidate;
    }
  }

  return `${base}-${randomBytes(6).toString("hex")}`;
}

/**
 * Compte uniquement le total de bulletins déposés par vote (jamais par option : invariant n°5).
 */
async function countBallotsByVoteIds(
  db: Database,
  voteIds: readonly string[],
): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (voteIds.length === 0) {
    return counts;
  }

  const rows = await db
    .select({
      voteId: ballots.voteId,
      total: sql<number>`count(*)::int`,
    })
    .from(ballots)
    .where(inArray(ballots.voteId, [...voteIds]))
    .groupBy(ballots.voteId);

  for (const row of rows) {
    counts.set(row.voteId, Number(row.total));
  }
  return counts;
}

export async function listPublishedVotes(
  db: Database,
  view: VoteListView,
): Promise<{ readonly serverNow: string; readonly votes: PublicVoteListItem[] }> {
  const dbNow = await getDatabaseNow(db);
  const electorateSize = getEnv().ELECTORATE_SIZE;

  const condition =
    view === "open"
      ? and(
          eq(votes.state, "published"),
          lte(votes.opensAt, sql`now()`),
          gt(votes.closesAt, sql`now()`),
        )
      : view === "upcoming"
        ? and(eq(votes.state, "published"), gt(votes.opensAt, sql`now()`))
        : and(eq(votes.state, "published"), lte(votes.closesAt, sql`now()`));

  const orderBy =
    view === "open"
      ? asc(votes.closesAt)
      : view === "upcoming"
        ? asc(votes.opensAt)
        : desc(votes.closesAt);

  const rows = await db
    .select({
      id: votes.id,
      slug: votes.slug,
      question: votes.question,
      origin: votes.origin,
      originDetail: votes.originDetail,
      statusNote: votes.statusNote,
      opensAt: votes.opensAt,
      closesAt: votes.closesAt,
    })
    .from(votes)
    .where(condition)
    .orderBy(orderBy);

  const ballotCounts = await countBallotsByVoteIds(
    db,
    rows.map((r) => r.id),
  );

  const items: PublicVoteListItem[] = [];
  for (const row of rows) {
    if (!row.opensAt || !row.closesAt) {
      continue;
    }
    const count = ballotCounts.get(row.id) ?? 0;
    items.push({
      id: row.id,
      slug: row.slug,
      question: row.question,
      origin: row.origin,
      originDetail: row.originDetail,
      statusNote: row.statusNote,
      status: classifyPublishedVote(row.opensAt, row.closesAt, dbNow),
      opensAt: row.opensAt.toISOString(),
      closesAt: row.closesAt.toISOString(),
      participation: {
        ballots: count,
        electorateSize,
        rate: computeParticipationRate(count, electorateSize),
      },
    });
  }

  return { serverNow: dbNow.toISOString(), votes: items };
}

/**
 * Invariant n°5 : ne retourne JAMAIS aucun décompte par option avant closes_at.
 */
export async function getPublishedVoteBySlug(
  db: Database,
  slug: string,
): Promise<{ readonly serverNow: string; readonly vote: PublicVoteDetail } | null> {
  const dbNow = await getDatabaseNow(db);
  const electorateSize = getEnv().ELECTORATE_SIZE;

  const rows = await db
    .select({
      id: votes.id,
      slug: votes.slug,
      question: votes.question,
      origin: votes.origin,
      originDetail: votes.originDetail,
      statusNote: votes.statusNote,
      argumentPour: votes.argumentPour,
      argumentPourAuthor: votes.argumentPourAuthor,
      argumentContre: votes.argumentContre,
      argumentContreAuthor: votes.argumentContreAuthor,
      facts: votes.facts,
      opensAt: votes.opensAt,
      closesAt: votes.closesAt,
      publicKeySpki: votes.publicKeySpki,
      keyFingerprint: votes.keyFingerprint,
    })
    .from(votes)
    .where(and(eq(votes.slug, slug), eq(votes.state, "published")))
    .limit(1);

  const row = rows[0];
  if (!row || !row.opensAt || !row.closesAt || !row.publicKeySpki || !row.keyFingerprint) {
    return null;
  }

  const options = await db
    .select({
      id: voteOptions.id,
      label: voteOptions.label,
      position: voteOptions.position,
      isBlank: voteOptions.isBlank,
    })
    .from(voteOptions)
    .where(eq(voteOptions.voteId, row.id))
    .orderBy(asc(voteOptions.position));

  const ballotCounts = await countBallotsByVoteIds(db, [row.id]);
  const totalBallots = ballotCounts.get(row.id) ?? 0;

  return {
    serverNow: dbNow.toISOString(),
    vote: {
      id: row.id,
      slug: row.slug,
      question: row.question,
      origin: row.origin,
      originDetail: row.originDetail,
      statusNote: row.statusNote,
      argumentPour: row.argumentPour,
      argumentPourAuthor: row.argumentPourAuthor,
      argumentContre: row.argumentContre,
      argumentContreAuthor: row.argumentContreAuthor,
      facts: row.facts,
      status: classifyPublishedVote(row.opensAt, row.closesAt, dbNow),
      opensAt: row.opensAt.toISOString(),
      closesAt: row.closesAt.toISOString(),
      publicKeySpkiBase64: row.publicKeySpki.toString("base64"),
      keyFingerprint: row.keyFingerprint,
      options,
      participation: {
        ballots: totalBallots,
        electorateSize,
        rate: computeParticipationRate(totalBallots, electorateSize),
      },
    },
  };
}

export async function getVoteParticipationBySlug(
  db: Database,
  slug: string,
): Promise<ParticipationSummary | null> {
  const electorateSize = getEnv().ELECTORATE_SIZE;
  const rows = await db
    .select({ id: votes.id })
    .from(votes)
    .where(and(eq(votes.slug, slug), eq(votes.state, "published")))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  const counts = await countBallotsByVoteIds(db, [row.id]);
  const totalBallots = counts.get(row.id) ?? 0;

  return {
    ballots: totalBallots,
    electorateSize,
    rate: computeParticipationRate(totalBallots, electorateSize),
  };
}

export async function listAdminVotes(db: Database): Promise<AdminVoteSummary[]> {
  const electorateSize = getEnv().ELECTORATE_SIZE;
  const rows = await db
    .select({
      id: votes.id,
      slug: votes.slug,
      question: votes.question,
      origin: votes.origin,
      originDetail: votes.originDetail,
      statusNote: votes.statusNote,
      argumentPour: votes.argumentPour,
      argumentPourAuthor: votes.argumentPourAuthor,
      argumentContre: votes.argumentContre,
      argumentContreAuthor: votes.argumentContreAuthor,
      facts: votes.facts,
      state: votes.state,
      opensAt: votes.opensAt,
      closesAt: votes.closesAt,
      keyFingerprint: votes.keyFingerprint,
      cancelReason: votes.cancelReason,
    })
    .from(votes)
    .orderBy(desc(votes.opensAt), asc(votes.slug));

  if (rows.length === 0) {
    return [];
  }

  const voteIds = rows.map((r) => r.id);
  const allOptions = await db
    .select({
      id: voteOptions.id,
      voteId: voteOptions.voteId,
      label: voteOptions.label,
      position: voteOptions.position,
      isBlank: voteOptions.isBlank,
    })
    .from(voteOptions)
    .where(inArray(voteOptions.voteId, voteIds))
    .orderBy(asc(voteOptions.position));

  const optionsByVote = new Map<string, PublicVoteOption[]>();
  for (const opt of allOptions) {
    const list = optionsByVote.get(opt.voteId) ?? [];
    list.push({
      id: opt.id,
      label: opt.label,
      position: opt.position,
      isBlank: opt.isBlank,
    });
    optionsByVote.set(opt.voteId, list);
  }

  const ballotCounts = await countBallotsByVoteIds(db, voteIds);

  return rows.map((row) => {
    const total = ballotCounts.get(row.id) ?? 0;
    return {
      id: row.id,
      slug: row.slug,
      question: row.question,
      origin: row.origin,
      originDetail: row.originDetail,
      statusNote: row.statusNote,
      argumentPour: row.argumentPour,
      argumentPourAuthor: row.argumentPourAuthor,
      argumentContre: row.argumentContre,
      argumentContreAuthor: row.argumentContreAuthor,
      facts: row.facts,
      state: row.state,
      opensAt: row.opensAt ? row.opensAt.toISOString() : null,
      closesAt: row.closesAt ? row.closesAt.toISOString() : null,
      keyFingerprint: row.keyFingerprint,
      cancelReason: row.cancelReason,
      options: optionsByVote.get(row.id) ?? [],
      participation: {
        ballots: total,
        electorateSize,
        rate: computeParticipationRate(total, electorateSize),
      },
    };
  });
}

export async function createVoteDraft(
  db: Database,
  input: CreateVoteDraftInput,
): Promise<{ readonly id: string; readonly slug: string }> {
  return db.transaction(async (tx) => {
    const slug = await generateUniqueSlug(tx, input.question);
    const inserted = await tx
      .insert(votes)
      .values({
        slug,
        question: input.question,
        origin: "admin",
        originDetail: input.originDetail ?? null,
        statusNote: input.statusNote,
        argumentPour: input.argumentPour,
        argumentPourAuthor: input.argumentPourAuthor,
        argumentContre: input.argumentContre ?? null,
        argumentContreAuthor: input.argumentContreAuthor ?? null,
        facts: input.facts ?? null,
        state: "draft",
        opensAt: input.opensAt ?? null,
        closesAt: input.closesAt ?? null,
      })
      .returning({ id: votes.id, slug: votes.slug });

    const created = inserted[0];
    if (!created) {
      throw new Error("vote_insert_failed");
    }

    const optionRows = buildVoteOptionsWithBlank(input.options);
    await tx.insert(voteOptions).values(
      optionRows.map((opt) => ({
        voteId: created.id,
        label: opt.label,
        position: opt.position,
        isBlank: opt.isBlank,
      })),
    );

    await recordAdminAction(tx, {
      action: "vote.create",
      targetType: "vote",
      targetId: created.id,
    });

    log("info", "admin.vote.created", { voteId: created.id });
    return created;
  });
}

export async function updateVoteDraft(
  db: Database,
  voteId: string,
  input: UpdateVoteDraftInput,
): Promise<VoteMutationResult<{ readonly id: string; readonly slug: string }>> {
  return db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(votes)
      .where(eq(votes.id, voteId))
      .limit(1)
      .for("update");

    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "not_found" } as const;
    }

    if (existing.state !== "draft") {
      return { ok: false, error: "vote_immutable" } as const;
    }

    const nextOpensAt =
      input.opensAt !== undefined ? input.opensAt : existing.opensAt;
    const nextClosesAt =
      input.closesAt !== undefined ? input.closesAt : existing.closesAt;

    if ((nextOpensAt === null) !== (nextClosesAt === null)) {
      return { ok: false, error: "invalid_duration" } as const;
    }

    if (nextOpensAt && nextClosesAt) {
      const durationMs = nextClosesAt.getTime() - nextOpensAt.getTime();
      if (
        durationMs < VOTE_MIN_DURATION_MS ||
        durationMs > VOTE_MAX_DURATION_MS
      ) {
        return { ok: false, error: "invalid_duration" } as const;
      }
    }

    await tx
      .update(votes)
      .set({
        ...(input.question !== undefined ? { question: input.question } : {}),
        ...(input.statusNote !== undefined
          ? { statusNote: input.statusNote }
          : {}),
        ...(input.originDetail !== undefined
          ? { originDetail: input.originDetail }
          : {}),
        ...(input.argumentPour !== undefined
          ? { argumentPour: input.argumentPour }
          : {}),
        ...(input.argumentPourAuthor !== undefined
          ? { argumentPourAuthor: input.argumentPourAuthor }
          : {}),
        ...(input.argumentContre !== undefined
          ? { argumentContre: input.argumentContre }
          : {}),
        ...(input.argumentContreAuthor !== undefined
          ? { argumentContreAuthor: input.argumentContreAuthor }
          : {}),
        ...(input.facts !== undefined ? { facts: input.facts } : {}),
        opensAt: nextOpensAt,
        closesAt: nextClosesAt,
      })
      .where(eq(votes.id, voteId));

    if (input.options) {
      await tx.delete(voteOptions).where(eq(voteOptions.voteId, voteId));
      const optionRows = buildVoteOptionsWithBlank(input.options);
      await tx.insert(voteOptions).values(
        optionRows.map((opt) => ({
          voteId,
          label: opt.label,
          position: opt.position,
          isBlank: opt.isBlank,
        })),
      );
    }

    await recordAdminAction(tx, {
      action: "vote.update",
      targetType: "vote",
      targetId: voteId,
    });

    log("info", "admin.vote.updated", { voteId });
    return {
      ok: true,
      data: { id: existing.id, slug: existing.slug },
    } as const;
  });
}

export async function publishVoteDraft(
  db: Database,
  voteId: string,
  input: PublishVoteInput,
): Promise<
  VoteMutationResult<{
    readonly id: string;
    readonly slug: string;
    readonly opensAt: string;
    readonly closesAt: string;
    readonly keyFingerprint: string;
  }>
> {
  const { MASTER_KEY } = getEnv();

  return db.transaction(async (tx) => {
    const dbNow = await getDatabaseNow(tx);

    const rows = await tx
      .select()
      .from(votes)
      .where(eq(votes.id, voteId))
      .limit(1)
      .for("update");

    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "not_found" } as const;
    }

    if (existing.state !== "draft") {
      return { ok: false, error: "vote_immutable" } as const;
    }

    const existingOptions = await tx
      .select()
      .from(voteOptions)
      .where(eq(voteOptions.voteId, voteId))
      .orderBy(asc(voteOptions.position));

    const nonBlankCount = existingOptions.filter((o) => !o.isBlank).length;
    const blankCount = existingOptions.filter((o) => o.isBlank).length;
    if (nonBlankCount < 2 || nonBlankCount > 4 || blankCount !== 1) {
      return { ok: false, error: "invalid_options" } as const;
    }

    const opensAt = input.opensAt ?? existing.opensAt ?? dbNow;
    const durationHours = input.durationHours ?? VOTE_DEFAULT_DURATION_HOURS;
    const closesAt =
      input.closesAt ??
      (input.durationHours !== undefined
        ? new Date(opensAt.getTime() + durationHours * 60 * 60 * 1000)
        : (existing.closesAt ??
          new Date(opensAt.getTime() + durationHours * 60 * 60 * 1000)));

    const durationMs = closesAt.getTime() - opensAt.getTime();
    if (
      durationMs < VOTE_MIN_DURATION_MS ||
      durationMs > VOTE_MAX_DURATION_MS
    ) {
      return { ok: false, error: "invalid_duration" } as const;
    }

    const { publicKeySpki, privateKeyEnc, keyFingerprint } =
      generateVoteKeyPair(MASTER_KEY);

    await tx
      .update(votes)
      .set({
        state: "published",
        opensAt,
        closesAt,
        publicKeySpki,
        privateKeyEnc,
        keyFingerprint,
      })
      .where(eq(votes.id, voteId));

    await recordAdminAction(tx, {
      action: "vote.publish",
      targetType: "vote",
      targetId: voteId,
    });

    log("info", "admin.vote.published", { voteId, keyFingerprint });
    return {
      ok: true,
      data: {
        id: existing.id,
        slug: existing.slug,
        opensAt: opensAt.toISOString(),
        closesAt: closesAt.toISOString(),
        keyFingerprint,
      },
    } as const;
  });
}

export async function cancelPublishedVote(
  db: Database,
  voteId: string,
  input: CancelVoteInput,
): Promise<VoteMutationResult<{ readonly id: string; readonly slug: string }>> {
  return db.transaction(async (tx) => {
    const dbNow = await getDatabaseNow(tx);

    const rows = await tx
      .select()
      .from(votes)
      .where(eq(votes.id, voteId))
      .limit(1)
      .for("update");

    const existing = rows[0];
    if (!existing) {
      return { ok: false, error: "not_found" } as const;
    }

    if (existing.state !== "published") {
      return { ok: false, error: "vote_not_cancellable" } as const;
    }

    if (!existing.closesAt || dbNow.getTime() >= existing.closesAt.getTime()) {
      return { ok: false, error: "vote_already_closed" } as const;
    }

    // §2.4 : les bulletins d'un vote annulé sont supprimés, et aucun résultat n'est publié.
    await tx.delete(ballots).where(eq(ballots.voteId, voteId));
    await tx.delete(voteReceipts).where(eq(voteReceipts.voteId, voteId));
    await tx.delete(emargement).where(eq(emargement.voteId, voteId));

    await tx
      .update(votes)
      .set({
        state: "cancelled",
        cancelReason: input.reason,
        privateKeyEnc: null,
      })
      .where(eq(votes.id, voteId));

    await recordAdminAction(tx, {
      action: "vote.cancel",
      targetType: "vote",
      targetId: voteId,
      reason: input.reason,
    });

    log("info", "admin.vote.cancelled", { voteId });
    return {
      ok: true,
      data: { id: existing.id, slug: existing.slug },
    } as const;
  });
}
