import { createHash, createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Browser } from "@playwright/test";
import { Pool } from "pg";

function readDotEnvMap(): Map<string, string> {
  const map = new Map<string, string>();
  const envPath = path.resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) {
    return map;
  }
  const content = readFileSync(envPath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const eqIdx = line.indexOf("=");
    if (eqIdx === -1) {
      continue;
    }
    const key = line.slice(0, eqIdx).trim();
    const value = line
      .slice(eqIdx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    map.set(key, value);
  }
  return map;
}

function getConfigValue(key: string, fallback = ""): string {
  const fromProcess = process.env[key];
  if (fromProcess && fromProcess.length > 0) {
    return fromProcess;
  }
  return readDotEnvMap().get(key) ?? fallback;
}

/**
 * Crée une session admin directement en base pour les préparations E2E,
 * en dérivant le vrai `voter_id = HMAC-SHA256(K_ID, adminEmail)` issu de `ADMIN_EMAILS`
 * (compatible avec le recalcul dynamique SEC-08 de `isAdmin` à chaque requête).
 */
export async function createAdminRequestContext(
  browser: Browser,
  origin: string,
) {
  const databaseUrl = getConfigValue(
    "DATABASE_URL",
    "postgres://quorum:quorum@localhost:5432/quorum",
  );
  const kIdBase64 = getConfigValue("K_ID");
  const adminEmailsRaw = getConfigValue("ADMIN_EMAILS");
  const firstAdminEmail = adminEmailsRaw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .find((s) => s.length > 0);

  if (!kIdBase64 || !firstAdminEmail) {
    throw new Error(
      "K_ID et ADMIN_EMAILS doivent être définis dans l'environnement ou .env pour les tests E2E.",
    );
  }

  const kId = Buffer.from(kIdBase64, "base64");
  const voterId = createHmac("sha256", kId)
    .update(firstAdminEmail, "utf8")
    .digest();

  const pool = new Pool({ connectionString: databaseUrl });
  const rawBytes = randomBytes(32);
  const rawToken = rawBytes.toString("base64url");
  const tokenHash = createHash("sha256").update(rawBytes).digest();

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
