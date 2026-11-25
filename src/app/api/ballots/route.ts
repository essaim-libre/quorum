import { NextResponse } from "next/server";
import { z } from "zod";
import { base64UrlToBytes } from "@/lib/crypto/base64url";
import { getDb } from "@/lib/db/client";
import { MAX_SMALL_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import { log } from "@/lib/log";
import { checkBallotRateLimit, extractClientIp } from "@/lib/ratelimit";
import { submitAnonymousBallot } from "@/lib/votes/ballot";

// Invariant n°4 : cette route ne lit AUCUN cookie, AUCUNE session et n'importe rien d'auth ni next/headers.

const NO_STORE = { "Cache-Control": "no-store" } as const;

const ballotBodySchema = z.object({
  voteId: z.string().uuid(),
  inputMsg: z.string().min(1).max(1024),
  sig: z.string().min(1).max(1024),
  optionId: z.string().uuid(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const clientIp = extractClientIp(request.headers);

  // Limite taille du corps AVANT tout parsing (SEC-03)
  const bodyRes = await readJsonBodyWithLimit(request, {
    maxBytes: MAX_SMALL_JSON_BYTES,
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: NO_STORE },
    );
  }

  const parsed = ballotBodySchema.safeParse(bodyRes.data);
  if (!parsed.success) {
    // Applique tout de même le rate limit IP/global sur les requêtes malformées (SEC-01)
    const malformedRl = checkBallotRateLimit(clientIp);
    if (!malformedRl.allowed) {
      return NextResponse.json(
        { error: "rate_limited" },
        {
          status: 429,
          headers: {
            ...NO_STORE,
            "Retry-After": String(malformedRl.retryAfterSeconds),
          },
        },
      );
    }
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  const rateLimit = checkBallotRateLimit(clientIp, parsed.data.voteId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          ...NO_STORE,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const inputMsg = base64UrlToBytes(parsed.data.inputMsg);
  const sig = base64UrlToBytes(parsed.data.sig);
  if (!inputMsg || !sig) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: NO_STORE },
    );
  }

  try {
    const result = await submitAnonymousBallot({
      db: getDb(),
      voteId: parsed.data.voteId,
      inputMsg,
      sig,
      optionId: parsed.data.optionId,
    });

    if (!result.ok) {
      const status =
        result.error === "vote_closed" ||
        result.error === "max_revisions_reached"
          ? 409
          : 400;
      return NextResponse.json(
        { error: result.error },
        { status, headers: NO_STORE },
      );
    }

    return NextResponse.json(
      { receipt: result.receipt, revision: result.revision },
      { status: 200, headers: NO_STORE },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "ballot.submit.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: NO_STORE },
    );
  }
}
