import { NextResponse } from "next/server";
import { z } from "zod";
import { base64UrlToBytes } from "@/lib/crypto/base64url";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { checkBallotRateLimit, extractClientIp } from "@/lib/ratelimit";
import { submitAnonymousBallot } from "@/lib/votes/ballot";

// Invariant n°4 : cette route ne lit AUCUN cookie, AUCUNE session et n'importe rien d'auth ni next/headers.

const ballotBodySchema = z.object({
  voteId: z.string().uuid(),
  inputMsg: z.string().min(1).max(1024),
  sig: z.string().min(1).max(1024),
  optionId: z.string().uuid(),
});

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkBallotRateLimit(extractClientIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = ballotBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const inputMsg = base64UrlToBytes(parsed.data.inputMsg);
  const sig = base64UrlToBytes(parsed.data.sig);
  if (!inputMsg || !sig) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      { receipt: result.receipt, revision: result.revision },
      { status: 200 },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "ballot.submit.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
