import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_SMALL_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { acceptRewordingSchema } from "@/lib/petitions/rules";
import { respondToRewording } from "@/lib/petitions/service";

const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

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
    allowEmpty: true,
    emptyFallback: { accept: true },
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const parsedBody = acceptRewordingSchema.safeParse(bodyRes.data);
  if (!parsedBody.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await respondToRewording({
      db: getDb(),
      slug: parsedSlug.data,
      voterId: session.voterId,
      accept: parsedBody.data.accept,
    });
    if (!result.ok) {
      const status =
        result.error === "not_found"
          ? 404
          : result.error === "forbidden"
            ? 403
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
    log("error", "petitions.rewording.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
