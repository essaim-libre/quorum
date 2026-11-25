import { randomBytes, randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { closeDb } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { listPublicJournal } from "@/lib/journal";
import { setLogSink } from "@/lib/log";
import {
  createPetitionSchema,
  formatAgOriginDetail,
  parsePostgresIntervalMs,
} from "@/lib/petitions/rules";
import {
  addContreProposal,
  createPetition,
  getPetitionBySlug,
  processDuePetitions,
  respondToRewording,
  reviewPetition,
  signPetition,
  supportContreProposal,
} from "@/lib/petitions/service";
import {
  cancelPublishedVote,
  getPublishedVoteBySlug,
} from "@/lib/votes/service";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

describe("pétitions — règles, seuil, expiration, soutien Contre, relecture et publication auto 48 h (§3, §13)", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const db = drizzle(pool, { schema });
  const savedEnv: Record<string, string | undefined> = {};
  const createdOpenVoteIds: string[] = [];

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
      PETITION_THRESHOLD: "3",
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
    for (const voteId of createdOpenVoteIds) {
      await cancelPublishedVote(db, voteId, {
        reason: "Nettoyage automatique test J5",
      }).catch(() => {});
    }
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

  it("valide le schéma de dépôt et les intervalles PostgreSQL", () => {
    expect(parsePostgresIntervalMs("72:00:00")).toBe(72 * 3600 * 1000);
    expect(parsePostgresIntervalMs("3 days")).toBe(72 * 3600 * 1000);
    expect(
      formatAgOriginDetail({
        agDate: "26 nov.",
        agLocation: "amphi A",
        agAttendees: 412,
        agResult: "Pour 310 / Contre 82",
      }),
    ).toBe("AG du 26 nov., amphi A, 412 présents — Pour 310 / Contre 82");

    // Décision d'AG sans détails -> refusée
    expect(
      createPetitionSchema.safeParse({
        question: "Ouvrir le foyer étudiant jusqu'à 22 h ?",
        options: ["Pour", "Contre"],
        argumentPour: "Permet aux associations de se réunir le soir.",
        argumentPourAuthor: "Association X",
        isAgDecision: true,
      }).success,
    ).toBe(false);
  });

  it("gère seuil, soutien Contre unique/remplaçable, demande de reformulation, approbation et journal public", async () => {
    const authorId = randomBytes(32);
    const voter2 = randomBytes(32);
    const voter3 = randomBytes(32);

    const created = await createPetition({
      db,
      voterId: authorId,
      input: {
        question: `Prolonger la cafétéria jusqu'à 20 h (${randomUUID().slice(0, 6)}) ?`,
        options: ["Pour", "Contre"],
        argumentPour: "Utile pour les étudiants qui terminent les TD à 19 h.",
        argumentPourAuthor: "Collectif cafétéria",
        requestedDurationHours: 48,
        isAgDecision: false,
        originDetail: "Initiative étudiante",
      },
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    expect(created.state).toBe("collecting");

    // Une seconde pétition active du même auteur est refusée (§3.2)
    const secondActive = await createPetition({
      db,
      voterId: authorId,
      input: {
        question: "Deuxième pétition simultanée ?",
        options: ["Oui", "Non"],
        argumentPour: "Argument test.",
        argumentPourAuthor: "Auteur",
        requestedDurationHours: 72,
        isAgDecision: false,
        originDetail: null,
      },
    });
    expect(secondActive).toEqual({
      ok: false,
      error: "active_petition_exists",
    });

    // Dépôt de deux arguments Contre + soutien unique et remplaçable (§3.3)
    const c1 = await addContreProposal({
      db,
      slug: created.slug,
      voterId: voter2,
      input: {
        text: "Coût salarial supplémentaire pour le CROUS.",
        authorLabel: "Étudiant L3",
      },
    });
    const c2 = await addContreProposal({
      db,
      slug: created.slug,
      voterId: voter3,
      input: {
        text: "Faible fréquentation constatée après 18 h.",
        authorLabel: "Délégué M1",
      },
    });
    expect(c1.ok && c2.ok).toBe(true);
    if (!c1.ok || !c2.ok) return;

    // voter2 soutient c1 (c1=1, c2=0), puis remplace par c2 (c1=0, c2=1)
    await supportContreProposal({
      db,
      proposalId: c1.proposal.id,
      voterId: voter2,
    });
    await supportContreProposal({
      db,
      proposalId: c2.proposal.id,
      voterId: voter2,
    });
    await supportContreProposal({
      db,
      proposalId: c2.proposal.id,
      voterId: voter3,
    });

    const afterSupport = await getPetitionBySlug(db, created.slug, voter2);
    expect(afterSupport?.viewer.supportedContreId).toBe(c2.proposal.id);
    const c1Row = afterSupport?.contreProposals.find(
      (c) => c.id === c1.proposal.id,
    );
    const c2Row = afterSupport?.contreProposals.find(
      (c) => c.id === c2.proposal.id,
    );
    expect(c1Row?.supports).toBe(0);
    expect(c2Row?.supports).toBe(2);

    // L'auteur a déjà signé (1/3) ; re-signer est idempotent
    const reSign = await signPetition({
      db,
      slug: created.slug,
      voterId: authorId,
    });
    expect(reSign).toEqual({
      ok: true,
      alreadySigned: true,
      signaturesCount: 1,
      state: "collecting",
    });

    // 2e et 3e signatures -> seuil (3) atteint -> passage en in_review
    const s2 = await signPetition({ db, slug: created.slug, voterId: voter2 });
    expect(s2).toEqual({
      ok: true,
      alreadySigned: false,
      signaturesCount: 2,
      state: "collecting",
    });
    const s3 = await signPetition({ db, slug: created.slug, voterId: voter3 });
    expect(s3).toEqual({
      ok: true,
      alreadySigned: false,
      signaturesCount: 3,
      state: "in_review",
    });

    // Admin demande une reformulation (journalisée)
    const rewordText = `Ouvrir la cafétéria jusqu'à 20 h du lundi au jeudi (${randomUUID().slice(0, 4)}) ?`;
    const reqChanges = await reviewPetition({
      db,
      petitionId: created.id,
      input: {
        decision: "request_changes",
        proposedRewording: rewordText,
        reason: "Préciser les jours concernés (charte §3.5)",
      },
    });
    expect(reqChanges).toEqual({ ok: true, state: "changes_requested" });

    // Un non-auteur ne peut pas accepter la reformulation
    const forbiddenAccept = await respondToRewording({
      db,
      slug: created.slug,
      voterId: voter2,
      accept: true,
    });
    expect(forbiddenAccept).toEqual({ ok: false, error: "forbidden" });

    // L'auteur accepte -> repasse en in_review avec la nouvelle question
    const accepted = await respondToRewording({
      db,
      slug: created.slug,
      voterId: authorId,
      accept: true,
    });
    expect(accepted).toEqual({
      ok: true,
      state: "in_review",
      question: rewordText,
    });

    // Admin approuve avec faits sourcés -> publie le vote + retient c2 comme Contre
    const approved = await reviewPetition({
      db,
      petitionId: created.id,
      input: {
        decision: "approve",
        facts: "Horaires actuels : 8 h – 18 h.",
      },
    });
    expect(approved.ok).toBe(true);
    if (!approved.ok || !approved.voteSlug) return;

    const publishedVote = await getPublishedVoteBySlug(db, approved.voteSlug);
    if (publishedVote) {
      createdOpenVoteIds.push(publishedVote.vote.id);
    }
    expect(publishedVote?.vote.question).toBe(rewordText);
    expect(publishedVote?.vote.argumentContre).toBe(
      "Faible fréquentation constatée après 18 h.",
    );
    expect(publishedVote?.vote.argumentContreAuthor).toBe("Délégué M1");
    expect(publishedVote?.vote.facts).toBe("Horaires actuels : 8 h – 18 h.");

    // Journal public contient les deux décisions admin (invariant n°9)
    const journal = await listPublicJournal(db, 50);
    const actions = journal
      .filter((e) => e.targetId === created.id)
      .map((e) => e.action);
    expect(actions).toContain("petition.request_changes");
    expect(actions).toContain("petition.approve");
  });

  it("expire les pétitions dépassées et publie automatiquement après 48 h sans décision (§3.4)", async () => {
    // 1. Pétition expirée en collecte
    const authorExp = randomBytes(32);
    const exp = await createPetition({
      db,
      voterId: authorExp,
      input: {
        question: `Pétition expirée (${randomUUID().slice(0, 6)}) ?`,
        options: ["Oui", "Non"],
        argumentPour: "Test expiration.",
        argumentPourAuthor: "Auteur",
        requestedDurationHours: 24,
        isAgDecision: false,
        originDetail: null,
      },
    });
    if (!exp.ok) throw new Error("exp create failed");

    await db
      .update(schema.petitions)
      .set({ collectUntil: sql`now() - interval '1 minute'` })
      .where(eq(schema.petitions.id, exp.id));

    // 2. Pétition en relecture dépassant les 48 h sans décision -> auto-publication !
    const authorAuto = randomBytes(32);
    const auto = await createPetition({
      db,
      voterId: authorAuto,
      input: {
        question: `Auto-publication 48 h (${randomUUID().slice(0, 6)}) ?`,
        options: ["Pour", "Contre"],
        argumentPour: "L'admin ne peut pas enterrer une pétition.",
        argumentPourAuthor: "Collectif 48h",
        requestedDurationHours: 72,
        isAgDecision: false,
        originDetail: null,
      },
    });
    if (!auto.ok) throw new Error("auto create failed");

    await signPetition({ db, slug: auto.slug, voterId: randomBytes(32) });
    await signPetition({ db, slug: auto.slug, voterId: randomBytes(32) });

    await db
      .update(schema.petitions)
      .set({ reviewDeadline: sql`now() - interval '1 minute'` })
      .where(eq(schema.petitions.id, auto.id));

    const processed = await processDuePetitions(db);
    expect(processed.expiredCount).toBeGreaterThanOrEqual(1);
    expect(processed.autoApprovedCount).toBeGreaterThanOrEqual(1);

    const expDetail = await getPetitionBySlug(db, exp.slug);
    expect(expDetail?.state).toBe("expired");

    const autoDetail = await getPetitionBySlug(db, auto.slug);
    expect(autoDetail?.state).toBe("approved");
    expect(autoDetail?.voteSlug).toBeTruthy();

    if (autoDetail?.voteSlug) {
      const vote = await getPublishedVoteBySlug(db, autoDetail.voteSlug);
      if (vote) {
        createdOpenVoteIds.push(vote.vote.id);
      }
      expect(vote?.vote.status).toBe("open");
    }

    const journal = await listPublicJournal(db, 50);
    expect(
      journal.some(
        (e) =>
          e.targetId === auto.id && e.action === "petition.auto_approve",
      ),
    ).toBe(true);
  });
});
