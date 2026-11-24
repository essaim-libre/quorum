import "server-only";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getEnv } from "@/lib/env";
import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

let poolInstance: Pool | null = null;
let dbInstance: Database | null = null;

export function getPool(): Pool {
  if (!poolInstance) {
    const { DATABASE_URL } = getEnv();
    poolInstance = new Pool({
      connectionString: DATABASE_URL,
    });
  }
  return poolInstance;
}

export function getDb(): Database {
  if (!dbInstance) {
    dbInstance = drizzle(getPool(), { schema });
  }
  return dbInstance;
}

export async function closeDb(): Promise<void> {
  if (poolInstance) {
    await poolInstance.end();
    poolInstance = null;
    dbInstance = null;
  }
}
