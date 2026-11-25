import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtpCode } from "@/lib/auth/otp";
import { getDb } from "@/lib/db/client";
import { MAX_SMALL_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { extractClientIp } from "@/lib/ratelimit";

const requestCodeBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
});

export async function POST(request: Request): Promise<NextResponse> {
  const bodyRes = await readJsonBodyWithLimit(request, {
    maxBytes: MAX_SMALL_JSON_BYTES,
  });
  if (!bodyRes.ok) {
    return NextResponse.json(
      { error: bodyRes.error },
      { status: bodyRes.status, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const parsed = requestCodeBodySchema.safeParse(bodyRes.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_email" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await requestOtpCode({
      db: getDb(),
      email: parsed.data.email,
      ip: extractClientIp(request.headers),
    });

    if (!result.ok) {
      if (result.error === "rate_limited") {
        return NextResponse.json(
          { error: "rate_limited" },
          {
            status: 429,
            headers: {
              ...PRIVATE_NO_STORE_HEADERS,
              "Retry-After": String(result.retryAfterSeconds),
            },
          },
        );
      }
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    return NextResponse.json(
      result.devCode ? { ok: true, devCode: result.devCode } : { ok: true },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    log("error", "auth.code.failed", { reason: code });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
