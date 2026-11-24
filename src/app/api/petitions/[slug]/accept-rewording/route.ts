import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
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
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const parsedSlug = slugParamSchema.safeParse(slug);
  if (!parsedSlug.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let rawBody: unknown = { accept: true };
  const text = await request.text();
  if (text.trim().length > 0) {
    try {
      rawBody = JSON.parse(text);
    } catch {
      return NextResponse.json({ error: "invalid_request" }, { status: 400 });
    }
  }

  const parsedBody = acceptRewordingSchema.safeParse(rawBody);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
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
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.rewording.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
