import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { decryptVotePrivateKeyPkcs8 } from "@/lib/crypto/vote-keys";
import * as schema from "@/lib/db/schema";
import { getEnv, resetEnvCache } from "@/lib/env";
import { listPublicJournal } from "@/lib/journal";
import { setLogSink } from "@/lib/log";
import {
  cancelPublishedVote,
  createVoteDraft,
  getPublishedVoteBySlug,
  getVoteParticipationBySlug,
  listPublishedVotes,
  publishVoteDraft,
  updateVoteDraft,
} from "@/lib/votes/service";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

describe("invariants J2 — cycle de vie des votes, confidentialité et journal", () => {
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

  it("crée, modifie, publie avec clé chiffrée, masque tout décompte avant clôture, journalise et annule", async () => {
    // 1. Création du brouillon
    const draft = await createVoteDraft(db, {
      question: "Organiser une journée banalisée jeudi prochain ?",
      options: ["Pour", "Contre"],
      statusNote: "Consultatif — transmis au conseil",
      originDetail: "Test J2",
      argumentPour: "Permet à tous de participer aux débats.",
      argumentPourAuthor: "Collectif étudiant",
      argumentContre: "Déplace des séances de TP.",
      argumentContreAuthor: "Délégués L3",
      facts: "Les cours magistraux seraient reportés.",
      opensAt: null,
      closesAt: null,
    });

    // Un brouillon n'est pas visible côté public ni dévoilé dans le journal
    expect(await getPublishedVoteBySlug(db, draft.slug)).toBeNull();
    const draftJournal = await listPublicJournal(db, {
      limit: 50,
      targetType: "vote",
    });
    const draftEntry = draftJournal.find((entry) => entry.targetId === draft.id);
    expect(draftEntry?.targetHref).toBeNull();
    expect(draftEntry?.targetLabel).toContain("Brouillon de scrutin");
    expect(draftEntry?.targetLabel).not.toContain("journée banalisée");

    // 2. Modification autorisée tant que le vote est en brouillon
    const updated = await updateVoteDraft(db, draft.id, {
      question: "Organiser une journée banalisée vendredi prochain ?",
      options: ["Pour la journée", "Contre la journée"],
    });
    expect(updated.ok).toBe(true);

    // 3. Publication immédiate sur 72 h -> génère clé RSA chiffrée + fige dates
    const published = await publishVoteDraft(db, draft.id, {
      durationHours: 72,
    });
    expect(published.ok).toBe(true);
    if (!published.ok) return;
    expect(published.data.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);

    // Vérifie la clé privée chiffrée en base (invariant n°7)
    const dbRow = (
      await db
        .select({ privateKeyEnc: schema.votes.privateKeyEnc })
        .from(schema.votes)
        .where(eq(schema.votes.id, draft.id))
        .limit(1)
    )[0];
    expect(dbRow?.privateKeyEnc).toBeInstanceOf(Buffer);
    if (dbRow?.privateKeyEnc) {
      const decrypted = decryptVotePrivateKeyPkcs8(
        dbRow.privateKeyEnc,
        getEnv().MASTER_KEY,
      );
      expect(decrypted.length).toBeGreaterThan(100);
    }

    // 4. Invariant n°6 : modifier un vote publié échoue
    const immutableAttempt = await updateVoteDraft(db, draft.id, {
      question: "Tentative illégale ?",
    });
    expect(immutableAttempt).toEqual({ ok: false, error: "vote_immutable" });

    // 5. Lecture publique d'un vote ouvert + dépôt d'un bulletin de test
    const openList = await listPublishedVotes(db, "open");
    expect(openList.votes.some((v) => v.id === draft.id)).toBe(true);

    const detail = await getPublishedVoteBySlug(db, draft.slug);
    expect(detail).not.toBeNull();
    if (!detail) return;
    expect(detail.vote.options.map((o) => o.label)).toEqual([
      "Pour la journée",
      "Contre la journée",
      "Vote blanc",
    ]);

    const firstOption = detail.vote.options[0];
    expect(firstOption).toBeDefined();
    if (!firstOption) return;

    await db.insert(schema.ballots).values({
      voteId: draft.id,
      tokenHash: randomBytes(32),
      optionId: firstOption.id,
      revision: 1,
    });

    // Invariant n°5 : AUCUN décompte par option avant closes_at
    const detailWithBallot = await getPublishedVoteBySlug(db, draft.slug);
    expect(detailWithBallot).not.toBeNull();
    if (!detailWithBallot) return;

    const rawVoteRecord = detailWithBallot.vote as unknown as Record<
      string,
      unknown
    >;
    expect(rawVoteRecord.results).toBeUndefined();
    expect(rawVoteRecord.counts).toBeUndefined();
    expect(rawVoteRecord.tally).toBeUndefined();
    expect(rawVoteRecord.breakdown).toBeUndefined();
    expect(rawVoteRecord.privateKeyEnc).toBeUndefined();

    for (const opt of detailWithBallot.vote.options) {
      expect(Object.keys(opt).sort()).toEqual([
        "id",
        "isBlank",
        "label",
        "position",
      ]);
    }

    // Participation totale bien incrémentée (sans révéler les choix)
    const participation = await getVoteParticipationBySlug(db, draft.slug);
    expect(participation?.ballots).toBe(1);
    expect(participation?.electorateSize).toBe(56000);

    // Journal enrichi pour un scrutin publié : intitulé et lien public
    const publishedJournal = await listPublicJournal(db, {
      limit: 50,
      targetType: "vote",
    });
    const pubEntry = publishedJournal.find(
      (entry) => entry.targetId === draft.id && entry.action === "vote.publish",
    );
    expect(pubEntry?.targetLabel).toBe(
      "Organiser une journée banalisée vendredi prochain ?",
    );
    expect(pubEntry?.targetHref).toBe(`/votes/${draft.slug}`);

    // 6. Annulation motivée (§2.4) : supprime les bulletins, efface la clé privée, journalise
    const cancelled = await cancelPublishedVote(db, draft.id, {
      reason: "Question retirée par les organisateurs",
    });
    expect(cancelled.ok).toBe(true);

    // Bulletins supprimés et clé privée effacée
    const remainingBallots = await db
      .select()
      .from(schema.ballots)
      .where(eq(schema.ballots.voteId, draft.id));
    expect(remainingBallots).toHaveLength(0);

    const postCancelRow = (
      await db
        .select({ privateKeyEnc: schema.votes.privateKeyEnc })
        .from(schema.votes)
        .where(eq(schema.votes.id, draft.id))
        .limit(1)
    )[0];
    expect(postCancelRow?.privateKeyEnc).toBeNull();

    // Un vote annulé n'apparaît plus en lecture publique
    expect(await getPublishedVoteBySlug(db, draft.slug)).toBeNull();

    // 7. Invariant n°9 : toutes les actions d'admin sont dans admin_journal
    const journal = await listPublicJournal(db, 50);
    const voteActions = journal
      .filter((entry) => entry.targetId === draft.id)
      .map((entry) => entry.action);

    expect(voteActions).toContain("vote.create");
    expect(voteActions).toContain("vote.update");
    expect(voteActions).toContain("vote.publish");
    expect(voteActions).toContain("vote.cancel");

    const cancelEntry = journal.find(
      (entry) => entry.targetId === draft.id && entry.action === "vote.cancel",
    );
    expect(cancelEntry?.reason).toBe(
      "Question retirée par les organisateurs",
    );
  });
});
