import { NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { log } from "@/lib/log";
import {
  createPetitionSchema,
  petitionListViewSchema,
} from "@/lib/petitions/rules";
import { createPetition, listPetitions } from "@/lib/petitions/service";

export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);
  const parsed = petitionListViewSchema.safeParse(
    searchParams.get("view") ?? "collecting",
  );
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const petitions = await listPetitions(getDb(), parsed.data);
    return NextResponse.json({ petitions }, { status: 200 });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.list.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const session = await getCurrentSession();
  if (!session) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const parsed = createPetitionSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  try {
    const result = await createPetition({
      db: getDb(),
      voterId: session.voterId,
      input: parsed.data,
    });

    if (!result.ok) {
      const status = result.error === "monthly_petition_limit" ? 429 : 409;
      return NextResponse.json({ error: result.error }, { status });
    }

    return NextResponse.json(
      { id: result.id, slug: result.slug, state: result.state },
      { status: 201 },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "petitions.create.failed", { reason });
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
