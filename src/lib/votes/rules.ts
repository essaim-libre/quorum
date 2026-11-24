import { z } from "zod";

export const VOTE_MIN_DURATION_HOURS = 24;
export const VOTE_DEFAULT_DURATION_HOURS = 72;
export const VOTE_MAX_DURATION_HOURS = 14 * 24;

export const VOTE_MIN_DURATION_MS = VOTE_MIN_DURATION_HOURS * 60 * 60 * 1000;
export const VOTE_MAX_DURATION_MS = VOTE_MAX_DURATION_HOURS * 60 * 60 * 1000;

export const BLANK_OPTION_LABEL = "Vote blanc";

export type PublishedVoteStatus = "open" | "upcoming" | "closed";
export type VoteListView = PublishedVoteStatus;

export const voteListViewSchema = z.enum(["open", "upcoming", "closed"]);

const nonBlankOptionSchema = z
  .string()
  .trim()
  .min(1, "Chaque option doit contenir au moins un caractère.")
  .max(80, "Chaque option fait 80 caractères maximum.")
  .refine(
    (label) => label.toLowerCase() !== BLANK_OPTION_LABEL.toLowerCase(),
    "« Vote blanc » est ajouté automatiquement en dernière position.",
  );

const isoDateStringSchema = z
  .string()
  .datetime({ offset: true })
  .transform((value) => new Date(value));

export const createVoteDraftSchema = z
  .object({
    question: z.string().trim().min(5).max(140),
    options: z
      .array(nonBlankOptionSchema)
      .min(2, "Entre 2 et 4 options sont requises.")
      .max(4, "Entre 2 et 4 options sont requises.")
      .refine((items) => {
        const normalized = items.map((i) => i.toLowerCase());
        return new Set(normalized).size === normalized.length;
      }, "Les options doivent être distinctes."),
    statusNote: z.string().trim().min(3).max(240),
    originDetail: z.string().trim().max(240).optional().nullable(),
    argumentPour: z.string().trim().min(5).max(600),
    argumentPourAuthor: z.string().trim().min(1).max(120),
    argumentContre: z.string().trim().max(600).optional().nullable(),
    argumentContreAuthor: z.string().trim().max(120).optional().nullable(),
    facts: z.string().trim().max(2000).optional().nullable(),
    opensAt: isoDateStringSchema.optional().nullable(),
    closesAt: isoDateStringSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    const hasOpens = data.opensAt !== undefined && data.opensAt !== null;
    const hasCloses = data.closesAt !== undefined && data.closesAt !== null;
    if (hasOpens !== hasCloses) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAt"],
        message:
          "opensAt et closesAt doivent être renseignés ensemble ou laissés vides.",
      });
      return;
    }
    if (data.opensAt && data.closesAt) {
      const durationMs = data.closesAt.getTime() - data.opensAt.getTime();
      if (
        durationMs < VOTE_MIN_DURATION_MS ||
        durationMs > VOTE_MAX_DURATION_MS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: "La durée du vote doit être comprise entre 24 h et 14 jours.",
        });
      }
    }
  });

export const updateVoteDraftSchema = z
  .object({
    question: z.string().trim().min(5).max(140).optional(),
    options: z
      .array(nonBlankOptionSchema)
      .min(2)
      .max(4)
      .refine((items) => {
        const normalized = items.map((i) => i.toLowerCase());
        return new Set(normalized).size === normalized.length;
      }, "Les options doivent être distinctes.")
      .optional(),
    statusNote: z.string().trim().min(3).max(240).optional(),
    originDetail: z.string().trim().max(240).optional().nullable(),
    argumentPour: z.string().trim().min(5).max(600).optional(),
    argumentPourAuthor: z.string().trim().min(1).max(120).optional(),
    argumentContre: z.string().trim().max(600).optional().nullable(),
    argumentContreAuthor: z.string().trim().max(120).optional().nullable(),
    facts: z.string().trim().max(2000).optional().nullable(),
    opensAt: isoDateStringSchema.optional().nullable(),
    closesAt: isoDateStringSchema.optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.opensAt && data.closesAt) {
      const durationMs = data.closesAt.getTime() - data.opensAt.getTime();
      if (
        durationMs < VOTE_MIN_DURATION_MS ||
        durationMs > VOTE_MAX_DURATION_MS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: "La durée du vote doit être comprise entre 24 h et 14 jours.",
        });
      }
    }
  });

export const publishVoteSchema = z
  .object({
    opensAt: isoDateStringSchema.optional(),
    closesAt: isoDateStringSchema.optional(),
    durationHours: z
      .number()
      .int()
      .min(VOTE_MIN_DURATION_HOURS)
      .max(VOTE_MAX_DURATION_HOURS)
      .optional(),
  })
  .superRefine((data, ctx) => {
    if (data.opensAt && data.closesAt) {
      const durationMs = data.closesAt.getTime() - data.opensAt.getTime();
      if (
        durationMs < VOTE_MIN_DURATION_MS ||
        durationMs > VOTE_MAX_DURATION_MS
      ) {
        ctx.addIssue({
          code: "custom",
          path: ["closesAt"],
          message: "La durée du vote doit être comprise entre 24 h et 14 jours.",
        });
      }
    }
  });

export const cancelVoteSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(5, "Un motif public d'au moins 5 caractères est requis.")
    .max(500),
});

export type CreateVoteDraftInput = z.infer<typeof createVoteDraftSchema>;
export type UpdateVoteDraftInput = z.infer<typeof updateVoteDraftSchema>;
export type PublishVoteInput = z.infer<typeof publishVoteSchema>;
export type CancelVoteInput = z.infer<typeof cancelVoteSchema>;

export function classifyPublishedVote(
  opensAt: Date,
  closesAt: Date,
  referenceNow: Date,
): PublishedVoteStatus {
  const nowMs = referenceNow.getTime();
  if (nowMs < opensAt.getTime()) {
    return "upcoming";
  }
  if (nowMs >= closesAt.getTime()) {
    return "closed";
  }
  return "open";
}

export function slugifyQuestion(question: string): string {
  const base = question
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);

  return base.length > 0 ? base : "scrutin";
}

export function buildVoteOptionsWithBlank(
  labels: readonly string[],
): Array<{ label: string; position: number; isBlank: boolean }> {
  const regular = labels.map((label, index) => ({
    label: label.trim(),
    position: index + 1,
    isBlank: false,
  }));

  return [
    ...regular,
    {
      label: BLANK_OPTION_LABEL,
      position: regular.length + 1,
      isBlank: true,
    },
  ];
}

export function computeParticipationRate(
  ballotsCount: number,
  electorateSize: number,
): number {
  if (electorateSize <= 0 || ballotsCount <= 0) {
    return 0;
  }
  return ballotsCount / electorateSize;
}
