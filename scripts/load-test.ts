/**
 * Test de charge J7 (§16) : 500 jetons aveugles + 500 bulletins anonymes en moins de 2 minutes.
 *
 * Exécution : pnpm test:load
 */
import { randomBytes } from "node:crypto";
import { performance } from "node:perf_hooks";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import {
  blindToken,
  buildVoteTokenMessage,
  finalizeToken,
  importVotePublicKey,
  prepareToken,
} from "@/lib/crypto/blind";
import { closeBlindSignPool } from "@/lib/crypto/blind-sign-pool";
import { hmacSha256 } from "@/lib/crypto/hmac";
import * as schema from "@/lib/db/schema";
import { getEnv, resetEnvCache } from "@/lib/env";
import { setLogSink } from "@/lib/log";
import { submitAnonymousBallot } from "@/lib/votes/ballot";
import {
  cancelPublishedVote,
  createVoteDraft,
  getPublishedVoteBySlug,
  publishVoteDraft,
} from "@/lib/votes/service";
import { issueBlindToken } from "@/lib/votes/token";

const TARGET_COUNT = 500;
const CONCURRENCY = 20;
const MAX_BUDGET_MS = 120_000;

interface PreparedBallot {
  readonly inputMsg: Uint8Array;
  readonly sig: Uint8Array;
  readonly optionId: string;
}

async function runPool<T, R>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function next(): Promise<void> {
    while (cursor < items.length) {
      const idx = cursor;
      cursor += 1;
      const item = items[idx];
      if (item !== undefined) {
        results[idx] = await worker(item, idx);
      }
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, items.length) },
    () => next(),
  );
  const settled = await Promise.allSettled(workers);
  const rejected = settled.find((s) => s.status === "rejected");
  if (rejected && rejected.status === "rejected") {
    throw rejected.reason;
  }
  return results;
}

function ensureLoadTestEnv(): string {
  const databaseUrl =
    process.env.DATABASE_URL ??
    "postgres://quorum:quorum@localhost:5432/quorum";

  const defaults: Record<string, string> = {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: databaseUrl,
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
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
  resetEnvCache();
  return databaseUrl;
}

async function main(): Promise<void> {
  const databaseUrl = ensureLoadTestEnv();
  const env = getEnv();

  let leakedAtSignCount = 0;
  let totalLogLines = 0;
  setLogSink((line) => {
    totalLogLines += 1;
    if (line.includes("@")) {
      leakedAtSignCount += 1;
    }
  });

  const pool = new Pool({
    connectionString: databaseUrl,
    max: 10,
  });
  const db = drizzle(pool, { schema });

  try {
    // Préchauffe le pool de connexions PostgreSQL avant la rafale RSA
    await Promise.all(
      Array.from({ length: 10 }, () => pool.query("SELECT 1")),
    );

    const suffix = Date.now().toString(36);
    const draft = await createVoteDraft(db, {
      question: `Test de charge J7 — 500 jetons et 500 bulletins (${suffix}) ?`,
      options: ["Option A", "Option B"],
      statusNote: "Consultatif — test de charge",
      originDetail: "Test de charge J7",
      argumentPour: "Validation de la montée en charge en sortie d'AG.",
      argumentPourAuthor: "Bench J7",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });

    const published = await publishVoteDraft(db, draft.id, {
      durationHours: 72,
    });
    if (!published.ok) {
      throw new Error(`publish_failed:${published.error}`);
    }

    const detail = await getPublishedVoteBySlug(db, published.data.slug);
    if (!detail) {
      throw new Error("vote_not_found_after_publish");
    }

    const publicKey = await importVotePublicKey(
      Buffer.from(detail.vote.publicKeySpkiBase64, "base64"),
    );
    const optionIds = detail.vote.options.map((o) => o.id);
    const indices = Array.from({ length: TARGET_COUNT }, (_, i) => i);

    const totalStart = performance.now();

    // Phase 1 : 500 signatures aveugles RFC 9474 + émargement PostgreSQL
    const phase1Start = performance.now();
    const preparedBallots = await runPool<number, PreparedBallot>(
      indices,
      CONCURRENCY,
      async (i) => {
        const voterId = hmacSha256(
          env.K_ID,
          `test.load.${suffix}.${i}@etu.u-bordeaux.fr`,
        );
        const msg = buildVoteTokenMessage(detail.vote.id);
        const inputMsg = prepareToken(msg);
        const { blindedMsg, inv } = await blindToken(publicKey, inputMsg);

        const tokenRes = await issueBlindToken({
          db,
          slug: detail.vote.slug,
          voterId,
          blindedMsg,
        });
        if (!tokenRes.ok) {
          throw new Error(`token_failed_${i}:${tokenRes.error}`);
        }

        const sig = await finalizeToken(
          publicKey,
          inputMsg,
          tokenRes.blindSig,
          inv,
        );
        const optionId = optionIds[i % optionIds.length];
        if (!optionId) {
          throw new Error("missing_option_id");
        }

        return { inputMsg, sig, optionId };
      },
    );
    const phase1Ms = performance.now() - phase1Start;

    // Phase 2 : 500 dépôts de bulletins anonymes (vérification RSA-PSS + ballots + vote_receipts)
    const phase2Start = performance.now();
    const receipts = await runPool<PreparedBallot, string>(
      preparedBallots,
      CONCURRENCY,
      async (item, i) => {
        const res = await submitAnonymousBallot({
          db,
          voteId: detail.vote.id,
          inputMsg: item.inputMsg,
          sig: item.sig,
          optionId: item.optionId,
        });
        if (!res.ok) {
          throw new Error(`ballot_failed_${i}:${res.error}`);
        }
        return res.receipt;
      },
    );
    const phase2Ms = performance.now() - phase2Start;
    const totalMs = performance.now() - totalStart;

    // Vérification intégrité en base avant nettoyage
    const [emargementRows, ballotRows, receiptRows] = await Promise.all([
      db
        .select({ voteId: schema.emargement.voteId })
        .from(schema.emargement)
        .where(eq(schema.emargement.voteId, detail.vote.id)),
      db
        .select({ voteId: schema.ballots.voteId })
        .from(schema.ballots)
        .where(eq(schema.ballots.voteId, detail.vote.id)),
      db
        .select({ receipt: schema.voteReceipts.receipt })
        .from(schema.voteReceipts)
        .where(eq(schema.voteReceipts.voteId, detail.vote.id)),
    ]);

    if (emargementRows.length !== TARGET_COUNT) {
      throw new Error(
        `expected_${TARGET_COUNT}_emargement_got_${emargementRows.length}`,
      );
    }
    if (ballotRows.length !== TARGET_COUNT) {
      throw new Error(
        `expected_${TARGET_COUNT}_ballots_got_${ballotRows.length}`,
      );
    }
    if (receiptRows.length !== TARGET_COUNT || receipts.length !== TARGET_COUNT) {
      throw new Error(
        `expected_${TARGET_COUNT}_receipts_got_${receiptRows.length}`,
      );
    }

    // Annule le scrutin synthétique pour purger les bulletins/émargement de la base locale
    const cancelled = await cancelPublishedVote(db, detail.vote.id, {
      reason: "Nettoyage automatique après test de charge J7",
    });
    if (!cancelled.ok) {
      throw new Error(`cleanup_cancel_failed:${cancelled.error}`);
    }

    if (leakedAtSignCount > 0) {
      throw new Error(`email_leak_detected_in_logs:${leakedAtSignCount}`);
    }

    const summary = [
      `Test de charge J7 réussi :`,
      `- Phase 1 (${TARGET_COUNT} jetons aveugles) : ${(phase1Ms / 1000).toFixed(2)} s (${((TARGET_COUNT / phase1Ms) * 1000).toFixed(1)} jetons/s)`,
      `- Phase 2 (${TARGET_COUNT} bulletins anonymes) : ${(phase2Ms / 1000).toFixed(2)} s (${((TARGET_COUNT / phase2Ms) * 1000).toFixed(1)} bulletins/s)`,
      `- Total : ${(totalMs / 1000).toFixed(2)} s (budget max : ${MAX_BUDGET_MS / 1000} s)`,
      `- Logs vérifiés : ${totalLogLines} lignes, 0 '@' détecté.`,
    ].join("\n");
    process.stdout.write(`${summary}\n`);

    if (totalMs > MAX_BUDGET_MS) {
      throw new Error(
        `load_test_budget_exceeded:${Math.round(totalMs)}ms>${MAX_BUDGET_MS}ms`,
      );
    }
  } finally {
    setLogSink(null);
    await closeBlindSignPool();
    await pool.end();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Échec du test de charge J7 : ${message}\n`);
  process.exit(1);
});
