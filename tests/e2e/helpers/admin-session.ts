import { createHash, randomBytes } from "node:crypto";
import type { Browser } from "@playwright/test";
import { Pool } from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

/**
 * Crée une session admin directement en base pour les préparations E2E,
 * afin de ne pas saturer le rate limiter 3/15 min d'un compte admin unique
 * lors d'exécutions répétées, tout en testant le flux OTP réel côté étudiant.
 */
export async function createAdminRequestContext(
  browser: Browser,
  origin: string,
) {
  const pool = new Pool({ connectionString: DATABASE_URL });
  const rawBytes = randomBytes(32);
  const rawToken = rawBytes.toString("base64url");
  const tokenHash = createHash("sha256").update(rawBytes).digest();
  const voterId = randomBytes(32);

  try {
    await pool.query(
      "INSERT INTO voters (id) VALUES ($1) ON CONFLICT DO NOTHING",
      [voterId],
    );
    await pool.query(
      `INSERT INTO sessions (token_hash, voter_id, is_admin, expires_at)
       VALUES ($1, $2, true, now() + interval '1 day')`,
      [tokenHash, voterId],
    );
  } finally {
    await pool.end();
  }

  const context = await browser.newContext({
    baseURL: origin,
    extraHTTPHeaders: {
      Cookie: `__Host-quorum_session=${rawToken}`,
    },
  });

  return context;
}
