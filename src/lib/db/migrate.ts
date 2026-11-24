import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

async function runMigrations(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL est obligatoire pour exécuter les migrations.");
  }

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
