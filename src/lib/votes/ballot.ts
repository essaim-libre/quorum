import "server-only";
import { and, eq, sql } from "drizzle-orm";
import {
  hasValidVoteTokenPrefix,
  importVotePublicKey,
  verifyToken,
} from "@/lib/crypto/blind";
import { sha256 } from "@/lib/crypto/hmac";
import { computeReceipt } from "@/lib/crypto/receipt";
import type { Database } from "@/lib/db/client";
import { ballots, voteOptions, voteReceipts, votes } from "@/lib/db/schema";
import { log } from "@/lib/log";

const RSA_2048_BYTES = 256;
const MAX_BALLOT_REVISIONS = 20;

export type SubmitBallotResult =
  | { readonly ok: true; readonly receipt: string; readonly revision: number }
  | {
      readonly ok: false;
      readonly error:
        | "vote_closed"
        | "invalid_token"
        | "invalid_signature"
        | "invalid_option"
        | "max_revisions_reached";
    };

/**
 * Phase 2 (§6.3) : dépose ou remplace un bulletin anonyme.
 * Aucune donnée d'identité, aucune session, aucun cookie.
 */
export async function submitAnonymousBallot(params: {
  readonly db: Database;
  readonly voteId: string;
  readonly inputMsg: Uint8Array;
  readonly sig: Uint8Array;
  readonly optionId: string;
}): Promise<SubmitBallotResult> {
  if (params.sig.length !== RSA_2048_BYTES) {
    return { ok: false, error: "invalid_signature" };
  }

  if (!hasValidVoteTokenPrefix(params.inputMsg, params.voteId)) {
    return { ok: false, error: "invalid_token" };
  }

  return params.db.transaction(async (tx) => {
    const voteRows = await tx
      .select({
        id: votes.id,
        state: votes.state,
        publicKeySpki: votes.publicKeySpki,
        isOpen: sql<boolean>`(${votes.opensAt} <= now() AND now() < ${votes.closesAt})`,
      })
      .from(votes)
      .where(eq(votes.id, params.voteId))
      .limit(1);

    const vote = voteRows[0];
    if (
      !vote ||
      vote.state !== "published" ||
      !vote.isOpen ||
      !vote.publicKeySpki
    ) {
      return { ok: false, error: "vote_closed" } as const;
    }

    const publicKey = await importVotePublicKey(vote.publicKeySpki);
    const validSig = await verifyToken(publicKey, params.sig, params.inputMsg);
    if (!validSig) {
      return { ok: false, error: "invalid_signature" } as const;
    }

    const optionRows = await tx
      .select({ id: voteOptions.id })
      .from(voteOptions)
      .where(
        and(
          eq(voteOptions.id, params.optionId),
          eq(voteOptions.voteId, params.voteId),
        ),
      )
      .limit(1);

    if (optionRows.length === 0) {
      return { ok: false, error: "invalid_option" } as const;
    }

    const tokenHash = sha256(Buffer.from(params.inputMsg));
    const existingRows = await tx
      .select({ revision: ballots.revision })
      .from(ballots)
      .where(
        and(eq(ballots.voteId, params.voteId), eq(ballots.tokenHash, tokenHash)),
      )
      .limit(1)
      .for("update");

    const existing = existingRows[0];
    let revision = 1;

    if (!existing) {
      await tx.insert(ballots).values({
        voteId: params.voteId,
        tokenHash,
        optionId: params.optionId,
        revision: 1,
      });
    } else {
      if (existing.revision >= MAX_BALLOT_REVISIONS) {
        return { ok: false, error: "max_revisions_reached" } as const;
      }
      revision = existing.revision + 1;
      await tx
        .update(ballots)
        .set({
          optionId: params.optionId,
          revision,
        })
        .where(
          and(
            eq(ballots.voteId, params.voteId),
            eq(ballots.tokenHash, tokenHash),
          ),
        );
    }

    const receipt = await computeReceipt(params.inputMsg);
    await tx
      .insert(voteReceipts)
      .values({ voteId: params.voteId, receipt })
      .onConflictDoNothing();

    log("info", "ballot.recorded", { voteId: params.voteId, revision });
    return { ok: true, receipt, revision } as const;
  });
}
