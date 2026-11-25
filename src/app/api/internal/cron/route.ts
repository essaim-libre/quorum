import { NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/crypto/hmac";
import { getDb, getPool } from "@/lib/db/client";
import { getEnv } from "@/lib/env";
import { PRIVATE_NO_STORE_HEADERS } from "@/lib/http/csrf";
import { log } from "@/lib/log";
import {
  processDuePetitions,
  purgeEndedPetitionsPersonalTags,
} from "@/lib/petitions/service";
import { checkCronRateLimit, extractClientIp } from "@/lib/ratelimit";
import { closeAllDueVotes, runScheduledPurges } from "@/lib/votes/close";

function extractCronSecret(headers: Headers): string | null {
  const authHeader = headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }
  const custom = headers.get("x-cron-secret")?.trim();
  return custom || null;
}

export async function POST(request: Request): Promise<NextResponse> {
  const rateLimit = checkCronRateLimit(extractClientIp(request.headers));
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "rate_limited" },
      {
        status: 429,
        headers: {
          ...PRIVATE_NO_STORE_HEADERS,
          "Retry-After": String(rateLimit.retryAfterSeconds),
        },
      },
    );
  }

  const env = getEnv();
  if (!env.CRON_SECRET) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  const provided = extractCronSecret(request.headers);
  if (
    !provided ||
    !constantTimeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(env.CRON_SECRET, "utf8"),
    )
  ) {
    return NextResponse.json(
      { error: "unauthorized" },
      { status: 401, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }

  try {
    const db = getDb();
    const pool = getPool();
    const { closedCount } = await closeAllDueVotes(db, pool);
    const petitionCycles = await processDuePetitions(db);
    const purges = await runScheduledPurges(db);
    const petitionPurges = await purgeEndedPetitionsPersonalTags(db);

    log("info", "cron.completed", {
      closedCount,
      expiredPetitions: petitionCycles.expiredCount,
      autoApprovedPetitions: petitionCycles.autoApprovedCount,
      purgedOtpCodes: purges.purgedOtpCodes,
      purgedSessions: purges.purgedSessions,
      purgedPetitions: petitionPurges.purgedPetitions,
    });

    return NextResponse.json(
      {
        ok: true,
        closedVotes: closedCount,
        expiredPetitions: petitionCycles.expiredCount,
        autoApprovedPetitions: petitionCycles.autoApprovedCount,
        purgedOtpCodes: purges.purgedOtpCodes,
        purgedSessions: purges.purgedSessions,
        purgedPetitions: petitionPurges.purgedPetitions,
      },
      { status: 200, headers: PRIVATE_NO_STORE_HEADERS },
    );
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : "unknown";
    log("error", "cron.failed", { reason });
    return NextResponse.json(
      { error: "internal_error" },
      { status: 500, headers: PRIVATE_NO_STORE_HEADERS },
    );
  }
}
