import "server-only";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import type { Pool } from "pg";
import type { Database } from "@/lib/db/client";
import {
  ballots,
  emargement,
  otpCodes,
  results,
  sessions,
  voteOptions,
  voteReceipts,
  votes,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { recordAdminAction } from "@/lib/journal";
import { log } from "@/lib/log";
import {
  computeReceiptsListHash,
  computeTally,
  type TallySummary,
} from "@/lib/votes/tally";

export interface CloseVoteOutcome {
  readonly closed: boolean;
  readonly newlyClosed: boolean;
  readonly integrityViolation?: boolean;
  readonly tokensIssued: number | null;
}

export interface ClosedVoteReport {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly origin: "admin" | "petition";
  readonly originDetail: string | null;
  readonly statusNote: string;
  readonly opensAt: Date;
  readonly closesAt: Date;
  readonly keyFingerprint: string;
  readonly tally: TallySummary;
  readonly receipts: readonly string[];
  readonly receiptsHash: string;
}

export type GetClosedReportResult =
  | { readonly ok: true; readonly report: ClosedVoteReport }
  | {
      readonly ok: false;
      readonly error: "not_found" | "vote_not_closed" | "integrity_violation";
    };

/**
 * Clôture idempotente d'un vote dont closes_at est passée (§6.5) :
 * 1. Verrouille la ligne du vote (FOR UPDATE).
 * 2. Si des lignes `results` existent déjà, ne fait rien.
 * 3. Insère dans `results` le décompte des bulletins par option.
 * 4. Enregistre `votes.tokens_issued = count(emargement)`.
 * 5. Supprime l'émargement du vote et efface `private_key_enc`.
 * 6. Hors transaction, exécute `VACUUM emargement`.
 */
export async function closeVoteIfDue(
  db: Database,
  pool: Pool,
  voteId: string,
  options?: { readonly skipVacuum?: boolean },
): Promise<CloseVoteOutcome> {
  const txOutcome = await db.transaction(async (tx) => {
    const voteRows = await tx
      .select({
        id: votes.id,
        state: votes.state,
        tokensIssued: votes.tokensIssued,
        isDue: sql<boolean>`(${votes.closesAt} IS NOT NULL AND ${votes.closesAt} <= now())`,
      })
      .from(votes)
      .where(eq(votes.id, voteId))
      .limit(1)
      .for("update");

    const vote = voteRows[0];
    if (!vote || vote.state !== "published" || !vote.isDue) {
      return {
        closed: false,
        newlyClosed: false,
        tokensIssued: null,
      } as const;
    }

    const existingResults = await tx
      .select({ optionId: results.optionId })
      .from(results)
      .where(eq(results.voteId, voteId))
      .limit(1);

    if (existingResults.length > 0) {
      return {
        closed: true,
        newlyClosed: false,
        tokensIssued: vote.tokensIssued,
      } as const;
    }

    const allOptions = await tx
      .select({ id: voteOptions.id })
      .from(voteOptions)
      .where(eq(voteOptions.voteId, voteId))
      .orderBy(asc(voteOptions.position));

    const ballotCounts = await tx
      .select({
        optionId: ballots.optionId,
        total: sql<number>`count(*)::int`,
      })
      .from(ballots)
      .where(eq(ballots.voteId, voteId))
      .groupBy(ballots.optionId);

    const countByOption = new Map<string, number>();
    let totalBallots = 0;
    for (const row of ballotCounts) {
      const count = Number(row.total);
      countByOption.set(row.optionId, count);
      totalBallots += count;
    }

    const emargementCountRows = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(emargement)
      .where(eq(emargement.voteId, voteId));
    const tokensIssuedCount = Number(emargementCountRows[0]?.total ?? 0);

    // SEC-05 : contrôle d'intégrité bloquant avant toute écriture de results
    if (totalBallots > tokensIssuedCount) {
      await tx
        .update(votes)
        .set({ privateKeyEnc: null })
        .where(eq(votes.id, voteId));

      await recordAdminAction(tx, {
        action: "vote.integrity_alert",
        targetType: "vote",
        targetId: voteId,
        reason: `Clôture bloquée : ${totalBallots} bulletins pour ${tokensIssuedCount} jetons émis`,
      });

      log("error", "vote.close.integrity_violation", {
        voteId,
        totalBallots,
        tokensIssued: tokensIssuedCount,
      });

      return {
        closed: false,
        newlyClosed: false,
        integrityViolation: true,
        tokensIssued: tokensIssuedCount,
      } as const;
    }

    if (allOptions.length > 0) {
      await tx.insert(results).values(
        allOptions.map((opt) => ({
          voteId,
          optionId: opt.id,
          count: countByOption.get(opt.id) ?? 0,
        })),
      );
    }

    await tx.delete(emargement).where(eq(emargement.voteId, voteId));

    await tx
      .update(votes)
      .set({
        tokensIssued: tokensIssuedCount,
        privateKeyEnc: null,
      })
      .where(eq(votes.id, voteId));

    return {
      closed: true,
      newlyClosed: true,
      tokensIssued: tokensIssuedCount,
    } as const;
  });

  if (txOutcome.newlyClosed) {
    if (!options?.skipVacuum) {
      await pool.query("VACUUM emargement");
    }
    log("info", "vote.closed", {
      voteId,
      tokensIssued: txOutcome.tokensIssued,
    });
  }

  return txOutcome;
}

/**
 * Clôt tous les votes publiés dont l'échéance est dépassée (appelé par /api/internal/cron).
 */
export async function closeAllDueVotes(
  db: Database,
  pool: Pool,
): Promise<{ readonly closedCount: number }> {
  const dueVotes = await db
    .select({ id: votes.id })
    .from(votes)
    .where(
      and(
        eq(votes.state, "published"),
        lte(votes.closesAt, sql`now()`),
        isNull(votes.tokensIssued),
      ),
    );

  let closedCount = 0;
  for (const row of dueVotes) {
    const res = await closeVoteIfDue(db, pool, row.id, { skipVacuum: true });
    if (res.newlyClosed) {
      closedCount += 1;
    }
  }

  if (closedCount > 0) {
    await pool.query("VACUUM emargement");
  }

  return { closedCount };
}

/**
 * Lit les résultats et la liste triée des reçus d'un vote clos (clôture automatique idempotente).
 * Invariant n°5 : refuse systématiquement avant closes_at.
 */
export async function getClosedVoteReportBySlug(
  db: Database,
  pool: Pool,
  slug: string,
): Promise<GetClosedReportResult> {
  const voteRows = await db
    .select({
      id: votes.id,
      slug: votes.slug,
      question: votes.question,
      origin: votes.origin,
      originDetail: votes.originDetail,
      statusNote: votes.statusNote,
      opensAt: votes.opensAt,
      closesAt: votes.closesAt,
      keyFingerprint: votes.keyFingerprint,
      tokensIssued: votes.tokensIssued,
      isClosed: sql<boolean>`(${votes.closesAt} IS NOT NULL AND ${votes.closesAt} <= now())`,
    })
    .from(votes)
    .where(and(eq(votes.slug, slug), eq(votes.state, "published")))
    .limit(1);

  const vote = voteRows[0];
  if (
    !vote ||
    !vote.opensAt ||
    !vote.closesAt ||
    !vote.keyFingerprint
  ) {
    return { ok: false, error: "not_found" };
  }

  if (!vote.isClosed) {
    return { ok: false, error: "vote_not_closed" };
  }

  // SEC-16 : ne pas déclencher VACUUM emargement sur un GET public (exécuté par /api/internal/cron)
  const closeOutcome = await closeVoteIfDue(db, pool, vote.id, {
    skipVacuum: true,
  });
  if (closeOutcome.integrityViolation) {
    return { ok: false, error: "integrity_violation" };
  }

  // Relit tokens_issued après clôture idempotente
  const refreshed = (
    await db
      .select({ tokensIssued: votes.tokensIssued })
      .from(votes)
      .where(eq(votes.id, vote.id))
      .limit(1)
  )[0];

  const optionResultRows = await db
    .select({
      optionId: voteOptions.id,
      label: voteOptions.label,
      position: voteOptions.position,
      isBlank: voteOptions.isBlank,
      count: results.count,
    })
    .from(voteOptions)
    .innerJoin(
      results,
      and(eq(results.voteId, vote.id), eq(results.optionId, voteOptions.id)),
    )
    .where(eq(voteOptions.voteId, vote.id))
    .orderBy(asc(voteOptions.position));

  const receiptRows = await db
    .select({ receipt: voteReceipts.receipt })
    .from(voteReceipts)
    .where(eq(voteReceipts.voteId, vote.id))
    .orderBy(asc(voteReceipts.receipt));

  const sortedReceipts = receiptRows.map((r) => r.receipt);
  const receiptsHash = computeReceiptsListHash(sortedReceipts);

  const tally = computeTally({
    rows: optionResultRows,
    electorateSize: getEnv().ELECTORATE_SIZE,
    tokensIssued: refreshed?.tokensIssued ?? vote.tokensIssued,
  });

  return {
    ok: true,
    report: {
      voteId: vote.id,
      slug: vote.slug,
      question: vote.question,
      origin: vote.origin,
      originDetail: vote.originDetail,
      statusNote: vote.statusNote,
      opensAt: vote.opensAt,
      closesAt: vote.closesAt,
      keyFingerprint: vote.keyFingerprint,
      tally,
      receipts: sortedReceipts,
      receiptsHash,
    },
  };
}

/**
 * Purges quotidiennes prévues au cahier §7 :
 * - otp_codes expirés depuis plus de 24 h
 * - sessions expirées
 */
export async function runScheduledPurges(db: Database): Promise<{
  readonly purgedOtpCodes: number;
  readonly purgedSessions: number;
}> {
  const deletedOtp = await db
    .delete(otpCodes)
    .where(lte(otpCodes.expiresAt, sql`now() - interval '24 hours'`))
    .returning({ id: otpCodes.id });

  const deletedSessions = await db
    .delete(sessions)
    .where(lte(sessions.expiresAt, sql`now()`))
    .returning({ tokenHash: sessions.tokenHash });

  return {
    purgedOtpCodes: deletedOtp.length,
    purgedSessions: deletedSessions.length,
  };
}
