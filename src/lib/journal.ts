import "server-only";
import { desc } from "drizzle-orm";
import type { Database } from "@/lib/db/client";
import { adminJournal } from "@/lib/db/schema";

export interface PublicJournalEntry {
  readonly id: string;
  readonly at: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly reason: string | null;
}

export async function recordAdminAction(
  tx: Pick<Database, "insert">,
  params: {
    readonly action: string;
    readonly targetType: "vote" | "petition";
    readonly targetId: string;
    readonly reason?: string | null;
  },
): Promise<void> {
  await tx.insert(adminJournal).values({
    action: params.action,
    targetType: params.targetType,
    targetId: params.targetId,
    reason: params.reason ?? null,
  });
}

export async function listPublicJournal(
  db: Database,
  limit = 200,
): Promise<PublicJournalEntry[]> {
  const rows = await db
    .select({
      id: adminJournal.id,
      at: adminJournal.at,
      action: adminJournal.action,
      targetType: adminJournal.targetType,
      targetId: adminJournal.targetId,
      reason: adminJournal.reason,
    })
    .from(adminJournal)
    .orderBy(desc(adminJournal.id))
    .limit(limit);

  return rows.map((row) => ({
    id: row.id.toString(),
    at: row.at.toISOString(),
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    reason: row.reason,
  }));
}
