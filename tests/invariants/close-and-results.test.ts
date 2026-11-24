import { randomBytes, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postCronRoute } from "@/app/api/internal/cron/route";
import {
  blindToken,
  buildVoteTokenMessage,
  finalizeToken,
  importVotePublicKey,
  prepareToken,
} from "@/lib/crypto/blind";
import { closeDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { setLogSink } from "@/lib/log";
import { submitAnonymousBallot } from "@/lib/votes/ballot";
import {
  closeVoteIfDue,
  getClosedVoteReportBySlug,
} from "@/lib/votes/close";
import {
  createVoteDraft,
  getPublishedVoteBySlug,
  publishVoteDraft,
} from "@/lib/votes/service";
import { issueBlindToken } from "@/lib/votes/token";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

const TEST_CRON_SECRET = "cron-secret-test-quorum-32-chars-min";

describe("invariants J4 — clôture idempotente, purge émargement, effacement clé privée, reçus et cron", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    await pool.query("SELECT 1");

    const testEnv: Record<string, string> = {
      NODE_ENV: "test",
      APP_URL: "http://localhost:3000",
      DATABASE_URL,
      K_ID: randomBytes(32).toString("base64"),
      K_EMARG: randomBytes(32).toString("base64"),
      K_SIG: randomBytes(32).toString("base64"),
      K_OTP: randomBytes(32).toString("base64"),
      MASTER_KEY: randomBytes(32).toString("base64"),
      ALLOWED_EMAIL_DOMAIN: "etu.u-bordeaux.fr",
      ADMIN_EMAILS: "test.admin@etu.u-bordeaux.fr",
      ELECTORATE_SIZE: "56000",
      PETITION_THRESHOLD: "300",
      PETITION_COLLECT_DAYS: "7",
      MAIL_DRIVER: "console",
      MAIL_FROM: "Quorum <code@exemple.fr>",
      CRON_SECRET: TEST_CRON_SECRET,
    };

    for (const [k, v] of Object.entries(testEnv)) {
      savedEnv[k] = process.env[k];
      process.env[k] = v;
    }
    resetEnvCache();
    setLogSink(() => {});
  });

  afterAll(async () => {
    setLogSink(null);
    await closeDb();
    await pool.end();
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) {
        delete process.env[k];
      } else {
        process.env[k] = v;
      }
    }
    resetEnvCache();
  });

  it("clôt de façon idempotente après closes_at, vide emargement, efface private_key_enc et publie résultats + reçus", async () => {
    const draft = await createVoteDraft(db, {
      question: `Clôture test ${randomUUID().slice(0, 6)} ?`,
      options: ["Pour", "Contre"],
      statusNote: "Consultatif",
      originDetail: "Test J4",
      argumentPour: "Argument pour.",
      argumentPourAuthor: "Collectif",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });

    // Lit l'heure PostgreSQL (Docker VM peut dériver légèrement de l'horloge hôte Windows)
    const dbNowRes = await pool.query<{ now: Date }>("SELECT now() AS now");
    const dbNowMs = dbNowRes.rows[0]?.now.getTime() ?? Date.now();
    const opensAt = new Date(dbNowMs - 24 * 60 * 60 * 1000);
    const closesAt = new Date(dbNowMs + 4000);

    const published = await publishVoteDraft(db, draft.id, {
      opensAt,
      closesAt,
    });
    expect(published.ok).toBe(true);

    const detail = await getPublishedVoteBySlug(db, draft.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;
    const vote = detail.vote;
    const pk = await importVotePublicKey(
      Buffer.from(vote.publicKeySpkiBase64, "base64"),
    );

    const optPour = vote.options.find((o) => o.label === "Pour");
    const optBlank = vote.options.find((o) => o.isBlank);
    if (!optPour || !optBlank) throw new Error("missing options");

    // 3 étudiants obtiennent un jeton ; 2 déposent un bulletin (1 Pour, 1 Blanc)
    const receipts: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      const voterId = randomBytes(32);
      const inputMsg = prepareToken(buildVoteTokenMessage(vote.id));
      const { blindedMsg, inv } = await blindToken(pk, inputMsg);
      const issued = await issueBlindToken({
        db,
        slug: vote.slug,
        voterId,
        blindedMsg,
      });
      if (!issued.ok) throw new Error(`issue failed: ${issued.error}`);
      const sig = await finalizeToken(pk, inputMsg, issued.blindSig, inv);

      if (i === 0) {
        const cast = await submitAnonymousBallot({
          db,
          voteId: vote.id,
          inputMsg,
          sig,
          optionId: optPour.id,
        });
        if (!cast.ok) throw new Error(`cast 0 failed: ${cast.error}`);
        receipts.push(cast.receipt);
      } else if (i === 1) {
        const cast = await submitAnonymousBallot({
          db,
          voteId: vote.id,
          inputMsg,
          sig,
          optionId: optBlank.id,
        });
        if (!cast.ok) throw new Error(`cast 1 failed: ${cast.error}`);
        receipts.push(cast.receipt);
      }
    }

    // Invariant n°5 : avant closes_at, aucun résultat n'est accessible
    const beforeClose = await getClosedVoteReportBySlug(db, pool, vote.slug);
    expect(beforeClose).toEqual({ ok: false, error: "vote_not_closed" });

    // Attend que closes_at soit réellement dépassée selon PostgreSQL now()
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const check = await pool.query<{ passed: boolean }>(
        "SELECT (now() >= $1::timestamptz) AS passed",
        [closesAt.toISOString()],
      );
      if (check.rows[0]?.passed) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }

    // Première clôture
    const firstClose = await closeVoteIfDue(db, pool, vote.id);
    expect(firstClose).toEqual({
      closed: true,
      newlyClosed: true,
      tokensIssued: 3,
    });

    // Seconde clôture idempotente
    const secondClose = await closeVoteIfDue(db, pool, vote.id);
    expect(secondClose).toEqual({
      closed: true,
      newlyClosed: false,
      tokensIssued: 3,
    });

    // Invariants post-clôture (§6.5 & §13) : emargement vide + private_key_enc nul
    const remainingEmargement = await db
      .select()
      .from(schema.emargement)
      .where(eq(schema.emargement.voteId, vote.id));
    expect(remainingEmargement).toHaveLength(0);

    const voteAfter = (
      await db
        .select({
          privateKeyEnc: schema.votes.privateKeyEnc,
          tokensIssued: schema.votes.tokensIssued,
        })
        .from(schema.votes)
        .where(eq(schema.votes.id, vote.id))
        .limit(1)
    )[0];
    expect(voteAfter?.privateKeyEnc).toBeNull();
    expect(voteAfter?.tokensIssued).toBe(3);

    // Lecture du rapport clos : résultats + liste triée des reçus + contrôle 2 <= 3
    const reportRes = await getClosedVoteReportBySlug(db, pool, vote.slug);
    expect(reportRes.ok).toBe(true);
    if (!reportRes.ok) return;

    const { report } = reportRes;
    expect(report.tally.totalBallots).toBe(2);
    expect(report.tally.expressedCount).toBe(1);
    expect(report.tally.blankCount).toBe(1);
    expect(report.tally.tokensIssued).toBe(3);
    expect(report.tally.integrityBallotsLeqTokens).toBe(true);
    expect(report.tally.outcome.kind).toBe("winner");
    expect(report.receipts).toEqual([...receipts].sort());
    expect(report.receiptsHash).toMatch(/^[0-9a-f]{64}$/);
  }, 20_000);

  it("protège /api/internal/cron par CRON_SECRET et exécute les purges", async () => {
    const unauthorizedRes = await postCronRoute(
      new Request("http://localhost:3000/api/internal/cron", {
        method: "POST",
      }),
    );
    expect(unauthorizedRes.status).toBe(401);

    const wrongRes = await postCronRoute(
      new Request("http://localhost:3000/api/internal/cron", {
        method: "POST",
        headers: { Authorization: "Bearer mauvais-secret" },
      }),
    );
    expect(wrongRes.status).toBe(401);

    // Insère un OTP expiré depuis 48 h pour vérifier la purge
    await db.insert(schema.otpCodes).values({
      voterId: randomBytes(32),
      codeHash: randomBytes(32),
      expiresAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
      attempts: 0,
      consumed: false,
    });

    const okRes = await postCronRoute(
      new Request("http://localhost:3000/api/internal/cron", {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_CRON_SECRET}` },
      }),
    );
    expect(okRes.status).toBe(200);
    const json = (await okRes.json()) as {
      ok: boolean;
      purgedOtpCodes: number;
    };
    expect(json.ok).toBe(true);
    expect(json.purgedOtpCodes).toBeGreaterThanOrEqual(1);
  });
});
