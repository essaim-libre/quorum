import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtpCode } from "@/lib/auth/otp";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_SMALL_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { extractClientIp } from "@/lib/ratelimit";

const verifyBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  code: z.string().regex(/^\d{6}$/),
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

  const parsed = verifyBodySchema.safeParse(bodyRes.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_code" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const result = await verifyOtpCode({
      db: getDb(),
      email: parsed.data.email,
      code: parsed.data.code,
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
      const status = result.error === "invalid_email" ? 400 : 401;
      return NextResponse.json(
        { error: result.error },
        { status, headers: PRIVATE_NO_STORE_HEADERS },
      );
    }

    const response = NextResponse.json(
      { ok: true, isAdmin: result.isAdmin },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
    setSessionCookieOnResponse(response, result.rawToken, result.isAdmin);
    return response;
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    log("error", "auth.verify.failed", { reason: code });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
