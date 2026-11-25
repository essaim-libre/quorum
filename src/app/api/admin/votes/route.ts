import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { MAX_STANDARD_JSON_BYTES, readJsonBodyWithLimit } from "@/lib/http/body";
import {
  isTrustedSameOriginRequest,
  PRIVATE_NO_STORE_HEADERS,
} from "@/lib/http/csrf";
import { log } from "@/lib/log";
import { createVoteDraftSchema } from "@/lib/votes/rules";
import { createVoteDraft, listAdminVotes } from "@/lib/votes/service";

export async function GET(): Promise<NextResponse> {
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

  try {
    const votes = await listAdminVotes(getDb());
    return NextResponse.json(
      { votes },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "admin.votes.list.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
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
  if (!session.isAdmin) {
    return NextResponse.json(
      { error: "forbidden" },
      { status: 403, headers: PRIVATE_NO_STORE_HEADERS },
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

  const parsed = createVoteDraftSchema.safeParse(bodyRes.data);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_request" },
      { status: 400, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const created = await createVoteDraft(getDb(), parsed.data);
    return NextResponse.json(created, {
      status: 201,
      headers: PRIVATE_NO_STORE_HEADERS,
    });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "admin.votes.create.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
