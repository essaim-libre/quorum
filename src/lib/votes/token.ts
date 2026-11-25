import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { blindSignInWorkerPool } from "@/lib/crypto/blind-sign-pool";
import { constantTimeEqual, hmacSha256, sha256 } from "@/lib/crypto/hmac";
import { decryptVotePrivateKeyPkcs8 } from "@/lib/crypto/vote-keys";
import type { Database } from "@/lib/db/client";
import { emargement, votes } from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { log } from "@/lib/log";

const RSA_2048_BYTES = 256;

export type IssueTokenResult =
  | { readonly ok: true; readonly blindSig: Buffer; readonly replayed: boolean }
  | {
      readonly ok: false;
      readonly error:
        | "not_found"
        | "vote_closed"
        | "invalid_blinded_msg"
        | "token_already_issued";
    };

function isPgUniqueViolation(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const err = error as { code?: unknown; cause?: { code?: unknown } };
  return err.code === "23505" || err.cause?.code === "23505";
}

/**
 * Phase 1 (§6.2) : émet une signature aveugle pour un étudiant authentifié.
 * Rejeu idempotent si même SHA-256(blinded_msg), 409 sinon.
 * Gère proprement la collision concurrente PK (23505) sans renvoyer 500 (SEC-11).
 */
export async function issueBlindToken(params: {
  readonly db: Database;
  readonly slug: string;
  readonly voterId: Buffer;
  readonly blindedMsg: Uint8Array;
}): Promise<IssueTokenResult> {
  if (params.blindedMsg.length !== RSA_2048_BYTES) {
    return { ok: false, error: "invalid_blinded_msg" };
  }

  const env = getEnv();
  const blindedHash = sha256(Buffer.from(params.blindedMsg));

  let resolvedVoteId: string | null = null;
  let resolvedVoterTag: Buffer | null = null;

  try {
    return await params.db.transaction(async (tx) => {
      const voteRows = await tx
        .select({
          id: votes.id,
          state: votes.state,
          privateKeyEnc: votes.privateKeyEnc,
          isOpen: sql<boolean>`(${votes.opensAt} <= now() AND now() < ${votes.closesAt})`,
        })
        .from(votes)
        .where(eq(votes.slug, params.slug))
        .limit(1);

      const vote = voteRows[0];
      if (!vote || vote.state !== "published") {
        return { ok: false, error: "not_found" } as const;
      }

      if (!vote.isOpen || !vote.privateKeyEnc) {
        return { ok: false, error: "vote_closed" } as const;
      }

      const voterTag = hmacSha256(env.K_EMARG, params.voterId, vote.id);
      resolvedVoteId = vote.id;
      resolvedVoterTag = voterTag;

      const existingRows = await tx
        .select({
          blindedHash: emargement.blindedHash,
          blindSig: emargement.blindSig,
        })
        .from(emargement)
        .where(
          and(eq(emargement.voteId, vote.id), eq(emargement.voterTag, voterTag)),
        )
        .limit(1)
        .for("update");

      const existing = existingRows[0];
      if (existing) {
        if (constantTimeEqual(existing.blindedHash, blindedHash)) {
          log("info", "vote.token.replayed", { voteId: vote.id });
          return {
            ok: true,
            blindSig: existing.blindSig,
            replayed: true,
          } as const;
        }
        log("info", "vote.token.duplicate_rejected", { voteId: vote.id });
        return { ok: false, error: "token_already_issued" } as const;
      }

      const pkcs8 = decryptVotePrivateKeyPkcs8(
        vote.privateKeyEnc,
        env.MASTER_KEY,
      );
      let blindSigBytes: Uint8Array;
      try {
        blindSigBytes = await blindSignInWorkerPool(pkcs8, params.blindedMsg);
      } finally {
        pkcs8.fill(0);
      }

      const blindSig = Buffer.from(blindSigBytes);
      await tx.insert(emargement).values({
        voteId: vote.id,
        voterTag,
        blindedHash,
        blindSig,
      });

      log("info", "vote.token.issued", { voteId: vote.id });
      return {
        ok: true,
        blindSig,
        replayed: false,
      } as const;
    });
  } catch (error: unknown) {
    // SEC-11 : deux demandes simultanées pour le même votant sur un émargement inexistant
    if (isPgUniqueViolation(error) && resolvedVoteId && resolvedVoterTag) {
      const existingRows = await params.db
        .select({
          blindedHash: emargement.blindedHash,
          blindSig: emargement.blindSig,
        })
        .from(emargement)
        .where(
          and(
            eq(emargement.voteId, resolvedVoteId),
            eq(emargement.voterTag, resolvedVoterTag),
          ),
        )
        .limit(1);

      const existing = existingRows[0];
      if (existing) {
        if (constantTimeEqual(existing.blindedHash, blindedHash)) {
          log("info", "vote.token.replayed", { voteId: resolvedVoteId });
          return {
            ok: true,
            blindSig: existing.blindSig,
            replayed: true,
          } as const;
        }
        log("info", "vote.token.duplicate_rejected", {
          voteId: resolvedVoteId,
        });
        return { ok: false, error: "token_already_issued" } as const;
      }
    }
    throw error;
  }
}
