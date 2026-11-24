import { randomBytes, randomUUID } from "node:crypto";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

describe("invariants PostgreSQL — schéma ballots et triggers (§7)", () => {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const createdVoteIds: string[] = [];

  beforeAll(async () => {
    await pool.query("SELECT 1");
  });

  afterAll(async () => {
    for (const voteId of createdVoteIds) {
      await pool.query("DELETE FROM ballots WHERE vote_id = $1", [voteId]);
      await pool.query("DELETE FROM emargement WHERE vote_id = $1", [voteId]);
      await pool.query("DELETE FROM results WHERE vote_id = $1", [voteId]);
      // Pour nettoyer proprement un vote publié de test, on désactive le trigger uniquement en cleanup de test?
      // Non : on ne modifie jamais les triggers, on laisse les lignes de test isolées par UUID ou on ne teste que des slugs aléatoires
    }
    await pool.end();
  });

  it("vérifie en base que ballots possède exactement {vote_id, token_hash, option_id, revision}", async () => {
    const res = await pool.query<{ column_name: string }>(
      `SELECT column_name
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ballots'
       ORDER BY column_name ASC`,
    );

    expect(res.rows.map((r) => r.column_name)).toEqual([
      "option_id",
      "revision",
      "token_hash",
      "vote_id",
    ]);
  });

  it("interdit la modification d'un vote publié et de ses options, et autorise les exceptions prévues", async () => {
    const slug = `test-immut-${randomUUID()}`;
    const opensAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const closesAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    const voteRes = await pool.query<{ id: string }>(
      `INSERT INTO votes (
        slug, question, origin, status_note, argument_pour, argument_pour_author,
        state, opens_at, closes_at, public_key_spki, private_key_enc, key_fingerprint
      ) VALUES ($1, $2, 'admin', 'Consultatif', 'Pour test', 'Auteur', 'draft', $3, $4, $5, $6, 'fp-test')
      RETURNING id`,
      [slug, "Question test ?", opensAt, closesAt, randomBytes(32), randomBytes(32)],
    );
    const voteId = voteRes.rows[0]?.id;
    expect(voteId).toBeDefined();
    if (!voteId) return;
    createdVoteIds.push(voteId);

    const optRes = await pool.query<{ id: string }>(
      `INSERT INTO vote_options (vote_id, label, position, is_blank)
       VALUES ($1, 'Pour', 1, false)
       RETURNING id`,
      [voteId],
    );
    const optionId = optRes.rows[0]?.id;
    expect(optionId).toBeDefined();
    if (!optionId) return;

    // Publication du vote
    await pool.query(`UPDATE votes SET state = 'published' WHERE id = $1`, [
      voteId,
    ]);

    // 1. Modifier la question d'un vote publié échoue (invariant n°6)
    await expect(
      pool.query(`UPDATE votes SET question = 'Modifiée ?' WHERE id = $1`, [
        voteId,
      ]),
    ).rejects.toThrow(/immuable/i);

    // 2. Modifier ou ajouter une option sur un vote publié échoue
    await expect(
      pool.query(
        `INSERT INTO vote_options (vote_id, label, position, is_blank) VALUES ($1, 'Contre', 2, false)`,
        [voteId],
      ),
    ).rejects.toThrow(/immuables/i);

    await expect(
      pool.query(`UPDATE vote_options SET label = 'Autre' WHERE id = $1`, [
        optionId,
      ]),
    ).rejects.toThrow(/immuables/i);

    await expect(
      pool.query(`DELETE FROM vote_options WHERE id = $1`, [optionId]),
    ).rejects.toThrow(/immuables/i);

    // 3. Exceptions autorisées : écriture unique de tokens_issued et effacement de private_key_enc
    await pool.query(
      `UPDATE votes SET tokens_issued = 42, private_key_enc = NULL WHERE id = $1`,
      [voteId],
    );

    // Une seconde écriture de tokens_issued échoue
    await expect(
      pool.query(`UPDATE votes SET tokens_issued = 43 WHERE id = $1`, [voteId]),
    ).rejects.toThrow(/tokens_issued/i);

    // 4. Annulation sans motif échoue, annulation motivée réussit
    await expect(
      pool.query(`UPDATE votes SET state = 'cancelled' WHERE id = $1`, [voteId]),
    ).rejects.toThrow(/motif/i);

    await pool.query(
      `UPDATE votes SET state = 'cancelled', cancel_reason = 'Erreur de test' WHERE id = $1`,
      [voteId],
    );
  });

  it("refuse un bulletin sur un vote non publié ou après échéance (trigger ballots)", async () => {
    const slug = `test-closed-${randomUUID()}`;
    const opensAt = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
    const closesAt = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const voteRes = await pool.query<{ id: string }>(
      `INSERT INTO votes (
        slug, question, origin, status_note, argument_pour, argument_pour_author,
        state, opens_at, closes_at
      ) VALUES ($1, 'Vote clos ?', 'admin', 'Consultatif', 'Pour', 'Auteur', 'draft', $2, $3)
      RETURNING id`,
      [slug, opensAt, closesAt],
    );
    const voteId = voteRes.rows[0]?.id;
    expect(voteId).toBeDefined();
    if (!voteId) return;
    createdVoteIds.push(voteId);

    const optRes = await pool.query<{ id: string }>(
      `INSERT INTO vote_options (vote_id, label, position, is_blank)
       VALUES ($1, 'Pour', 1, false)
       RETURNING id`,
      [voteId],
    );
    const optionId = optRes.rows[0]?.id;
    expect(optionId).toBeDefined();
    if (!optionId) return;

    // Refusé car vote encore en brouillon
    await expect(
      pool.query(
        `INSERT INTO ballots (vote_id, token_hash, option_id, revision) VALUES ($1, $2, $3, 1)`,
        [voteId, randomBytes(32), optionId],
      ),
    ).rejects.toThrow(/non publié/i);

    // Publication d'un vote déjà clos -> bulletin refusé par le trigger
    await pool.query(`UPDATE votes SET state = 'published' WHERE id = $1`, [
      voteId,
    ]);

    await expect(
      pool.query(
        `INSERT INTO ballots (vote_id, token_hash, option_id, revision) VALUES ($1, $2, $3, 1)`,
        [voteId, randomBytes(32), optionId],
      ),
    ).rejects.toThrow(/fermé/i);
  });
});
