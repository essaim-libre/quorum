import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyOtpCode } from "@/lib/auth/otp";
import { setSessionCookieOnResponse } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";

const verifyBodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  code: z.string().regex(/^\d{6}$/),
});

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = verifyBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_code" }, { status: 400 });
  }

  try {
    const result = await verifyOtpCode({
      db: getDb(),
      email: parsed.data.email,
      code: parsed.data.code,
    });

    if (!result.ok) {
      const status = result.error === "invalid_email" ? 400 : 401;
      return NextResponse.json({ error: result.error }, { status });
    }

    const response = NextResponse.json(
      { ok: true, isAdmin: result.isAdmin },
      { status: 200 },
    );
    setSessionCookieOnResponse(response, result.rawToken);
    return response;
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    log("error", "auth.verify.failed", { reason: code });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
