import "server-only";
import { desc, eq, inArray } from "drizzle-orm";
import { copy } from "@/copy/fr";
import type { Database } from "@/lib/db/client";
import { adminJournal, petitions, votes } from "@/lib/db/schema";

export type JournalTargetType = "vote" | "petition";

export interface PublicJournalEntry {
  readonly id: string;
  readonly at: string;
  readonly action: string;
  readonly targetType: string;
  readonly targetId: string;
  readonly targetLabel: string;
  readonly targetHref: string | null;
  readonly reason: string | null;
}

export async function recordAdminAction(
  tx: Pick<Database, "insert">,
  params: {
    readonly action: string;
    readonly targetType: JournalTargetType;
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

export interface ListPublicJournalOptions {
  readonly limit?: number;
  readonly targetType?: JournalTargetType;
}

export async function listPublicJournal(
  db: Database,
  options: number | ListPublicJournalOptions = 200,
): Promise<PublicJournalEntry[]> {
  const limit = typeof options === "number" ? options : (options.limit ?? 200);
  const targetType =
    typeof options === "number" ? undefined : options.targetType;

  const baseQuery = db
    .select({
      id: adminJournal.id,
      at: adminJournal.at,
      action: adminJournal.action,
      targetType: adminJournal.targetType,
      targetId: adminJournal.targetId,
      reason: adminJournal.reason,
    })
    .from(adminJournal);

  const rows = targetType
    ? await baseQuery
        .where(eq(adminJournal.targetType, targetType))
        .orderBy(desc(adminJournal.id))
        .limit(limit)
    : await baseQuery.orderBy(desc(adminJournal.id)).limit(limit);

  const voteIds = Array.from(
    new Set(
      rows
        .filter((row) => row.targetType === "vote")
        .map((row) => row.targetId),
    ),
  );
  const petitionIds = Array.from(
    new Set(
      rows
        .filter((row) => row.targetType === "petition")
        .map((row) => row.targetId),
    ),
  );

  const [voteRows, petitionRows] = await Promise.all([
    voteIds.length > 0
      ? db
          .select({
            id: votes.id,
            slug: votes.slug,
            question: votes.question,
            state: votes.state,
          })
          .from(votes)
          .where(inArray(votes.id, voteIds))
      : Promise.resolve([]),
    petitionIds.length > 0
      ? db
          .select({
            id: petitions.id,
            slug: petitions.slug,
            question: petitions.question,
          })
          .from(petitions)
          .where(inArray(petitions.id, petitionIds))
      : Promise.resolve([]),
  ]);

  const votesById = new Map(voteRows.map((v) => [v.id, v]));
  const petitionsById = new Map(petitionRows.map((p) => [p.id, p]));

  return rows.map((row) => {
    const shortId = row.targetId.slice(0, 8);
    let targetLabel = `${row.targetType}:${shortId}`;
    let targetHref: string | null = null;

    if (row.targetType === "vote") {
      const vote = votesById.get(row.targetId);
      if (vote?.state === "published") {
        targetLabel = vote.question;
        targetHref = `/votes/${vote.slug}`;
      } else if (vote?.state === "cancelled") {
        targetLabel = `${copy.journal.cancelledPrefix} ${vote.question}`;
      } else {
        // Ne pas divulguer le libellé d'un brouillon non publié
        targetLabel = copy.journal.draftLabel(shortId);
      }
    } else if (row.targetType === "petition") {
      const petition = petitionsById.get(row.targetId);
      if (petition) {
        targetLabel = petition.question;
        targetHref = `/petitions/${petition.slug}`;
      }
    }

    return {
      id: row.id.toString(),
      at: row.at.toISOString(),
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      targetLabel,
      targetHref,
      reason: row.reason,
    };
  });
}
