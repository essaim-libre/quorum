import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { getPetitionBySlug } from "@/lib/petitions/service";

const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

export async function GET(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const { slug } = await context.params;
  const parsed = slugParamSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const session = await getCurrentSession();
    const petition = await getPetitionBySlug(
      getDb(),
      parsed.data,
      session?.voterId ?? null,
    );
    if (!petition) {
      return NextResponse.json({ error: "not_found" }, { status: 404 });
    }
    return NextResponse.json({ petition }, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.detail.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
