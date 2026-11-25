import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { supportContreProposal } from "@/lib/petitions/service";
import { checkPetitionMutationRateLimit } from "@/lib/ratelimit";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
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

  const rateLimit = checkPetitionMutationRateLimit(session.tokenHashHex);
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

  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json(
      { error: "not_found" },
      { status: 404, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await supportContreProposal({
      db: getDb(),
      proposalId: parsedId.data,
      voterId: session.voterId,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json(
        { error: result.error },
        { status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }
    return NextResponse.json(result, {
      status: 200,
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "contre.support.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
