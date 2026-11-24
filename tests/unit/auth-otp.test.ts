import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetAdminCacheForTest } from "@/lib/auth/admin";
import { requestOtpCode, verifyOtpCode } from "@/lib/auth/otp";
import {
  deleteSessionByToken,
  findActiveSession,
} from "@/lib/auth/session";
import { resetTestClock, setTestClock } from "@/lib/clock";
import { computeVoterId } from "@/lib/crypto/hmac";
import * as schema from "@/lib/db/schema";
import { getEnv, resetEnvCache } from "@/lib/env";
import { setLogSink } from "@/lib/log";
import type { MailDriver } from "@/lib/mail/types";
import { resetRateLimitersForTest } from "@/lib/ratelimit";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

const TEST_ADMIN_EMAIL = `test.admin.${randomUUID().slice(0, 8)}@etu.u-bordeaux.fr`;

describe("authentification OTP et sessions (§5, §13)", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });
  const createdVoterIds: Buffer[] = [];
  const emittedLogs: string[] = [];
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await pool.query("SELECT 1");

    const testEnvValues: Record<string, string> = {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL,
      K_ID: randomBytes(32).toString("base64"),
      K_EMARG: randomBytes(32).toString("base64"),
      K_SIG: randomBytes(32).toString("base64"),
      K_OTP: randomBytes(32).toString("base64"),
      MASTER_KEY: randomBytes(32).toString("base64"),
      ALLOWED_EMAIL_DOMAIN: "etu.u-bordeaux.fr",
      ADMIN_EMAILS: TEST_ADMIN_EMAIL,
      ELECTORATE_SIZE: "56000",
      PETITION_THRESHOLD: "300",
      PETITION_COLLECT_DAYS: "7",
      MAIL_DRIVER: "console",
      MAIL_FROM: "Quorum <code@exemple.fr>",
    };

    for (const [key, value] of Object.entries(testEnvValues)) {
      savedEnv[key] = process.env[key];
      process.env[key] = value;
    }

    resetEnvCache();
    resetAdminCacheForTest();
    setLogSink((line) => {
      emittedLogs.push(line);
    });
  });

  afterEach(() => {
    resetTestClock();
    resetRateLimitersForTest();
  });

  afterAll(async () => {
    setLogSink(null);
    for (const voterId of createdVoterIds) {
      await db.delete(schema.otpCodes).where(eq(schema.otpCodes.voterId, voterId));
      await db.delete(schema.sessions).where(eq(schema.sessions.voterId, voterId));
      await db.delete(schema.voters).where(eq(schema.voters.id, voterId));
    }
    await pool.end();

    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
    resetEnvCache();
    resetAdminCacheForTest();
  });

  function makeMemoryMailDriver(): {
    driver: MailDriver;
    codes: string[];
  } {
    const codes: string[] = [];
    return {
      codes,
      driver: {
        async sendOtpCode({ code }) {
          codes.push(code);
        },
      },
    };
  }

  it("génère un code OTP, crée un voter et une session valide 30 jours, puis déconnecte", async () => {
    const baseTime = new Date("2026-11-24T14:00:00.000Z").getTime();
    let currentTime = baseTime;
    setTestClock(() => new Date(currentTime));

    const email = `test.etudiant.${randomUUID().slice(0, 8)}@etu.u-bordeaux.fr`;
    const voterId = computeVoterId(getEnv().K_ID, email);
    createdVoterIds.push(voterId);

    const { driver, codes } = makeMemoryMailDriver();

    const reqResult = await requestOtpCode({
      db,
      email: `  ${email.toUpperCase()}  `,
      ip: "198.51.100.10",
      mailDriver: driver,
    });
    expect(reqResult).toEqual({ ok: true });
    expect(codes).toHaveLength(1);
    const otpCode = codes[0];
    expect(otpCode).toMatch(/^\d{6}$/);
    if (!otpCode) return;

    const verifyResult = await verifyOtpCode({
      db,
      email,
      code: otpCode,
    });
    expect(verifyResult.ok).toBe(true);
    if (!verifyResult.ok) return;
    expect(verifyResult.isAdmin).toBe(false);

    // La réutilisation du même code échoue
    const replayResult = await verifyOtpCode({
      db,
      email,
      code: otpCode,
    });
    expect(replayResult).toEqual({ ok: false, error: "invalid_code" });

    // Session active immédiatement
    const active = await findActiveSession(db, verifyResult.rawToken);
    expect(active).not.toBeNull();
    expect(active?.isAdmin).toBe(false);
    expect(active?.voterId.equals(voterId)).toBe(true);

    // Session toujours active après 29 jours, expirée après 30 jours + 1 s
    currentTime = baseTime + 29 * 24 * 60 * 60 * 1000;
    expect(await findActiveSession(db, verifyResult.rawToken)).not.toBeNull();

    currentTime = baseTime + 30 * 24 * 60 * 60 * 1000 + 1000;
    expect(await findActiveSession(db, verifyResult.rawToken)).toBeNull();

    // Déconnexion supprime la session en base
    currentTime = baseTime;
    await deleteSessionByToken(db, verifyResult.rawToken);
    expect(await findActiveSession(db, verifyResult.rawToken)).toBeNull();
  });

  it("refuse un code expiré au bout de 10 minutes", async () => {
    const baseTime = new Date("2026-11-24T15:00:00.000Z").getTime();
    let currentTime = baseTime;
    setTestClock(() => new Date(currentTime));

    const email = `test.exp.${randomUUID().slice(0, 8)}@etu.u-bordeaux.fr`;
    createdVoterIds.push(computeVoterId(getEnv().K_ID, email));

    const { driver, codes } = makeMemoryMailDriver();
    await requestOtpCode({ db, email, ip: null, mailDriver: driver });
    const otpCode = codes[0] ?? "";

    // Avance de 10 minutes + 1 seconde
    currentTime = baseTime + 10 * 60 * 1000 + 1000;
    const result = await verifyOtpCode({ db, email, code: otpCode });
    expect(result).toEqual({ ok: false, error: "invalid_code" });
  });

  it("invalide le code après 5 essais erronés", async () => {
    setTestClock(new Date("2026-11-24T16:00:00.000Z"));

    const email = `test.attempts.${randomUUID().slice(0, 8)}@etu.u-bordeaux.fr`;
    createdVoterIds.push(computeVoterId(getEnv().K_ID, email));

    const { driver, codes } = makeMemoryMailDriver();
    await requestOtpCode({ db, email, ip: null, mailDriver: driver });
    const validCode = codes[0] ?? "000000";
    const wrongCode = validCode === "000000" ? "111111" : "000000";

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const res = await verifyOtpCode({ db, email, code: wrongCode });
      expect(res).toEqual({ ok: false, error: "invalid_code" });
    }

    // Même le bon code est désormais refusé car le code a été consommé au 5e échec
    const sixthRes = await verifyOtpCode({ db, email, code: validCode });
    expect(sixthRes).toEqual({ ok: false, error: "invalid_code" });
  });

  it("attribue is_admin = true aux adresses de ADMIN_EMAILS", async () => {
    setTestClock(new Date("2026-11-24T17:00:00.000Z"));
    createdVoterIds.push(computeVoterId(getEnv().K_ID, TEST_ADMIN_EMAIL));

    const { driver, codes } = makeMemoryMailDriver();
    await requestOtpCode({
      db,
      email: TEST_ADMIN_EMAIL,
      ip: null,
      mailDriver: driver,
    });
    const code = codes[0] ?? "";

    const verified = await verifyOtpCode({
      db,
      email: TEST_ADMIN_EMAIL,
      code,
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;
    expect(verified.isAdmin).toBe(true);
  });

  it("n'émet aucun email en clair dans les logs produits pendant toute la suite (invariant n°1)", () => {
    expect(emittedLogs.length).toBeGreaterThan(0);
    for (const line of emittedLogs) {
      expect(line).not.toContain("@");
    }
  });
});
