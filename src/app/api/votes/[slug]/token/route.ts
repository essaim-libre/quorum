import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { base64UrlToBytes, bytesToBase64Url } from "@/lib/crypto/base64url";
import { getDb } from "@/lib/db/client";
import { MAX_SMALL_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { checkTokenRateLimit } from "@/lib/ratelimit";
import { issueBlindToken } from "@/lib/votes/token";

const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

const tokenBodySchema = z.object({
  blindedMsg: z.string().min(1).max(1024),
});

export async function POST(
  request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const rateLimit = checkTokenRateLimit(session.tokenHashHex);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const { slug } = await context.params;
  const parsedSlug = slugParamSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const bodyRes = await readJsonBodyWithLimit(request, {
    maxBytes: MAX_SMALL_JSON_BYTES,
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const parsedBody = tokenBodySchema.safeParse(bodyRes.data);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const blindedMsg = base64UrlToBytes(parsedBody.data.blindedMsg);
  if (!blindedMsg) {
    return NextResponse.json(
      { error: "invalid_blinded_msg" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await issueBlindToken({
      db: getDb(),
      slug: parsedSlug.data,
      voterId: session.voterId,
      blindedMsg,
    });

    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "invalid_blinded_msg"
            ? 400
            : 409;
      return NextResponse.json(
        { error: result.error },
        { status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { blindSig: bytesToBase64Url(result.blindSig) },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "vote.token.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
