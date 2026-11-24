import "server-only";
import { randomBytes } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { constantTimeEqual, hmacSha256 } from "@/lib/crypto/hmac";
import { generateVoteKeyPair } from "@/lib/crypto/vote-keys";
import type { Database } from "@/lib/db/client";
import {
  contreProposals,
  contreSupports,
  petitions,
  petitionSignatures,
  voteOptions,
  votes,
} from "@/lib/db/schema";
import { getEnv } from "@/lib/env";
import { recordAdminAction } from "@/lib/journal";
import { log } from "@/lib/log";
import {
  type AdminReviewPetitionInput,
  type CreateContreProposalInput,
  type CreatePetitionInput,
  formatAgOriginDetail,
  parsePostgresIntervalMs,
  PETITION_MAX_OPEN_DELAY_HOURS,
  PETITION_MAX_PER_MONTH,
  PETITION_REJECT_REASON_LABELS,
  PETITION_REVIEW_HOURS,
  type PetitionListView,
} from "@/lib/petitions/rules";
import { buildVoteOptionsWithBlank, slugifyQuestion } from "@/lib/votes/rules";

export type PetitionState =
  | "collecting"
  | "in_review"
  | "changes_requested"
  | "approved"
  | "rejected"
  | "expired";

export interface PublicContreProposal {
  readonly id: string;
  readonly text: string;
  readonly authorLabel: string;
  readonly supports: number;
  readonly createdAt: string;
}

export interface PublicPetitionListItem {
  readonly id: string;
  readonly slug: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly isAgDecision: boolean;
  readonly originDetail: string | null;
  readonly state: PetitionState;
  readonly collectUntil: string;
  readonly threshold: number;
  readonly signaturesCount: number;
  readonly reviewDeadline: string | null;
  readonly voteSlug: string | null;
}

export interface PublicPetitionDetail extends PublicPetitionListItem {
  readonly argumentPour: string;
  readonly argumentPourAuthor: string;
  readonly requestedDuration: string;
  readonly proposedRewording: string | null;
  readonly decisionReason: string | null;
  readonly contreProposals: readonly PublicContreProposal[];
  readonly viewer: {
    readonly hasSigned: boolean;
    readonly isAuthor: boolean;
    readonly supportedContreId: string | null;
  };
}

export interface AdminPetitionItem {
  readonly id: string;
  readonly slug: string;
  readonly question: string;
  readonly options: readonly string[];
  readonly argumentPour: string;
  readonly argumentPourAuthor: string;
  readonly originDetail: string | null;
  readonly requestedDuration: string;
  readonly state: PetitionState;
  readonly signaturesCount: number;
  readonly threshold: number;
  readonly reviewDeadline: string | null;
  readonly proposedRewording: string | null;
  readonly decisionReason: string | null;
  readonly topContre: PublicContreProposal | null;
}

function computeAuthorTag(voterId: Buffer): Buffer {
  return hmacSha256(getEnv().K_SIG, voterId, "author");
}

function computeSignerTag(voterId: Buffer, petitionId: string): Buffer {
  return hmacSha256(getEnv().K_SIG, voterId, petitionId);
}

function computeContreAuthorTag(voterId: Buffer, petitionId: string): Buffer {
  return hmacSha256(getEnv().K_SIG, voterId, petitionId, "contre");
}

async function generateUniquePetitionSlug(
  tx: Pick<Database, "select">,
  question: string,
): Promise<string> {
  const base = slugifyQuestion(question);
  const existing = await tx
    .select({ id: petitions.id })
    .from(petitions)
    .where(eq(petitions.slug, base))
    .limit(1);
  if (existing.length === 0) {
    return base;
  }
  for (let i = 0; i < 10; i += 1) {
    const candidate = `${base}-${randomBytes(3).toString("hex")}`;
    const conflict = await tx
      .select({ id: petitions.id })
      .from(petitions)
      .where(eq(petitions.slug, candidate))
      .limit(1);
    if (conflict.length === 0) {
      return candidate;
    }
  }
  return `${base}-${randomBytes(6).toString("hex")}`;
}

async function generateUniqueVoteSlug(
  tx: Pick<Database, "select">,
  question: string,
): Promise<string> {
  const base = slugifyQuestion(question);
  const existing = await tx
    .select({ id: votes.id })
    .from(votes)
    .where(eq(votes.slug, base))
    .limit(1);
  if (existing.length === 0) {
    return base;
  }
  return `${base}-${randomBytes(3).toString("hex")}`;
}

async function publishVoteFromPetitionTx(
  tx: Parameters<Parameters<Database["transaction"]>[0]>[0],
  petition: typeof petitions.$inferSelect,
  params: {
    readonly opensAt: Date;
    readonly facts?: string | null;
    readonly statusNote?: string;
    readonly journalAction: "petition.approve" | "petition.auto_approve";
    readonly journalReason?: string | null;
  },
): Promise<{ readonly voteId: string; readonly voteSlug: string }> {
  const topContreRows = await tx
    .select({
      text: contreProposals.text,
      authorLabel: contreProposals.authorLabel,
    })
    .from(contreProposals)
    .where(eq(contreProposals.petitionId, petition.id))
    .orderBy(desc(contreProposals.supports), asc(contreProposals.createdAt))
    .limit(1);

  const topContre = topContreRows[0] ?? null;

  const durationMs = parsePostgresIntervalMs(petition.requestedDuration);
  const closesAt = new Date(params.opensAt.getTime() + durationMs);
  const voteSlug = await generateUniqueVoteSlug(tx, petition.question);
  const { publicKeySpki, privateKeyEnc, keyFingerprint } = generateVoteKeyPair(
    getEnv().MASTER_KEY,
  );

  const inserted = await tx
    .insert(votes)
    .values({
      slug: voteSlug,
      question: petition.question,
      origin: "petition",
      originDetail: petition.originDetail,
      petitionId: petition.id,
      statusNote: params.statusNote ?? "Consultatif — issu d’une pétition étudiante",
      argumentPour: petition.argumentPour,
      argumentPourAuthor: petition.argumentPourAuthor,
      argumentContre: topContre?.text ?? null,
      argumentContreAuthor: topContre?.authorLabel ?? null,
      facts: params.facts ?? null,
      state: "draft",
      opensAt: params.opensAt,
      closesAt,
      publicKeySpki,
      privateKeyEnc,
      keyFingerprint,
    })
    .returning({ id: votes.id, slug: votes.slug });

  const createdVote = inserted[0];
  if (!createdVote) {
    throw new Error("vote_from_petition_failed");
  }

  const optionsWithBlank = buildVoteOptionsWithBlank(petition.options);
  await tx.insert(voteOptions).values(
    optionsWithBlank.map((opt) => ({
      voteId: createdVote.id,
      label: opt.label,
      position: opt.position,
      isBlank: opt.isBlank,
    })),
  );

  await tx
    .update(votes)
    .set({ state: "published" })
    .where(eq(votes.id, createdVote.id));

  await tx
    .update(petitions)
    .set({
      state: "approved",
      voteId: createdVote.id,
      proposedRewording: null,
    })
    .where(eq(petitions.id, petition.id));

  await recordAdminAction(tx, {
    action: params.journalAction,
    targetType: "petition",
    targetId: petition.id,
    reason: params.journalReason ?? (params.facts ? "Ajout de faits sourcés" : null),
  });

  await recordAdminAction(tx, {
    action: "vote.publish",
    targetType: "vote",
    targetId: createdVote.id,
    reason: `Issu de la pétition ${petition.slug}`,
  });

  return { voteId: createdVote.id, voteSlug: createdVote.slug };
}

/**
 * Traite les échéances automatiques des pétitions (§3.3 et §3.4) :
 * - expire les pétitions en collecte dont collect_until <= now()
 * - publie automatiquement les pétitions en relecture sans décision après 48 h
 */
export async function processDuePetitions(db: Database): Promise<{
  readonly expiredCount: number;
  readonly autoApprovedCount: number;
}> {
  const expired = await db
    .update(petitions)
    .set({ state: "expired" })
    .where(
      and(
        eq(petitions.state, "collecting"),
        lte(petitions.collectUntil, sql`now()`),
      ),
    )
    .returning({ id: petitions.id });

  const overdueReviews = await db
    .select({ id: petitions.id })
    .from(petitions)
    .where(
      and(
        eq(petitions.state, "in_review"),
        lte(petitions.reviewDeadline, sql`now()`),
      ),
    );

  let autoApprovedCount = 0;
  for (const row of overdueReviews) {
    const approved = await db.transaction(async (tx) => {
      const lockedRows = await tx
        .select()
        .from(petitions)
        .where(eq(petitions.id, row.id))
        .limit(1)
        .for("update");
      const locked = lockedRows[0];
      if (!locked || locked.state !== "in_review") {
        return false;
      }

      const nowRes = await tx.execute(sql`SELECT now() AS db_now`);
      const dbNowRaw = (nowRes.rows[0] as { db_now?: string | Date } | undefined)
        ?.db_now;
      const dbNow = dbNowRaw instanceof Date ? dbNowRaw : new Date(dbNowRaw ?? Date.now());

      if (!locked.reviewDeadline || locked.reviewDeadline.getTime() > dbNow.getTime()) {
        return false;
      }

      await publishVoteFromPetitionTx(tx, locked, {
        opensAt: dbNow,
        journalAction: "petition.auto_approve",
        journalReason: "Publication automatique après 48 h sans décision",
      });
      return true;
    });
    if (approved) {
      autoApprovedCount += 1;
      log("info", "petition.auto_approved", { petitionId: row.id });
    }
  }

  return {
    expiredCount: expired.length,
    autoApprovedCount,
  };
}

/**
 * Purge RGPD 30 jours après la fin d'une pétition (§7 & §15) :
 * supprime petition_signatures, contre_supports et efface author_tag.
 */
export async function purgeEndedPetitionsPersonalTags(
  db: Database,
): Promise<{ readonly purgedPetitions: number }> {
  const ended = await db
    .select({ id: petitions.id })
    .from(petitions)
    .where(
      and(
        inArray(petitions.state, ["approved", "rejected", "expired"]),
        lte(petitions.collectUntil, sql`now() - interval '30 days'`),
      ),
    );

  if (ended.length === 0) {
    return { purgedPetitions: 0 };
  }

  const ids = ended.map((p) => p.id);
  await db.transaction(async (tx) => {
    await tx
      .delete(petitionSignatures)
      .where(inArray(petitionSignatures.petitionId, ids));
    await tx
      .delete(contreSupports)
      .where(inArray(contreSupports.petitionId, ids));
    await tx
      .update(petitions)
      .set({ authorTag: Buffer.alloc(0) })
      .where(inArray(petitions.id, ids));
  });

  return { purgedPetitions: ids.length };
}

export async function createPetition(params: {
  readonly db: Database;
  readonly voterId: Buffer;
  readonly input: CreatePetitionInput;
}): Promise<
  | {
      readonly ok: true;
      readonly id: string;
      readonly slug: string;
      readonly state: PetitionState;
    }
  | {
      readonly ok: false;
      readonly error: "active_petition_exists" | "monthly_petition_limit";
    }
> {
  const env = getEnv();
  const authorTag = computeAuthorTag(params.voterId);

  return params.db.transaction(async (tx) => {
    // Expire d'abord les pétitions dépassées de cet auteur
    await tx
      .update(petitions)
      .set({ state: "expired" })
      .where(
        and(
          eq(petitions.authorTag, authorTag),
          eq(petitions.state, "collecting"),
          lte(petitions.collectUntil, sql`now()`),
        ),
      );

    // §3.2 : une seule pétition active à la fois
    const activeRows = await tx
      .select({ id: petitions.id })
      .from(petitions)
      .where(
        and(
          eq(petitions.authorTag, authorTag),
          inArray(petitions.state, [
            "collecting",
            "in_review",
            "changes_requested",
          ]),
        ),
      )
      .limit(1);

    if (activeRows.length > 0) {
      return { ok: false, error: "active_petition_exists" } as const;
    }

    // §3.2 : 3 pétitions maximum par mois
    const monthlyRows = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(petitions)
      .where(
        and(
          eq(petitions.authorTag, authorTag),
          gte(
            petitions.createdOn,
            sql`date_trunc('month', current_date)::date`,
          ),
        ),
      );

    if (Number(monthlyRows[0]?.total ?? 0) >= PETITION_MAX_PER_MONTH) {
      return { ok: false, error: "monthly_petition_limit" } as const;
    }

    const slug = await generateUniquePetitionSlug(tx, params.input.question);
    const originDetail =
      params.input.isAgDecision &&
      params.input.agDate &&
      params.input.agLocation &&
      params.input.agAttendees &&
      params.input.agResult
        ? formatAgOriginDetail({
            agDate: params.input.agDate,
            agLocation: params.input.agLocation,
            agAttendees: params.input.agAttendees,
            agResult: params.input.agResult,
          })
        : (params.input.originDetail ?? null);

    const threshold = env.PETITION_THRESHOLD;
    const initialState: PetitionState =
      1 >= threshold ? "in_review" : "collecting";

    const inserted = await tx
      .insert(petitions)
      .values({
        slug,
        authorTag,
        question: params.input.question,
        options: params.input.options,
        argumentPour: params.input.argumentPour,
        argumentPourAuthor: params.input.argumentPourAuthor,
        isAgDecision: params.input.isAgDecision,
        originDetail,
        requestedDuration: `${params.input.requestedDurationHours} hours`,
        state: initialState,
        collectUntil: sql`now() + make_interval(days => ${env.PETITION_COLLECT_DAYS})`,
        threshold,
        signaturesCount: 1,
        reviewDeadline:
          initialState === "in_review"
            ? sql`now() + make_interval(hours => ${PETITION_REVIEW_HOURS})`
            : null,
      })
      .returning({
        id: petitions.id,
        slug: petitions.slug,
        state: petitions.state,
      });

    const created = inserted[0];
    if (!created) {
      throw new Error("petition_insert_failed");
    }

    // L'auteur signe automatiquement (§3.2)
    await tx.insert(petitionSignatures).values({
      petitionId: created.id,
      signerTag: computeSignerTag(params.voterId, created.id),
    });

    log("info", "petition.created", {
      petitionId: created.id,
      state: created.state,
    });
    return {
      ok: true,
      id: created.id,
      slug: created.slug,
      state: created.state,
    } as const;
  });
}

export async function listPetitions(
  db: Database,
  view: PetitionListView,
): Promise<PublicPetitionListItem[]> {
  await processDuePetitions(db);

  const states: PetitionState[] =
    view === "collecting"
      ? ["collecting"]
      : ["in_review", "changes_requested"];

  const rows = await db
    .select({
      id: petitions.id,
      slug: petitions.slug,
      question: petitions.question,
      options: petitions.options,
      isAgDecision: petitions.isAgDecision,
      originDetail: petitions.originDetail,
      state: petitions.state,
      collectUntil: petitions.collectUntil,
      threshold: petitions.threshold,
      signaturesCount: petitions.signaturesCount,
      reviewDeadline: petitions.reviewDeadline,
      voteId: petitions.voteId,
    })
    .from(petitions)
    .where(inArray(petitions.state, states))
    .orderBy(desc(petitions.signaturesCount), asc(petitions.collectUntil));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    question: row.question,
    options: row.options,
    isAgDecision: row.isAgDecision,
    originDetail: row.originDetail,
    state: row.state,
    collectUntil: row.collectUntil.toISOString(),
    threshold: row.threshold,
    signaturesCount: row.signaturesCount,
    reviewDeadline: row.reviewDeadline
      ? row.reviewDeadline.toISOString()
      : null,
    voteSlug: null,
  }));
}

export async function getPetitionBySlug(
  db: Database,
  slug: string,
  viewerVoterId?: Buffer | null,
): Promise<PublicPetitionDetail | null> {
  await processDuePetitions(db);

  const rows = await db
    .select()
    .from(petitions)
    .where(eq(petitions.slug, slug))
    .limit(1);

  const row = rows[0];
  if (!row) {
    return null;
  }

  let voteSlug: string | null = null;
  if (row.voteId) {
    const v = (
      await db
        .select({ slug: votes.slug })
        .from(votes)
        .where(eq(votes.id, row.voteId))
        .limit(1)
    )[0];
    voteSlug = v?.slug ?? null;
  }

  const contres = await db
    .select({
      id: contreProposals.id,
      text: contreProposals.text,
      authorLabel: contreProposals.authorLabel,
      supports: contreProposals.supports,
      createdAt: contreProposals.createdAt,
    })
    .from(contreProposals)
    .where(eq(contreProposals.petitionId, row.id))
    .orderBy(desc(contreProposals.supports), asc(contreProposals.createdAt));

  let hasSigned = false;
  let isAuthor = false;
  let supportedContreId: string | null = null;

  if (viewerVoterId) {
    const signerTag = computeSignerTag(viewerVoterId, row.id);
    const sigRows = await db
      .select({ petitionId: petitionSignatures.petitionId })
      .from(petitionSignatures)
      .where(
        and(
          eq(petitionSignatures.petitionId, row.id),
          eq(petitionSignatures.signerTag, signerTag),
        ),
      )
      .limit(1);
    hasSigned = sigRows.length > 0;

    const viewerAuthorTag = computeAuthorTag(viewerVoterId);
    isAuthor =
      row.authorTag.length > 0 &&
      constantTimeEqual(viewerAuthorTag, row.authorTag);

    const supportRows = await db
      .select({ proposalId: contreSupports.proposalId })
      .from(contreSupports)
      .where(
        and(
          eq(contreSupports.petitionId, row.id),
          eq(contreSupports.supporterTag, signerTag),
        ),
      )
      .limit(1);
    supportedContreId = supportRows[0]?.proposalId ?? null;
  }

  return {
    id: row.id,
    slug: row.slug,
    question: row.question,
    options: row.options,
    argumentPour: row.argumentPour,
    argumentPourAuthor: row.argumentPourAuthor,
    isAgDecision: row.isAgDecision,
    originDetail: row.originDetail,
    requestedDuration: row.requestedDuration,
    state: row.state,
    collectUntil: row.collectUntil.toISOString(),
    threshold: row.threshold,
    signaturesCount: row.signaturesCount,
    reviewDeadline: row.reviewDeadline
      ? row.reviewDeadline.toISOString()
      : null,
    proposedRewording: row.proposedRewording,
    decisionReason: row.decisionReason,
    voteSlug,
    contreProposals: contres.map((c) => ({
      id: c.id,
      text: c.text,
      authorLabel: c.authorLabel,
      supports: c.supports,
      createdAt: c.createdAt.toISOString(),
    })),
    viewer: {
      hasSigned,
      isAuthor,
      supportedContreId,
    },
  };
}

export async function signPetition(params: {
  readonly db: Database;
  readonly slug: string;
  readonly voterId: Buffer;
}): Promise<
  | {
      readonly ok: true;
      readonly alreadySigned: boolean;
      readonly signaturesCount: number;
      readonly state: PetitionState;
    }
  | {
      readonly ok: false;
      readonly error: "not_found" | "petition_not_collecting";
    }
> {
  return params.db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: petitions.id,
        state: petitions.state,
        threshold: petitions.threshold,
        signaturesCount: petitions.signaturesCount,
        isExpired: sql<boolean>`(${petitions.collectUntil} <= now())`,
      })
      .from(petitions)
      .where(eq(petitions.slug, params.slug))
      .limit(1)
      .for("update");

    const petition = rows[0];
    if (!petition) {
      return { ok: false, error: "not_found" } as const;
    }

    if (petition.state === "collecting" && petition.isExpired) {
      await tx
        .update(petitions)
        .set({ state: "expired" })
        .where(eq(petitions.id, petition.id));
      return { ok: false, error: "petition_not_collecting" } as const;
    }

    if (petition.state !== "collecting") {
      return { ok: false, error: "petition_not_collecting" } as const;
    }

    const signerTag = computeSignerTag(params.voterId, petition.id);
    const inserted = await tx
      .insert(petitionSignatures)
      .values({ petitionId: petition.id, signerTag })
      .onConflictDoNothing()
      .returning({ petitionId: petitionSignatures.petitionId });

    if (inserted.length === 0) {
      return {
        ok: true,
        alreadySigned: true,
        signaturesCount: petition.signaturesCount,
        state: petition.state,
      } as const;
    }

    const nextCount = petition.signaturesCount + 1;
    const reachedThreshold = nextCount >= petition.threshold;
    const nextState: PetitionState = reachedThreshold
      ? "in_review"
      : "collecting";

    await tx
      .update(petitions)
      .set({
        signaturesCount: nextCount,
        state: nextState,
        ...(reachedThreshold
          ? {
              reviewDeadline: sql`now() + make_interval(hours => ${PETITION_REVIEW_HOURS})`,
            }
          : {}),
      })
      .where(eq(petitions.id, petition.id));

    if (reachedThreshold) {
      log("info", "petition.threshold_reached", { petitionId: petition.id });
    }

    return {
      ok: true,
      alreadySigned: false,
      signaturesCount: nextCount,
      state: nextState,
    } as const;
  });
}

export async function addContreProposal(params: {
  readonly db: Database;
  readonly slug: string;
  readonly voterId: Buffer;
  readonly input: CreateContreProposalInput;
}): Promise<
  | { readonly ok: true; readonly proposal: PublicContreProposal }
  | {
      readonly ok: false;
      readonly error: "not_found" | "petition_not_collecting";
    }
> {
  return params.db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: petitions.id,
        state: petitions.state,
        isExpired: sql<boolean>`(${petitions.collectUntil} <= now())`,
      })
      .from(petitions)
      .where(eq(petitions.slug, params.slug))
      .limit(1);

    const petition = rows[0];
    if (!petition) {
      return { ok: false, error: "not_found" } as const;
    }
    if (petition.state !== "collecting" || petition.isExpired) {
      return { ok: false, error: "petition_not_collecting" } as const;
    }

    const inserted = await tx
      .insert(contreProposals)
      .values({
        petitionId: petition.id,
        text: params.input.text,
        authorLabel: params.input.authorLabel,
        authorTag: computeContreAuthorTag(params.voterId, petition.id),
      })
      .returning();

    const proposal = inserted[0];
    if (!proposal) {
      throw new Error("contre_insert_failed");
    }

    return {
      ok: true,
      proposal: {
        id: proposal.id,
        text: proposal.text,
        authorLabel: proposal.authorLabel,
        supports: proposal.supports,
        createdAt: proposal.createdAt.toISOString(),
      },
    } as const;
  });
}

/**
 * Soutien unique et remplaçable d'un texte « Contre » par pétition (§3.3).
 */
export async function supportContreProposal(params: {
  readonly db: Database;
  readonly proposalId: string;
  readonly voterId: Buffer;
}): Promise<
  | { readonly ok: true; readonly proposalId: string; readonly supports: number }
  | {
      readonly ok: false;
      readonly error: "not_found" | "petition_not_collecting";
    }
> {
  return params.db.transaction(async (tx) => {
    const propRows = await tx
      .select({
        id: contreProposals.id,
        petitionId: contreProposals.petitionId,
        supports: contreProposals.supports,
      })
      .from(contreProposals)
      .where(eq(contreProposals.id, params.proposalId))
      .limit(1)
      .for("update");

    const proposal = propRows[0];
    if (!proposal) {
      return { ok: false, error: "not_found" } as const;
    }

    const petRows = await tx
      .select({
        state: petitions.state,
        isExpired: sql<boolean>`(${petitions.collectUntil} <= now())`,
      })
      .from(petitions)
      .where(eq(petitions.id, proposal.petitionId))
      .limit(1);

    const petition = petRows[0];
    if (!petition || petition.state !== "collecting" || petition.isExpired) {
      return { ok: false, error: "petition_not_collecting" } as const;
    }

    const supporterTag = computeSignerTag(params.voterId, proposal.petitionId);

    const existingRows = await tx
      .select({ proposalId: contreSupports.proposalId })
      .from(contreSupports)
      .where(
        and(
          eq(contreSupports.petitionId, proposal.petitionId),
          eq(contreSupports.supporterTag, supporterTag),
        ),
      )
      .limit(1)
      .for("update");

    const existing = existingRows[0];
    if (existing) {
      if (existing.proposalId === proposal.id) {
        return {
          ok: true,
          proposalId: proposal.id,
          supports: proposal.supports,
        } as const;
      }

      // Décrémente l'ancien texte soutenu et remplace par le nouveau
      await tx
        .update(contreProposals)
        .set({ supports: sql`GREATEST(0, ${contreProposals.supports} - 1)` })
        .where(eq(contreProposals.id, existing.proposalId));

      await tx
        .update(contreSupports)
        .set({ proposalId: proposal.id })
        .where(
          and(
            eq(contreSupports.petitionId, proposal.petitionId),
            eq(contreSupports.supporterTag, supporterTag),
          ),
        );
    } else {
      await tx.insert(contreSupports).values({
        petitionId: proposal.petitionId,
        supporterTag,
        proposalId: proposal.id,
      });
    }

    const updated = await tx
      .update(contreProposals)
      .set({ supports: sql`${contreProposals.supports} + 1` })
      .where(eq(contreProposals.id, proposal.id))
      .returning({ supports: contreProposals.supports });

    return {
      ok: true,
      proposalId: proposal.id,
      supports: updated[0]?.supports ?? proposal.supports + 1,
    } as const;
  });
}

export async function respondToRewording(params: {
  readonly db: Database;
  readonly slug: string;
  readonly voterId: Buffer;
  readonly accept: boolean;
}): Promise<
  | { readonly ok: true; readonly state: PetitionState; readonly question: string }
  | {
      readonly ok: false;
      readonly error: "not_found" | "forbidden" | "invalid_state";
    }
> {
  return params.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(petitions)
      .where(eq(petitions.slug, params.slug))
      .limit(1)
      .for("update");

    const petition = rows[0];
    if (!petition) {
      return { ok: false, error: "not_found" } as const;
    }

    const viewerAuthorTag = computeAuthorTag(params.voterId);
    if (
      petition.authorTag.length === 0 ||
      !constantTimeEqual(viewerAuthorTag, petition.authorTag)
    ) {
      return { ok: false, error: "forbidden" } as const;
    }

    if (petition.state !== "changes_requested" || !petition.proposedRewording) {
      return { ok: false, error: "invalid_state" } as const;
    }

    const nextQuestion = params.accept
      ? petition.proposedRewording
      : petition.question;

    await tx
      .update(petitions)
      .set({
        question: nextQuestion,
        proposedRewording: null,
        state: "in_review",
        reviewDeadline: sql`now() + make_interval(hours => ${PETITION_REVIEW_HOURS})`,
      })
      .where(eq(petitions.id, petition.id));

    return {
      ok: true,
      state: "in_review",
      question: nextQuestion,
    } as const;
  });
}

export async function listAdminPetitionsForReview(
  db: Database,
): Promise<AdminPetitionItem[]> {
  await processDuePetitions(db);

  const rows = await db
    .select()
    .from(petitions)
    .where(inArray(petitions.state, ["in_review", "changes_requested"]))
    .orderBy(asc(petitions.reviewDeadline));

  if (rows.length === 0) {
    return [];
  }

  const ids = rows.map((r) => r.id);
  const allContres = await db
    .select({
      id: contreProposals.id,
      petitionId: contreProposals.petitionId,
      text: contreProposals.text,
      authorLabel: contreProposals.authorLabel,
      supports: contreProposals.supports,
      createdAt: contreProposals.createdAt,
    })
    .from(contreProposals)
    .where(inArray(contreProposals.petitionId, ids))
    .orderBy(desc(contreProposals.supports), asc(contreProposals.createdAt));

  const topContreByPetition = new Map<string, PublicContreProposal>();
  for (const c of allContres) {
    if (!topContreByPetition.has(c.petitionId)) {
      topContreByPetition.set(c.petitionId, {
        id: c.id,
        text: c.text,
        authorLabel: c.authorLabel,
        supports: c.supports,
        createdAt: c.createdAt.toISOString(),
      });
    }
  }

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    question: row.question,
    options: row.options,
    argumentPour: row.argumentPour,
    argumentPourAuthor: row.argumentPourAuthor,
    originDetail: row.originDetail,
    requestedDuration: row.requestedDuration,
    state: row.state,
    signaturesCount: row.signaturesCount,
    threshold: row.threshold,
    reviewDeadline: row.reviewDeadline
      ? row.reviewDeadline.toISOString()
      : null,
    proposedRewording: row.proposedRewording,
    decisionReason: row.decisionReason,
    topContre: topContreByPetition.get(row.id) ?? null,
  }));
}

export async function reviewPetition(params: {
  readonly db: Database;
  readonly petitionId: string;
  readonly input: AdminReviewPetitionInput;
}): Promise<
  | {
      readonly ok: true;
      readonly state: PetitionState;
      readonly voteId?: string;
      readonly voteSlug?: string;
    }
  | {
      readonly ok: false;
      readonly error: "not_found" | "invalid_state" | "invalid_opens_at";
    }
> {
  return params.db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(petitions)
      .where(eq(petitions.id, params.petitionId))
      .limit(1)
      .for("update");

    const petition = rows[0];
    if (!petition) {
      return { ok: false, error: "not_found" } as const;
    }

    const nowRes = await tx.execute(sql`SELECT now() AS db_now`);
    const dbNowRaw = (nowRes.rows[0] as { db_now?: string | Date } | undefined)
      ?.db_now;
    const dbNow =
      dbNowRaw instanceof Date ? dbNowRaw : new Date(dbNowRaw ?? Date.now());

    if (params.input.decision === "approve") {
      if (petition.state !== "in_review") {
        return { ok: false, error: "invalid_state" } as const;
      }

      const opensAt = params.input.opensAt ?? dbNow;
      const maxOpensAtMs =
        dbNow.getTime() + PETITION_MAX_OPEN_DELAY_HOURS * 60 * 60 * 1000;
      if (opensAt.getTime() > maxOpensAtMs) {
        return { ok: false, error: "invalid_opens_at" } as const;
      }

      const { voteId, voteSlug } = await publishVoteFromPetitionTx(
        tx,
        petition,
        {
          opensAt,
          facts: params.input.facts ?? null,
          statusNote: params.input.statusNote,
          journalAction: "petition.approve",
        },
      );

      log("info", "admin.petition.approved", {
        petitionId: petition.id,
        voteId,
      });
      return { ok: true, state: "approved", voteId, voteSlug } as const;
    }

    if (params.input.decision === "request_changes") {
      if (petition.state !== "in_review") {
        return { ok: false, error: "invalid_state" } as const;
      }

      await tx
        .update(petitions)
        .set({
          state: "changes_requested",
          proposedRewording: params.input.proposedRewording,
          decisionReason: params.input.reason ?? null,
        })
        .where(eq(petitions.id, petition.id));

      await recordAdminAction(tx, {
        action: "petition.request_changes",
        targetType: "petition",
        targetId: petition.id,
        reason: params.input.reason ?? params.input.proposedRewording,
      });

      log("info", "admin.petition.changes_requested", {
        petitionId: petition.id,
      });
      return { ok: true, state: "changes_requested" } as const;
    }

    // decision === "reject"
    if (
      petition.state !== "in_review" &&
      petition.state !== "changes_requested"
    ) {
      return { ok: false, error: "invalid_state" } as const;
    }

    const reasonLabel = PETITION_REJECT_REASON_LABELS[params.input.rejectReason];
    await tx
      .update(petitions)
      .set({
        state: "rejected",
        decisionReason: reasonLabel,
        proposedRewording: null,
      })
      .where(eq(petitions.id, petition.id));

    await recordAdminAction(tx, {
      action: "petition.reject",
      targetType: "petition",
      targetId: petition.id,
      reason: reasonLabel,
    });

    log("info", "admin.petition.rejected", {
      petitionId: petition.id,
      reasonCode: params.input.rejectReason,
    });
    return { ok: true, state: "rejected" } as const;
  });
}
