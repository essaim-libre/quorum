import { NextResponse } from "next/server";
import { z } from "zod";
import { requestOtpCode } from "@/lib/auth/otp";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { extractClientIp } from "@/lib/ratelimit";

const requestCodeBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = requestCodeBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_email" }, { status: 400 });
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
            headers: { "Retry-After": String(result.retryAfterSeconds) },
          },
        );
      }
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    log("error", "auth.code.failed", { reason: code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
