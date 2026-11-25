import "server-only";
import { randomInt, randomUUID } from "node:crypto";
import { and, desc, eq, gt, inArray, lt } from "drizzle-orm";
import { isAdminVoterId } from "@/lib/auth/admin";
import { parseAndNormalizeStudentEmail } from "@/lib/auth/email";
import { createSessionRecord } from "@/lib/auth/session";
import { now } from "@/lib/clock";
import {
  computeOtpHash,
  computeVoterId,
  constantTimeEqual,
} from "@/lib/crypto/hmac";
import type { Database } from "@/lib/db/client";
import { otpCodes, voters } from "@/lib/db/schema";
import { getEnv, isLocalhostUrl } from "@/lib/env";
import { log } from "@/lib/log";
import { getMailDriver } from "@/lib/mail";
import type { MailDriver } from "@/lib/mail/types";
import {
  checkAuthCodeRateLimit,
  checkAuthVerifyRateLimit,
} from "@/lib/ratelimit";

export const OTP_TTL_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
const MAX_ACTIVE_OTP_CANDIDATES = 10;

export type RequestOtpResult =
  | { readonly ok: true; readonly devCode?: string }
  | { readonly ok: false; readonly error: "invalid_email" }
  | {
      readonly ok: false;
      readonly error: "rate_limited";
      readonly retryAfterSeconds: number;
    };

export type VerifyOtpResult =
  | {
      readonly ok: true;
      readonly rawToken: string;
      readonly isAdmin: boolean;
      readonly expiresAt: Date;
    }
  | {
      readonly ok: false;
      readonly error: "invalid_email" | "invalid_code";
    }
  | {
      readonly ok: false;
      readonly error: "rate_limited";
      readonly retryAfterSeconds: number;
    };

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export async function requestOtpCode(params: {
  readonly db: Database;
  readonly email: string;
  readonly ip: string | null;
  readonly mailDriver?: MailDriver;
}): Promise<RequestOtpResult> {
  const env = getEnv();
  const normalizedEmail = parseAndNormalizeStudentEmail(
    params.email,
    env.ALLOWED_EMAIL_DOMAIN,
  );
  if (!normalizedEmail) {
    return { ok: false, error: "invalid_email" };
  }

  const voterId = computeVoterId(env.K_ID, normalizedEmail);
  const rateLimit = checkAuthCodeRateLimit(voterId.toString("hex"), params.ip);
  if (!rateLimit.allowed) {
    log("warn", "auth.code.rate_limited");
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: rateLimit.retryAfterSeconds,
    };
  }

  const otpId = randomUUID();
  const code = generateOtpCode();
  const codeHash = computeOtpHash(env.K_OTP, otpId, code);
  const expiresAt = new Date(now().getTime() + OTP_TTL_MS);

  await params.db.insert(otpCodes).values({
    id: otpId,
    voterId,
    codeHash,
    expiresAt,
    attempts: 0,
    consumed: false,
  });

  const driver = params.mailDriver ?? getMailDriver();
  await driver.sendOtpCode({ to: normalizedEmail, code });

  log("info", "auth.code.sent");
  // SEC-14 : devCode strictement limité à development + console + localhost
  const isLocalConsoleDev =
    env.NODE_ENV === "development" &&
    env.MAIL_DRIVER === "console" &&
    isLocalhostUrl(env.APP_URL);
  return isLocalConsoleDev ? { ok: true, devCode: code } : { ok: true };
}

export async function verifyOtpCode(params: {
  readonly db: Database;
  readonly email: string;
  readonly code: string;
  readonly ip?: string | null;
}): Promise<VerifyOtpResult> {
  const env = getEnv();
  const normalizedEmail = parseAndNormalizeStudentEmail(
    params.email,
    env.ALLOWED_EMAIL_DOMAIN,
  );
  if (!normalizedEmail) {
    return { ok: false, error: "invalid_email" };
  }

  const voterId = computeVoterId(env.K_ID, normalizedEmail);

  // SEC-04 : rate limit dédié sur /api/auth/verify (indépendant du quota d'envoi d'email)
  const verifyRateLimit = checkAuthVerifyRateLimit(
    voterId.toString("hex"),
    params.ip ?? null,
  );
  if (!verifyRateLimit.allowed) {
    log("warn", "auth.verify.rate_limited");
    return {
      ok: false,
      error: "rate_limited",
      retryAfterSeconds: verifyRateLimit.retryAfterSeconds,
    };
  }

  const currentNow = now();

  return params.db.transaction(async (tx) => {
    // SEC-02 : accepte N'IMPORTE QUEL code actif (non consommé, non expiré, < 5 essais)
    // afin qu'un attaquant demandant de nouveaux codes ne puisse pas invalider celui de la victime.
    const candidates = await tx
      .select()
      .from(otpCodes)
      .where(
        and(
          eq(otpCodes.voterId, voterId),
          eq(otpCodes.consumed, false),
          gt(otpCodes.expiresAt, currentNow),
          lt(otpCodes.attempts, OTP_MAX_ATTEMPTS),
        ),
      )
      .orderBy(desc(otpCodes.expiresAt))
      .limit(MAX_ACTIVE_OTP_CANDIDATES)
      .for("update");

    if (candidates.length === 0) {
      log("info", "auth.verify.missing_or_expired");
      return { ok: false, error: "invalid_code" } as const;
    }

    // Comparaison à temps constant sur l'ensemble des codes actifs
    let matchedId: string | null = null;
    for (const candidate of candidates) {
      const expectedHash = computeOtpHash(env.K_OTP, candidate.id, params.code);
      if (constantTimeEqual(candidate.codeHash, expectedHash)) {
        matchedId = candidate.id;
      }
    }

    if (!matchedId) {
      let maxNextAttempts = 0;
      for (const candidate of candidates) {
        const nextAttempts = candidate.attempts + 1;
        if (nextAttempts > maxNextAttempts) {
          maxNextAttempts = nextAttempts;
        }
        await tx
          .update(otpCodes)
          .set({
            attempts: nextAttempts,
            consumed: nextAttempts >= OTP_MAX_ATTEMPTS,
          })
          .where(eq(otpCodes.id, candidate.id));
      }
      log("info", "auth.verify.mismatch", { attempts: maxNextAttempts });
      return { ok: false, error: "invalid_code" } as const;
    }

    // Consomme les codes actifs du votant à la connexion réussie
    await tx
      .update(otpCodes)
      .set({ consumed: true })
      .where(
        inArray(
          otpCodes.id,
          candidates.map((c) => c.id),
        ),
      );

    await tx.insert(voters).values({ id: voterId }).onConflictDoNothing();

    const isAdmin = isAdminVoterId(voterId);
    const { rawToken, expiresAt } = await createSessionRecord(
      tx,
      voterId,
      isAdmin,
    );

    log("info", "auth.verify.success", { isAdmin });
    return {
      ok: true,
      rawToken,
      isAdmin,
      expiresAt,
    } as const;
  });
}
