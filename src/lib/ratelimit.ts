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
        cache.set(key, { count: 1, resetAt: currentMs + windowMs }, { ttl: windowMs });
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

// Limiteurs conformes aux §5.1 et §11
const authCodeByVoter15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const authCodeByVoter24h = createWindowLimiter(50_000, TWENTY_FOUR_HOURS_MS);
const authCodeByIp15m = createWindowLimiter(20_000, FIFTEEN_MINUTES_MS);
const tokenBySession1m = createWindowLimiter(20_000, ONE_MINUTE_MS);
const ballotsByIp1m = createWindowLimiter(20_000, ONE_MINUTE_MS);

export function checkAuthCodeRateLimit(
  voterIdHex: string,
  ip: string | null,
): RateLimitResult {
  if (ip) {
    const ipKey = hashIpEphemeral(ip);
    const ipRes = authCodeByIp15m.consume(ipKey, 300);
    if (!ipRes.allowed) {
      return ipRes;
    }
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

export function checkTokenRateLimit(sessionHashHex: string): RateLimitResult {
  return tokenBySession1m.consume(sessionHashHex, 10);
}

export function checkBallotRateLimit(ip: string | null): RateLimitResult {
  if (!ip) {
    return { allowed: true, retryAfterSeconds: 0 };
  }
  return ballotsByIp1m.consume(hashIpEphemeral(ip), 600);
}

export function extractClientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || null;
}

export function resetRateLimitersForTest(): void {
  authCodeByVoter15m.clear();
  authCodeByVoter24h.clear();
  authCodeByIp15m.clear();
  tokenBySession1m.clear();
  ballotsByIp1m.clear();
}
