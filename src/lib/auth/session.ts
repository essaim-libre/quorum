import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import type { NextResponse } from "next/server";
import { now } from "@/lib/clock";
import { sha256 } from "@/lib/crypto/hmac";
import { type Database, getDb } from "@/lib/db/client";
import { sessions } from "@/lib/db/schema";

export const SESSION_COOKIE_NAME = "__Host-quorum_session";
export const SESSION_TTL_SECONDS = 30 * 24 * 60 * 60;
const SESSION_TTL_MS = SESSION_TTL_SECONDS * 1000;

export interface SessionData {
  readonly voterId: Buffer;
  readonly isAdmin: boolean;
  readonly expiresAt: Date;
  readonly tokenHashHex: string;
}

export function generateSessionToken(): {
  rawToken: string;
  tokenHash: Buffer;
} {
  const rawBytes = randomBytes(32);
  return {
    rawToken: rawBytes.toString("base64url"),
    tokenHash: sha256(rawBytes),
  };
}

export function hashSessionToken(rawToken: string): Buffer | null {
  try {
    const rawBytes = Buffer.from(rawToken, "base64url");
    if (rawBytes.length !== 32) {
      return null;
    }
    return sha256(rawBytes);
  } catch {
    return null;
  }
}

export async function createSessionRecord(
  db: Pick<Database, "insert">,
  voterId: Buffer,
  isAdmin: boolean,
): Promise<{ rawToken: string; expiresAt: Date }> {
  const { rawToken, tokenHash } = generateSessionToken();
  const expiresAt = new Date(now().getTime() + SESSION_TTL_MS);

  await db.insert(sessions).values({
    tokenHash,
    voterId,
    isAdmin,
    expiresAt,
  });

  return { rawToken, expiresAt };
}

export async function findActiveSession(
  db: Database,
  rawToken: string,
): Promise<SessionData | null> {
  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash) {
    return null;
  }

  const currentNow = now();
  const rows = await db
    .select({
      voterId: sessions.voterId,
      isAdmin: sessions.isAdmin,
      expiresAt: sessions.expiresAt,
    })
    .from(sessions)
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, currentNow),
      ),
    )
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  return {
    voterId: row.voterId,
    isAdmin: row.isAdmin,
    expiresAt: row.expiresAt,
    tokenHashHex: tokenHash.toString("hex"),
  };
}

export async function deleteSessionByToken(
  db: Database,
  rawToken: string,
): Promise<void> {
  const tokenHash = hashSessionToken(rawToken);
  if (!tokenHash) {
    return;
  }
  await db.delete(sessions).where(eq(sessions.tokenHash, tokenHash));
}

export function setSessionCookieOnResponse(
  response: NextResponse,
  rawToken: string,
): void {
  response.cookies.set(SESSION_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export function clearSessionCookieOnResponse(response: NextResponse): void {
  response.cookies.set(SESSION_COOKIE_NAME, "", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function getCurrentSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const rawToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!rawToken) {
    return null;
  }
  return findActiveSession(getDb(), rawToken);
}
