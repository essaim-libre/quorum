import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_STANDARD_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { adminReviewPetitionSchema } from "@/lib/petitions/rules";
import { reviewPetition } from "@/lib/petitions/service";

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
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
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

  const bodyRes = await readJsonBodyWithLimit(request, {
    maxBytes: MAX_STANDARD_JSON_BYTES,
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const parsedBody = adminReviewPetitionSchema.safeParse(bodyRes.data);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await reviewPetition({
      db: getDb(),
      petitionId: parsedId.data,
      input: parsedBody.data,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "invalid_opens_at"
            ? 400
            : 409;
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
    log("error", "admin.petitions.review.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
