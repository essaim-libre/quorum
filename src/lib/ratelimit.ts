import "server-only";
import { randomBytes } from "node:crypto";
import { LRUCache } from "lru-cache";
import { now } from "@/lib/clock";
import { hmacSha256 } from "@/lib/crypto/hmac";

const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_MINUTE_MS = 60 * 1000;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

interface CounterEntry {
  count: number;
  resetAt: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

// Sel quotidien en mémoire uniquement (invariant n°2 : aucune IP stockée ni journalisée)
let dailySaltDay = "";
let dailySalt = randomBytes(32);

function getDailySalt(): Buffer {
  const today = now().toISOString().slice(0, 10);
  if (today !== dailySaltDay) {
    dailySaltDay = today;
    dailySalt = randomBytes(32);
  }
  return dailySalt;
}

export function hashIpEphemeral(ip: string): string {
  return hmacSha256(getDailySalt(), ip.trim()).toString("hex");
}

function createWindowLimiter(maxEntries: number, windowMs: number) {
  const cache = new LRUCache<string, CounterEntry>({
    max: maxEntries,
    ttl: windowMs,
  });

  return {
    consume(key: string, limit: number): RateLimitResult {
      const currentMs = now().getTime();
      const existing = cache.get(key);

      if (!existing || existing.resetAt <= currentMs) {
        cache.set(
          key,
          { count: 1, resetAt: currentMs + windowMs },
          { ttl: windowMs },
        );
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (existing.count >= limit) {
        const remainingMs = Math.max(1000, existing.resetAt - currentMs);
        return {
          allowed: false,
          retryAfterSeconds: Math.ceil(remainingMs / 1000),
        };
      }

      existing.count += 1;
      const remainingTtl = Math.max(1000, existing.resetAt - currentMs);
      cache.set(key, existing, { ttl: remainingTtl });
      return { allowed: true, retryAfterSeconds: 0 };
    },
    clear(): void {
      cache.clear();
    },
  };
}

// Limiteurs conformes aux §5.1, §11 et aux correctifs SEC-01, SEC-04, SEC-07, SEC-17
const authCodeByVoter15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const authCodeByVoter24h = createWindowLimiter(50_000, TWENTY_FOUR_HOURS_MS);
const authCodeByIp15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const authCodeGlobal15m = createWindowLimiter(4, FIFTEEN_MINUTES_MS);

const authVerifyByVoter15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const authVerifyByIp15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const authVerifyGlobal15m = createWindowLimiter(4, FIFTEEN_MINUTES_MS);

const tokenBySession1m = createWindowLimiter(20_000, ONE_MINUTE_MS);

const ballotsByIp1m = createWindowLimiter(20_000, ONE_MINUTE_MS);
const ballotsGlobal1m = createWindowLimiter(4, ONE_MINUTE_MS);
const ballotsByVote1m = createWindowLimiter(5_000, ONE_MINUTE_MS);

const petitionMutationBySession15m = createWindowLimiter(
  20_000,
  FIFTEEN_MINUTES_MS,
);
const cronByIp15m = createWindowLimiter(1_000, FIFTEEN_MINUTES_MS);

export function checkAuthCodeRateLimit(
  voterIdHex: string,
  ip: string | null,
): RateLimitResult {
  // Plafond global indépendant des en-têtes (anti mail-bombing, SEC-01)
  const globalRes = authCodeGlobal15m.consume("global", 600);
  if (!globalRes.allowed) {
    return globalRes;
  }

  const effectiveIp = ip ?? "direct";
  const ipKey = hashIpEphemeral(effectiveIp);
  const ipRes = authCodeByIp15m.consume(ipKey, 300);
  if (!ipRes.allowed) {
    return ipRes;
  }

  const voter15m = authCodeByVoter15m.consume(voterIdHex, 3);
  if (!voter15m.allowed) {
    return voter15m;
  }

  const voter24h = authCodeByVoter24h.consume(voterIdHex, 10);
  if (!voter24h.allowed) {
    return voter24h;
  }

  return { allowed: true, retryAfterSeconds: 0 };
}

export function checkAuthVerifyRateLimit(
  voterIdHex: string,
  ip: string | null,
): RateLimitResult {
  const globalRes = authVerifyGlobal15m.consume("global", 2000);
  if (!globalRes.allowed) {
    return globalRes;
  }

  const effectiveIp = ip ?? "direct";
  const ipRes = authVerifyByIp15m.consume(hashIpEphemeral(effectiveIp), 100);
  if (!ipRes.allowed) {
    return ipRes;
  }

  return authVerifyByVoter15m.consume(voterIdHex, 15);
}

export function checkTokenRateLimit(sessionHashHex: string): RateLimitResult {
  return tokenBySession1m.consume(sessionHashHex, 10);
}

export function checkBallotRateLimit(
  ip: string | null,
  voteId?: string,
): RateLimitResult {
  // Plafond global indépendant des en-têtes (SEC-01)
  const globalRes = ballotsGlobal1m.consume("global", 2000);
  if (!globalRes.allowed) {
    return globalRes;
  }

  if (voteId) {
    const voteRes = ballotsByVote1m.consume(voteId, 1200);
    if (!voteRes.allowed) {
      return voteRes;
    }
  }

  const effectiveIp = ip ?? "direct";
  return ballotsByIp1m.consume(hashIpEphemeral(effectiveIp), 600);
}

export function checkPetitionMutationRateLimit(
  sessionHashHex: string,
): RateLimitResult {
  return petitionMutationBySession15m.consume(sessionHashHex, 20);
}

export function checkCronRateLimit(ip: string | null): RateLimitResult {
  const effectiveIp = ip ?? "direct";
  return cronByIp15m.consume(hashIpEphemeral(effectiveIp), 30);
}

function getTrustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS;
  if (!raw) {
    return 0;
  }
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return Math.min(parsed, 10);
}

/**
 * Extraction sécurisée de l'IP client (SEC-01) :
 * - Si TRUSTED_PROXY_HOPS === 0 (accès direct / dev) : n'accorde AUCUNE confiance à
 *   X-Forwarded-For ni X-Real-IP (retourne "direct", impossible à contourner par rotation XFF).
 * - Si TRUSTED_PROXY_HOPS > 0 (ex. 1 derrière Scaleway) : lit l'entrée ajoutée par le proxy
 *   de confiance depuis la droite (`chain[chain.length - hops]`), jamais le premier maillon falsifiable.
 */
export function extractClientIp(
  headers: Headers,
  trustedHopsOverride?: number,
): string {
  const hops =
    trustedHopsOverride !== undefined
      ? Math.max(0, Math.min(10, Math.trunc(trustedHopsOverride)))
      : getTrustedProxyHops();

  if (hops === 0) {
    return "direct";
  }

  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const chain = forwarded
      .split(",")
      .map((item) => item.trim())
      .filter((item) => item.length > 0);
    if (chain.length >= hops) {
      const trustedIp = chain[chain.length - hops];
      if (trustedIp) {
        return trustedIp;
      }
    }
  }

  const realIp = headers.get("x-real-ip")?.trim();
  if (realIp && hops === 1) {
    return realIp;
  }

  return "direct";
}

export function resetRateLimitersForTest(): void {
  authCodeByVoter15m.clear();
  authCodeByVoter24h.clear();
  authCodeByIp15m.clear();
  authCodeGlobal15m.clear();
  authVerifyByVoter15m.clear();
  authVerifyByIp15m.clear();
  authVerifyGlobal15m.clear();
  tokenBySession1m.clear();
  ballotsByIp1m.clear();
  ballotsGlobal1m.clear();
  ballotsByVote1m.clear();
  petitionMutationBySession15m.clear();
  cronByIp15m.clear();
}
