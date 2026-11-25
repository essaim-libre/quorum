import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_STANDARD_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
  PUBLIC_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import {
  createPetitionSchema,
  petitionListViewSchema,
} from "@/lib/petitions/rules";
import { createPetition, listPetitions } from "@/lib/petitions/service";
import { checkPetitionMutationRateLimit } from "@/lib/ratelimit";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = petitionListViewSchema.safeParse(
    searchParams.get("view") ?? "collecting",
  );
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PUBLIC_NO_STORE_HEADERS },
    );
  }

  try {
    const petitions = await listPetitions(getDb(), parsed.data);
    return NextResponse.json(
      { petitions },
      { status: 200, headers: PUBLIC_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.list.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PUBLIC_NO_STORE_HEADERS },
    );
  }
}

export async function POST(request: Request): Promise<NextResponse> {
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

  const bodyRes = await readJsonBodyWithLimit(request, {
    maxBytes: MAX_STANDARD_JSON_BYTES,
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const parsed = createPetitionSchema.safeParse(bodyRes.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await createPetition({
      db: getDb(),
      voterId: session.voterId,
      input: parsed.data,
    });

    if (!result.ok) {
      const status = result.error === "monthly_petition_limit" ? 429 : 409;
      return NextResponse.json(
        { error: result.error },
        { status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      { id: result.id, slug: result.slug, state: result.state },
      { status: 201, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.create.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
