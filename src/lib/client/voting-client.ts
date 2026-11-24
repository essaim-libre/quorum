"use client";

import {
  deletePendingBlindRequest,
  getPendingBlindRequest,
  getStoredVoteToken,
  markVoteTokenAsVoted,
  savePendingBlindRequest,
  saveStoredVoteToken,
  type StoredVoteToken,
} from "@/lib/client/token-store";
import {
  base64ToBytes,
  base64UrlToBytes,
  bytesToBase64Url,
} from "@/lib/crypto/base64url";
import {
  blindToken,
  buildVoteTokenMessage,
  finalizeToken,
  importVotePublicKey,
  prepareToken,
} from "@/lib/crypto/blind";
import { computeReceipt } from "@/lib/crypto/receipt";

export type EnsureTokenResult =
  | { readonly ok: true; readonly token: StoredVoteToken }
  | { readonly ok: false; readonly error: string };

export type CastBallotResult =
  | { readonly ok: true; readonly receipt: string; readonly revision: number }
  | { readonly ok: false; readonly error: string };

const inFlightTokenPromises = new Map<string, Promise<EnsureTokenResult>>();

/**
 * Phase 1 côté client (§6.2) : prépare, aveugle, demande la signature aveugle (avec cookie),
 * finalise et enregistre (inputMsg, sig, receipt) dans IndexedDB.
 */
export function ensureVoteToken(params: {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly publicKeySpkiBase64: string;
}): Promise<EnsureTokenResult> {
  const existingFlight = inFlightTokenPromises.get(params.voteId);
  if (existingFlight) {
    return existingFlight;
  }

  const work = runEnsureVoteToken(params).finally(() => {
    inFlightTokenPromises.delete(params.voteId);
  });
  inFlightTokenPromises.set(params.voteId, work);
  return work;
}

async function runEnsureVoteToken(params: {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly publicKeySpkiBase64: string;
}): Promise<EnsureTokenResult> {
  const stored = await getStoredVoteToken(params.voteId);
  if (stored) {
    return { ok: true, token: stored };
  }

  const publicKey = await importVotePublicKey(
    base64ToBytes(params.publicKeySpkiBase64),
  );

  let pending = await getPendingBlindRequest(params.voteId);
  if (!pending) {
    const msg = buildVoteTokenMessage(params.voteId);
    const inputMsg = prepareToken(msg);
    const { blindedMsg, inv } = await blindToken(publicKey, inputMsg);
    pending = await savePendingBlindRequest({
      voteId: params.voteId,
      inputMsg: bytesToBase64Url(inputMsg),
      blindedMsg: bytesToBase64Url(blindedMsg),
      inv: bytesToBase64Url(inv),
    });
  }

  let response: Response;
  try {
    response = await fetch(`/api/votes/${encodeURIComponent(params.slug)}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ blindedMsg: pending.blindedMsg }),
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  const payload = (await response.json().catch(() => null)) as {
    blindSig?: string;
    error?: string;
  } | null;

  if (!response.ok || !payload?.blindSig) {
    if (payload?.error === "token_already_issued") {
      await deletePendingBlindRequest(params.voteId);
    }
    return { ok: false, error: payload?.error ?? "internal_error" };
  }

  const inputMsgBytes = base64UrlToBytes(pending.inputMsg);
  const invBytes = base64UrlToBytes(pending.inv);
  const blindSigBytes = base64UrlToBytes(payload.blindSig);
  if (!inputMsgBytes || !invBytes || !blindSigBytes) {
    return { ok: false, error: "internal_error" };
  }

  const sigBytes = await finalizeToken(
    publicKey,
    inputMsgBytes,
    blindSigBytes,
    invBytes,
  );
  const receipt = await computeReceipt(inputMsgBytes);

  const token = await saveStoredVoteToken({
    voteId: params.voteId,
    slug: params.slug,
    question: params.question,
    inputMsg: pending.inputMsg,
    sig: bytesToBase64Url(sigBytes),
    receipt,
    hasVoted: false,
  });

  await deletePendingBlindRequest(params.voteId);
  return { ok: true, token };
}

function randomSubmitDelayMs(): number {
  return 500 + Math.floor(Math.random() * 2500);
}

/**
 * Phase 2 côté client (§6.3) : attend 0,5 à 3 s puis appelle POST /api/ballots
 * avec credentials: "omit" (invariant n°4) sans jamais stocker le choix (invariant n°10).
 */
export async function castAnonymousBallot(params: {
  readonly token: StoredVoteToken;
  readonly optionId: string;
}): Promise<CastBallotResult> {
  await new Promise((resolve) => {
    window.setTimeout(resolve, randomSubmitDelayMs());
  });

  let response: Response;
  try {
    response = await fetch("/api/ballots", {
      method: "POST",
      credentials: "omit",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voteId: params.token.voteId,
        inputMsg: params.token.inputMsg,
        sig: params.token.sig,
        optionId: params.optionId,
      }),
    });
  } catch {
    return { ok: false, error: "network_error" };
  }

  const payload = (await response.json().catch(() => null)) as {
    receipt?: string;
    revision?: number;
    error?: string;
  } | null;

  if (!response.ok || !payload?.receipt) {
    return { ok: false, error: payload?.error ?? "internal_error" };
  }

  await markVoteTokenAsVoted(params.token.voteId, payload.receipt);
  return {
    ok: true,
    receipt: payload.receipt,
    revision: payload.revision ?? 1,
  };
}
