import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import { signPetition } from "@/lib/petitions/service";

const slugParamSchema = z
  .string()
  .trim()
  .min(1)
  .max(120)
  .regex(/^[a-z0-9-]+$/);

export async function POST(
  _request: Request,
  context: { params: Promise<{ slug: string }> },
): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const parsed = slugParamSchema.safeParse(slug);
  if (!parsed.success) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  try {
    const result = await signPetition({
      db: getDb(),
      slug: parsed.data,
      voterId: session.voterId,
    });
    if (!result.ok) {
      const status = result.error === "not_found" ? 404 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json(result, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.sign.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
