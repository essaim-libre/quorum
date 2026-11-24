import { randomBytes, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { POST as postBallotsRoute } from "@/app/api/ballots/route";
import { createSessionRecord, SESSION_COOKIE_NAME } from "@/lib/auth/session";
import { bytesToBase64Url } from "@/lib/crypto/base64url";
import {
  blindToken,
  buildVoteTokenMessage,
  finalizeToken,
  importVotePublicKey,
  prepareToken,
} from "@/lib/crypto/blind";
import { sha256 } from "@/lib/crypto/hmac";
import { computeReceipt } from "@/lib/crypto/receipt";
import * as schema from "@/lib/db/schema";
import { closeDb } from "@/lib/db/client";
import { resetEnvCache } from "@/lib/env";
import { setLogSink } from "@/lib/log";
import { resetRateLimitersForTest } from "@/lib/ratelimit";
import { submitAnonymousBallot } from "@/lib/votes/ballot";
import {
  createVoteDraft,
  getPublishedVoteBySlug,
  publishVoteDraft,
} from "@/lib/votes/service";
import { issueBlindToken } from "@/lib/votes/token";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

describe("invariants J3 — vote anonyme phase 1 (token) et phase 2 (ballots)", () => {
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
    resetRateLimitersForTest();
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

  async function createAndPublishOpenVote(question: string) {
    const draft = await createVoteDraft(db, {
      question,
      options: ["Pour", "Contre"],
      statusNote: "Consultatif",
      originDetail: "Test J3",
      argumentPour: "Argument pour de test.",
      argumentPourAuthor: "Collectif test",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });
    const pub = await publishVoteDraft(db, draft.id, { durationHours: 72 });
    if (!pub.ok) {
      throw new Error(`publish failed: ${pub.error}`);
    }
    const detail = await getPublishedVoteBySlug(db, draft.slug);
    if (!detail) {
      throw new Error("published vote not found");
    }
    return detail.vote;
  }

  it("gère l'idempotence et l'unicité en phase 1, le dépôt/revote (max 20) et rejette les fraudes en phase 2", async () => {
    const voteA = await createAndPublishOpenVote(
      `Scrutin A ${randomUUID().slice(0, 6)} ?`,
    );
    const voteB = await createAndPublishOpenVote(
      `Scrutin B ${randomUUID().slice(0, 6)} ?`,
    );

    const pkA = await importVotePublicKey(
      Buffer.from(voteA.publicKeySpkiBase64, "base64"),
    );

    const voterId = randomBytes(32);

    // Phase 1 : prépare et aveugle le jeton pour le vote A
    const msgA = buildVoteTokenMessage(voteA.id);
    const inputMsgA = prepareToken(msgA);
    const { blindedMsg: blindedA1, inv: invA1 } = await blindToken(
      pkA,
      inputMsgA,
    );

    const issued1 = await issueBlindToken({
      db,
      slug: voteA.slug,
      voterId,
      blindedMsg: blindedA1,
    });
    expect(issued1.ok).toBe(true);
    if (!issued1.ok) return;
    expect(issued1.replayed).toBe(false);

    // Rejeu idempotent du même blinded_msg -> renvoie exactement la même signature
    const replayed = await issueBlindToken({
      db,
      slug: voteA.slug,
      voterId,
      blindedMsg: blindedA1,
    });
    expect(replayed.ok).toBe(true);
    if (!replayed.ok) return;
    expect(replayed.replayed).toBe(true);
    expect(replayed.blindSig.equals(issued1.blindSig)).toBe(true);

    // Seconde demande avec un blinded_msg différent -> 409 token_already_issued
    const otherInput = prepareToken(buildVoteTokenMessage(voteA.id));
    const { blindedMsg: blindedA2 } = await blindToken(pkA, otherInput);
    const duplicate = await issueBlindToken({
      db,
      slug: voteA.slug,
      voterId,
      blindedMsg: blindedA2,
    });
    expect(duplicate).toEqual({ ok: false, error: "token_already_issued" });

    // Finalisation côté client
    const sigA = await finalizeToken(pkA, inputMsgA, issued1.blindSig, invA1);
    const expectedReceipt = await computeReceipt(inputMsgA);

    const optPourA = voteA.options[0];
    const optContreA = voteA.options[1];
    const optPourB = voteB.options[0];
    if (!optPourA || !optContreA || !optPourB) {
      throw new Error("missing options");
    }

    // Jeton du vote A refusé sur le vote B
    const crossVote = await submitAnonymousBallot({
      db,
      voteId: voteB.id,
      inputMsg: inputMsgA,
      sig: sigA,
      optionId: optPourB.id,
    });
    expect(crossVote).toEqual({ ok: false, error: "invalid_token" });

    // Signature altérée refusée
    const badSig = new Uint8Array(sigA);
    badSig[0] = (badSig[0] ?? 0) ^ 0xff;
    const tampered = await submitAnonymousBallot({
      db,
      voteId: voteA.id,
      inputMsg: inputMsgA,
      sig: badSig,
      optionId: optPourA.id,
    });
    expect(tampered).toEqual({ ok: false, error: "invalid_signature" });

    // Option étrangère au vote refusée
    const wrongOption = await submitAnonymousBallot({
      db,
      voteId: voteA.id,
      inputMsg: inputMsgA,
      sig: sigA,
      optionId: optPourB.id,
    });
    expect(wrongOption).toEqual({ ok: false, error: "invalid_option" });

    // Dépôt valide -> révision 1 + reçu exact
    const cast1 = await submitAnonymousBallot({
      db,
      voteId: voteA.id,
      inputMsg: inputMsgA,
      sig: sigA,
      optionId: optPourA.id,
    });
    expect(cast1).toEqual({ ok: true, receipt: expectedReceipt, revision: 1 });

    // Revote -> remplace option_id et incrémente revision jusqu'à 20
    for (let rev = 2; rev <= 20; rev += 1) {
      const targetOpt = rev % 2 === 0 ? optContreA : optPourA;
      const revote = await submitAnonymousBallot({
        db,
        voteId: voteA.id,
        inputMsg: inputMsgA,
        sig: sigA,
        optionId: targetOpt.id,
      });
      expect(revote).toEqual({
        ok: true,
        receipt: expectedReceipt,
        revision: rev,
      });
    }

    // 21e révision refusée (§2.3, §6.3)
    const twentyFirst = await submitAnonymousBallot({
      db,
      voteId: voteA.id,
      inputMsg: inputMsgA,
      sig: sigA,
      optionId: optPourA.id,
    });
    expect(twentyFirst).toEqual({
      ok: false,
      error: "max_revisions_reached",
    });

    // Vérifie en base que seul le dernier choix (revision 20 = optContreA) est conservé
    const tokenHash = sha256(Buffer.from(inputMsgA));
    const storedBallot = (
      await db
        .select()
        .from(schema.ballots)
        .where(
          and(
            eq(schema.ballots.voteId, voteA.id),
            eq(schema.ballots.tokenHash, tokenHash),
          ),
        )
        .limit(1)
    )[0];
    expect(storedBallot?.optionId).toBe(optContreA.id);
    expect(storedBallot?.revision).toBe(20);
  });

  it("invariant n°4 : POST /api/ballots se comporte exactement pareil avec ou sans cookie de session valide", async () => {
    const vote = await createAndPublishOpenVote(
      `Scrutin Cookie ${randomUUID().slice(0, 6)} ?`,
    );
    const pk = await importVotePublicKey(
      Buffer.from(vote.publicKeySpkiBase64, "base64"),
    );

    // Crée une vraie session valide en base pour un votant
    const sessionVoterId = randomBytes(32);
    await db.insert(schema.voters).values({ id: sessionVoterId });
    const { rawToken } = await createSessionRecord(db, sessionVoterId, false);

    // Émet deux jetons distincts
    const voter1 = randomBytes(32);
    const input1 = prepareToken(buildVoteTokenMessage(vote.id));
    const blind1 = await blindToken(pk, input1);
    const issued1 = await issueBlindToken({
      db,
      slug: vote.slug,
      voterId: voter1,
      blindedMsg: blind1.blindedMsg,
    });
    if (!issued1.ok) throw new Error("issue 1 failed");
    const sig1 = await finalizeToken(pk, input1, issued1.blindSig, blind1.inv);

    const voter2 = randomBytes(32);
    const input2 = prepareToken(buildVoteTokenMessage(vote.id));
    const blind2 = await blindToken(pk, input2);
    const issued2 = await issueBlindToken({
      db,
      slug: vote.slug,
      voterId: voter2,
      blindedMsg: blind2.blindedMsg,
    });
    if (!issued2.ok) throw new Error("issue 2 failed");
    const sig2 = await finalizeToken(pk, input2, issued2.blindSig, blind2.inv);

    const opt = vote.options[0];
    if (!opt) throw new Error("missing option");

    // Appel SANS cookie
    const reqWithoutCookie = new Request("http://localhost:3000/api/ballots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        voteId: vote.id,
        inputMsg: bytesToBase64Url(input1),
        sig: bytesToBase64Url(sig1),
        optionId: opt.id,
      }),
    });
    const resWithout = await postBallotsRoute(reqWithoutCookie);
    const jsonWithout = (await resWithout.json()) as {
      receipt?: string;
      revision?: number;
    };

    // Appel AVEC cookie de session valide
    const reqWithCookie = new Request("http://localhost:3000/api/ballots", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: `${SESSION_COOKIE_NAME}=${rawToken}`,
      },
      body: JSON.stringify({
        voteId: vote.id,
        inputMsg: bytesToBase64Url(input2),
        sig: bytesToBase64Url(sig2),
        optionId: opt.id,
      }),
    });
    const resWith = await postBallotsRoute(reqWithCookie);
    const jsonWith = (await resWith.json()) as {
      receipt?: string;
      revision?: number;
    };

    expect(resWithout.status).toBe(200);
    expect(resWith.status).toBe(200);
    expect(resWithout.headers.get("set-cookie")).toBeNull();
    expect(resWith.headers.get("set-cookie")).toBeNull();
    expect(jsonWithout.revision).toBe(1);
    expect(jsonWith.revision).toBe(1);
    expect(jsonWithout.receipt).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/,
    );
    expect(jsonWith.receipt).toMatch(
      /^[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/,
    );
  });

  it("refuse un bulletin sur un vote clos", async () => {
    const draft = await createVoteDraft(db, {
      question: `Scrutin clos ${randomUUID().slice(0, 6)} ?`,
      options: ["Pour", "Contre"],
      statusNote: "Consultatif",
      originDetail: null,
      argumentPour: "Argument pour.",
      argumentPourAuthor: "Auteur",
      argumentContre: null,
      argumentContreAuthor: null,
      facts: null,
      opensAt: null,
      closesAt: null,
    });

    const pastOpen = new Date(Date.now() - 72 * 60 * 60 * 1000);
    const pastClose = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const pub = await publishVoteDraft(db, draft.id, {
      opensAt: pastOpen,
      closesAt: pastClose,
    });
    expect(pub.ok).toBe(true);

    const detail = await getPublishedVoteBySlug(db, draft.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;

    const input = prepareToken(buildVoteTokenMessage(detail.vote.id));
    const opt = detail.vote.options[0];
    if (!opt) return;

    const res = await submitAnonymousBallot({
      db,
      voteId: detail.vote.id,
      inputMsg: input,
      sig: randomBytes(256),
      optionId: opt.id,
    });
    expect(res).toEqual({ ok: false, error: "vote_closed" });
  });
});
