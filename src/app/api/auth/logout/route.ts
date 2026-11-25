import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  clearSessionCookieOnResponse,
  deleteSessionByToken,
  SESSION_COOKIE_NAME,
} from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";

export async function POST(request: Request): Promise<NextResponse> {
  if (!isTrustedSameOriginRequest(request)) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const cookieStore = await cookies();
    const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
    if (rawToken) {
      await deleteSessionByToken(getDb(), rawToken);
    }

    const response = NextResponse.json(
      { ok: true },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
    clearSessionCookieOnResponse(response);
    log("info", "auth.logout.success");
    return response;
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "unknown";
    log("error", "auth.logout.failed", { reason: code });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
