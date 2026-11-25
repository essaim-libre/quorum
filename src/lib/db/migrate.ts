import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  const envPath = path.resolve(process.cwd(), ".env");
  if (existsSync(envPath)) {
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
      if (key === "DATABASE_URL") {
        const value = line
          .slice(eqIdx + 1)
          .trim()
          .replace(/^["']|["']$/g, "");
        if (value.length > 0) {
          return value;
        }
      }
    }
  }

  throw new Error("DATABASE_URL est obligatoire pour exécuter les migrations.");
}

async function runMigrations(): Promise<void> {
  const databaseUrl = resolveDatabaseUrl();

  const pool = new Pool({ connectionString: databaseUrl });
  try {
    const db = drizzle(pool);
    const migrationsFolder = path.resolve(process.cwd(), "drizzle");
    await migrate(db, { migrationsFolder });
    process.stdout.write("Migrations Drizzle appliquées avec succès.\n");
  } finally {
    await pool.end();
  }
}

runMigrations().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Échec de la migration : ${message}\n`);
  process.exit(1);
});
