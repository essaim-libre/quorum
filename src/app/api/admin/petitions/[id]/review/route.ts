import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { adminReviewPetitionSchema } from "@/lib/petitions/rules";
import { reviewPetition } from "@/lib/petitions/service";

const uuidSchema = z.string().uuid();

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!session.isAdmin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsedId = uuidSchema.safeParse(id);
  if (!parsedId.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsedBody = adminReviewPetitionSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "admin.petitions.review.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
