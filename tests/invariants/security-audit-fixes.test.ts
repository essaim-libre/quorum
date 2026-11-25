import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { resetAdminCacheForTest } from "@/lib/auth/admin";
import { isValidStudentEmail } from "@/lib/auth/email";
import { requestOtpCode, verifyOtpCode } from "@/lib/auth/otp";
import {
  ADMIN_SESSION_TTL_SECONDS,
  findActiveSession,
} from "@/lib/auth/session";
import { resetTestClock, setTestClock } from "@/lib/clock";
import {
  blindToken,
  buildVoteTokenMessage,
  importVotePublicKey,
  prepareToken,
} from "@/lib/crypto/blind";
import { computeVoterId } from "@/lib/crypto/hmac";
import * as schema from "@/lib/db/schema";
import { getEnv, parseEnv, resetEnvCache } from "@/lib/env";
import { readJsonBodyWithLimit } from "@/lib/http/body";
import { isTrustedSameOriginRequest } from "@/lib/http/csrf";
import { listPublicJournal } from "@/lib/journal";
import { setLogSink } from "@/lib/log";
import type { MailDriver } from "@/lib/mail/types";
import {
  addContreProposal,
  createPetition,
  MAX_CONTRE_PER_VOTER_PER_PETITION,
} from "@/lib/petitions/service";
import {
  checkAuthCodeRateLimit,
  checkBallotRateLimit,
  extractClientIp,
  resetRateLimitersForTest,
} from "@/lib/ratelimit";
import { closeVoteIfDue, getClosedVoteReportBySlug } from "@/lib/votes/close";
import {
  cancelPublishedVote,
  createVoteDraft,
  getPublishedVoteBySlug,
  publishVoteDraft,
} from "@/lib/votes/service";
import { issueBlindToken } from "@/lib/votes/token";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

function makeValidEnv(overrides: Record<string, string> = {}) {
  return {
    NODE_ENV: "development",
    APP_URL: "http://localhost:3000",
    DATABASE_URL,
    K_ID: randomBytes(32).toString("base64"),
    K_EMARG: randomBytes(32).toString("base64"),
    K_SIG: randomBytes(32).toString("base64"),
    K_OTP: randomBytes(32).toString("base64"),
    MASTER_KEY: randomBytes(32).toString("base64"),
    ALLOWED_EMAIL_DOMAIN: "etu.u-bordeaux.fr",
    ADMIN_EMAILS: "",
    ELECTORATE_SIZE: "56000",
    PETITION_THRESHOLD: "300",
    PETITION_COLLECT_DAYS: "7",
    MAIL_DRIVER: "console",
    MAIL_FROM: "Quorum <code@exemple.fr>",
    ...overrides,
  };
}

describe("correctifs d'audit offensif — tests unitaires (SEC-01, SEC-03, SEC-10, SEC-14, SEC-15)", () => {
  afterEach(() => {
    resetRateLimitersForTest();
    resetTestClock();
  });

  it("SEC-01 : ignore X-Forwarded-For sans proxy de confiance et lit depuis la droite avec TRUSTED_PROXY_HOPS > 0", () => {
    const spoofedHeaders = new Headers({
      "x-forwarded-for": "1.2.3.4, 198.51.100.99",
      "x-real-ip": "5.6.7.8",
    });

    // Sans proxy de confiance (hops = 0) : la rotation XFF ne change jamais le seau
    expect(extractClientIp(spoofedHeaders, 0)).toBe("direct");

    // Avec 1 proxy de confiance (ex. Scaleway) : lit l'IP ajoutée par le proxy (à droite), pas 1.2.3.4
    expect(extractClientIp(spoofedHeaders, 1)).toBe("198.51.100.99");

    // Avec 2 proxies de confiance : lit le 2e depuis la droite
    expect(extractClientIp(spoofedHeaders, 2)).toBe("1.2.3.4");

    // Plafond global ballots (indépendant de l'IP) et plafond IP non contournable par rotation XFF
    setTestClock(new Date("2026-11-25T10:00:00.000Z"));
    for (let i = 0; i < 600; i += 1) {
      const ip = extractClientIp(
        new Headers({ "x-forwarded-for": `198.51.100.${i % 255}` }),
        0,
      );
      expect(checkBallotRateLimit(ip).allowed).toBe(true);
    }
    const blocked = checkBallotRateLimit(
      extractClientIp(new Headers({ "x-forwarded-for": "203.0.113.200" }), 0),
    );
    expect(blocked.allowed).toBe(false);

    // Plafond global auth/code anti mail-bombing (600 / 15 min même avec IPs différentes)
    for (let i = 0; i < 600; i += 1) {
      expect(
        checkAuthCodeRateLimit(`voter-${i}`, `198.51.${Math.floor(i / 250)}.${i % 250}`).allowed,
      ).toBe(true);
    }
    expect(checkAuthCodeRateLimit("voter-601", "203.0.113.1").allowed).toBe(
      false,
    );
  });

  it("SEC-03 : rejette un corps JSON trop volumineux en 413 (Content-Length et flux)", async () => {
    const bigPayload = JSON.stringify({ data: "x".repeat(5000) });

    // Via Content-Length
    const reqWithLength = new Request("http://localhost:3000/api/ballots", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": String(Buffer.byteLength(bigPayload, "utf8")),
      },
      body: bigPayload,
    });
    const res1 = await readJsonBodyWithLimit(reqWithLength, { maxBytes: 4096 });
    expect(res1).toEqual({
      ok: false,
      status: 413,
      error: "payload_too_large",
    });

    // Sans Content-Length (flux chunked)
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(bigPayload));
        controller.close();
      },
    });
    const reqStream = new Request("http://localhost:3000/api/ballots", {
      method: "POST",
      body: stream,
      // @ts-expect-error duplex requis par undici sur ReadableStream
      duplex: "half",
    });
    const res2 = await readJsonBodyWithLimit(reqStream, { maxBytes: 4096 });
    expect(res2).toEqual({
      ok: false,
      status: 413,
      error: "payload_too_large",
    });
  });

  it("SEC-10 : refuse les variantes d'email à points consécutifs ou en bordure", () => {
    expect(isValidStudentEmail("prenom.nom@etu.u-bordeaux.fr")).toBe(true);
    expect(isValidStudentEmail("a..b@etu.u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail("a.@etu.u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail(".a@etu.u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail("a-@etu.u-bordeaux.fr")).toBe(false);
  });

  it("SEC-14 : refuse MAIL_DRIVER=console hors localhost même hors production", () => {
    expect(() =>
      parseEnv(
        makeValidEnv({
          NODE_ENV: "development",
          APP_URL: "https://quorum.u-bordeaux.fr",
          MAIL_DRIVER: "console",
        }),
      ),
    ).toThrow();
  });

  it("SEC-15 : bloque les mutations cross-site via Origin et Sec-Fetch-Site", () => {
    const saved = process.env.APP_URL;
    process.env.APP_URL = "http://localhost:3000";
    resetEnvCache();

    try {
      const crossSite = new Request("http://localhost:3000/api/admin/votes", {
        method: "POST",
        headers: {
          "sec-fetch-site": "cross-site",
          origin: "https://evil.example",
        },
      });
      expect(isTrustedSameOriginRequest(crossSite)).toBe(false);

      const foreignOrigin = new Request("http://localhost:3000/api/admin/votes", {
        method: "POST",
        headers: {
          origin: "https://evil.example",
        },
      });
      expect(isTrustedSameOriginRequest(foreignOrigin)).toBe(false);

      const sameOrigin = new Request("http://localhost:3000/api/admin/votes", {
        method: "POST",
        headers: {
          "sec-fetch-site": "same-origin",
          origin: "http://localhost:3000",
        },
      });
      expect(isTrustedSameOriginRequest(sameOrigin)).toBe(true);
    } finally {
      if (saved === undefined) {
        delete process.env.APP_URL;
      } else {
        process.env.APP_URL = saved;
      }
      resetEnvCache();
    }
  });
});

describe("correctifs d'audit offensif — invariants PostgreSQL (SEC-02, SEC-04, SEC-05, SEC-07, SEC-08, SEC-09, SEC-11)", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });
  const savedEnv: Record<string, string | undefined> = {};
  const createdVoterIds: Buffer[] = [];
  const createdOpenVoteIds: string[] = [];

  const testAdminEmail = `test.sec.admin.${randomUUID().slice(0, 6)}@etu.u-bordeaux.fr`;

  beforeAll(async () => {
    await pool.query("SELECT 1");

    const envVars = makeValidEnv({
      NODE_ENV: "test",
      ADMIN_EMAILS: testAdminEmail,
    });
    for (const [k, v] of Object.entries(envVars)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }
    resetEnvCache();
    resetAdminCacheForTest();
    setLogSink(() => {});
  });

  afterEach(() => {
    resetRateLimitersForTest();
    resetTestClock();
  });

  afterAll(async () => {
    for (const voteId of createdOpenVoteIds) {
      await cancelPublishedVote(db, voteId, {
        reason: "Nettoyage automatique test sécurité",
      }).catch(() => {});
    }
    for (const voterId of createdVoterIds) {
      await db.delete(schema.otpCodes).where(eq(schema.otpCodes.voterId, voterId));
      await db.delete(schema.sessions).where(eq(schema.sessions.voterId, voterId));
      await db.delete(schema.voters).where(eq(schema.voters.id, voterId));
    }
    setLogSink(null);
    await pool.end();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    resetEnvCache();
    resetAdminCacheForTest();
  });

  it("SEC-02 & SEC-04 : un code OTP plus récent n'invalide pas le précédent et /verify est rate-limité", async () => {
    const email = `test.sec02.${randomUUID().slice(0, 6)}@etu.u-bordeaux.fr`;
    createdVoterIds.push(computeVoterId(getEnv().K_ID, email));

    const sentCodes: string[] = [];
    const driver: MailDriver = {
      async sendOtpCode({ code }) {
        sentCodes.push(code);
      },
    };

    // Victime demande son code, puis un attaquant en redemande deux autres
    await requestOtpCode({ db, email, ip: "direct", mailDriver: driver });
    await requestOtpCode({ db, email, ip: "direct", mailDriver: driver });
    await requestOtpCode({ db, email, ip: "direct", mailDriver: driver });
    expect(sentCodes).toHaveLength(3);

    // Le 1er code reçu par la victime reste parfaitement valide !
    const firstCode = sentCodes[0] ?? "";
    const okRes = await verifyOtpCode({ db, email, code: firstCode, ip: "direct" });
    expect(okRes.ok).toBe(true);

    // Rate limit dédié sur verifyOtpCode (15 essais / 15 min par voterId)
    const emailRl = `test.sec04.${randomUUID().slice(0, 6)}@etu.u-bordeaux.fr`;
    createdVoterIds.push(computeVoterId(getEnv().K_ID, emailRl));
    for (let i = 0; i < 15; i += 1) {
      const r = await verifyOtpCode({ db, email: emailRl, code: "000000", ip: "direct" });
      expect(r.ok).toBe(false);
      if (!r.ok) {
        expect(r.error).toBe("invalid_code");
      }
    }
    const sixteenth = await verifyOtpCode({
      db,
      email: emailRl,
      code: "000000",
      ip: "direct",
    });
    expect(sixteenth.ok).toBe(false);
    if (!sixteenth.ok) {
      expect(sixteenth.error).toBe("rate_limited");
    }
  });

  it("SEC-08 : recalcule isAdmin dynamiquement et limite la session admin à 24 h", async () => {
    createdVoterIds.push(computeVoterId(getEnv().K_ID, testAdminEmail));
    const codes: string[] = [];
    const driver: MailDriver = {
      async sendOtpCode({ code }) {
        codes.push(code);
      },
    };

    const baseMs = new Date("2026-11-25T10:00:00.000Z").getTime();
    setTestClock(() => new Date(baseMs));

    await requestOtpCode({ db, email: testAdminEmail, ip: "direct", mailDriver: driver });
    const verified = await verifyOtpCode({
      db,
      email: testAdminEmail,
      code: codes[0] ?? "",
      ip: "direct",
    });
    expect(verified.ok).toBe(true);
    if (!verified.ok) return;

    expect(verified.isAdmin).toBe(true);
    expect(verified.expiresAt.getTime() - baseMs).toBe(
      ADMIN_SESSION_TTL_SECONDS * 1000,
    );

    const activeBefore = await findActiveSession(db, verified.rawToken);
    expect(activeBefore?.isAdmin).toBe(true);

    // Retrait de ADMIN_EMAILS -> révocation immédiate des droits admin sur la session existante
    process.env.ADMIN_EMAILS = "";
    resetEnvCache();
    resetAdminCacheForTest();

    const activeAfter = await findActiveSession(db, verified.rawToken);
    expect(activeAfter).not.toBeNull();
    expect(activeAfter?.isAdmin).toBe(false);

    // Restaure ADMIN_EMAILS
    process.env.ADMIN_EMAILS = testAdminEmail;
    resetEnvCache();
    resetAdminCacheForTest();
  });

  it("SEC-05 : bloque la clôture et consigne une alerte publique si bulletins > jetons émis", async () => {
    const draft = await createVoteDraft(db, {
      question: `Test intégrité SEC-05 (${randomUUID().slice(0, 6)}) ?`,
      options: ["Oui", "Non"],
      statusNote: "Consultatif",
      originDetail: "Test SEC-05",
      argumentPour: "Argument.",
      argumentPourAuthor: "Test",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });

    const pastOpen = new Date(Date.now() - 25 * 3600 * 1000);
    const soonClose = new Date(Date.now() + 2 * 1000);
    const pub = await publishVoteDraft(db, draft.id, {
      opensAt: pastOpen,
      closesAt: soonClose,
    });
    expect(pub.ok).toBe(true);

    const detail = await getPublishedVoteBySlug(db, draft.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;

    const firstOpt = detail.vote.options[0];
    if (!firstOpt) return;

    // Simule un bourrage direct (1 bulletin en base pour 0 jeton émis dans emargement)
    await db.insert(schema.ballots).values({
      voteId: draft.id,
      tokenHash: randomBytes(32),
      optionId: firstOpt.id,
      revision: 1,
    });

    // Attend la clôture réelle (2 s)
    await new Promise((resolve) => setTimeout(resolve, 2500));

    const closeRes = await closeVoteIfDue(db, pool, draft.id, {
      skipVacuum: true,
    });
    expect(closeRes.closed).toBe(false);
    expect(closeRes.integrityViolation).toBe(true);

    // Aucune ligne results ne doit avoir été publiée, et la clé privée est effacée
    const resultRows = await db
      .select()
      .from(schema.results)
      .where(eq(schema.results.voteId, draft.id));
    expect(resultRows).toHaveLength(0);

    const voteRow = (
      await db
        .select({ privateKeyEnc: schema.votes.privateKeyEnc })
        .from(schema.votes)
        .where(eq(schema.votes.id, draft.id))
        .limit(1)
    )[0];
    expect(voteRow?.privateKeyEnc).toBeNull();

    // Le rapport de résultats refuse de publier
    const report = await getClosedVoteReportBySlug(db, pool, draft.slug);
    expect(report).toEqual({ ok: false, error: "integrity_violation" });

    // Incident consigné dans le journal public
    const journal = await listPublicJournal(db, { limit: 30, targetType: "vote" });
    expect(
      journal.some(
        (entry) =>
          entry.targetId === draft.id &&
          entry.action === "vote.integrity_alert",
      ),
    ).toBe(true);
  });

  it("SEC-07 & SEC-09 : empêche les pétitions actives concurrentes et plafonne les propositions Contre", async () => {
    const authorId = randomBytes(32);
    const makeInput = (tag: string) => ({
      question: `Pétition concurrente ${tag} (${randomUUID().slice(0, 6)}) ?`,
      options: ["Pour", "Contre"],
      argumentPour: "Argument de test pour vérifier la concurrence.",
      argumentPourAuthor: "Collectif test",
      requestedDurationHours: 72,
      isAgDecision: false,
      originDetail: null,
    });

    // Deux créations simultanées : exactement 1 réussit, 1 échoue en active_petition_exists
    const [r1, r2] = await Promise.all([
      createPetition({ db, voterId: authorId, input: makeInput("A") }),
      createPetition({ db, voterId: authorId, input: makeInput("B") }),
    ]);

    const successes = [r1, r2].filter((r) => r.ok);
    const failures = [r1, r2].filter((r) => !r.ok);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (failures[0] && !failures[0].ok) {
      expect(failures[0].error).toBe("active_petition_exists");
    }

    const active = successes[0];
    if (!active || !active.ok) return;

    // SEC-07 : plafond de 2 propositions Contre par étudiant et par pétition
    const spammerId = randomBytes(32);
    for (let i = 0; i < MAX_CONTRE_PER_VOTER_PER_PETITION; i += 1) {
      const c = await addContreProposal({
        db,
        slug: active.slug,
        voterId: spammerId,
        input: {
          text: `Proposition contre n°${i + 1} suffisamment longue.`,
          authorLabel: "Étudiant test",
        },
      });
      expect(c.ok).toBe(true);
    }

    const third = await addContreProposal({
      db,
      slug: active.slug,
      voterId: spammerId,
      input: {
        text: "Troisième proposition qui doit être refusée.",
        authorLabel: "Étudiant test",
      },
    });
    expect(third).toEqual({ ok: false, error: "contre_limit_reached" });

    // Nettoyage : expire la pétition de test
    await db
      .update(schema.petitions)
      .set({ state: "expired", collectUntil: sql`now() - interval '1 minute'` })
      .where(eq(schema.petitions.id, active.id));
  });

  it("SEC-11 : deux demandes de jeton concurrentes renvoient 200 + 409 sans jamais lever 500", async () => {
    const draft = await createVoteDraft(db, {
      question: `Test concurrence jeton SEC-11 (${randomUUID().slice(0, 6)}) ?`,
      options: ["Pour", "Contre"],
      statusNote: "Consultatif",
      originDetail: "Test SEC-11",
      argumentPour: "Argument.",
      argumentPourAuthor: "Test",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });
    const pub = await publishVoteDraft(db, draft.id, { durationHours: 72 });
    expect(pub.ok).toBe(true);
    createdOpenVoteIds.push(draft.id);

    const detail = await getPublishedVoteBySlug(db, draft.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;

    const pk = await importVotePublicKey(
      Buffer.from(detail.vote.publicKeySpkiBase64, "base64"),
    );
    const voterId = randomBytes(32);

    const b1 = await blindToken(pk, prepareToken(buildVoteTokenMessage(draft.id)));
    const b2 = await blindToken(pk, prepareToken(buildVoteTokenMessage(draft.id)));

    const [t1, t2] = await Promise.all([
      issueBlindToken({
        db,
        slug: detail.vote.slug,
        voterId,
        blindedMsg: b1.blindedMsg,
      }),
      issueBlindToken({
        db,
        slug: detail.vote.slug,
        voterId,
        blindedMsg: b2.blindedMsg,
      }),
    ]);

    const okList = [t1, t2].filter((r) => r.ok);
    const errList = [t1, t2].filter((r) => !r.ok);
    expect(okList).toHaveLength(1);
    expect(errList).toHaveLength(1);
    if (errList[0] && !errList[0].ok) {
      expect(errList[0].error).toBe("token_already_issued");
    }
  });
});
