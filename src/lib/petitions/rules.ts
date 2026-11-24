import { z } from "zod";
import {
  BLANK_OPTION_LABEL,
  VOTE_DEFAULT_DURATION_HOURS,
  VOTE_MAX_DURATION_HOURS,
  VOTE_MIN_DURATION_HOURS,
} from "@/lib/votes/rules";

export const PETITION_REVIEW_HOURS = 48;
export const PETITION_MAX_OPEN_DELAY_HOURS = 24;
export const PETITION_MAX_PER_MONTH = 3;

export const PETITION_REJECT_REASON_CODES = [
  "out_of_scope",
  "illegal_or_abusive",
  "duplicate_vote",
  "charter_non_compliant",
] as const;

export type PetitionRejectReasonCode =
  (typeof PETITION_REJECT_REASON_CODES)[number];

export const PETITION_REJECT_REASON_LABELS: Record<
  PetitionRejectReasonCode,
  string
> = {
  out_of_scope: "Hors du champ de l’université",
  illegal_or_abusive: "Contenu illégal ou injurieux",
  duplicate_vote: "Doublon d’un vote ouvert ou à venir",
  charter_non_compliant: "Formulation non conforme à la charte",
};

export const petitionListViewSchema = z.enum(["collecting", "in_review"]);
export type PetitionListView = z.infer<typeof petitionListViewSchema>;

const petitionOptionSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .refine(
    (label) => label.toLowerCase() !== BLANK_OPTION_LABEL.toLowerCase(),
    "« Vote blanc » est ajouté automatiquement en dernière position.",
  );

export const createPetitionSchema = z
  .object({
    question: z.string().trim().min(5).max(140),
    options: z
      .array(petitionOptionSchema)
      .min(2)
      .max(4)
      .refine((items) => {
        const lower = items.map((i) => i.toLowerCase());
        return new Set(lower).size === lower.length;
      }, "Les options doivent être distinctes."),
    argumentPour: z.string().trim().min(5).max(600),
    argumentPourAuthor: z.string().trim().min(1).max(120),
    requestedDurationHours: z
      .number()
      .int()
      .min(VOTE_MIN_DURATION_HOURS)
      .max(VOTE_MAX_DURATION_HOURS)
      .default(VOTE_DEFAULT_DURATION_HOURS),
    isAgDecision: z.boolean().default(false),
    originDetail: z.string().trim().max(240).optional().nullable(),
    agDate: z.string().trim().max(60).optional(),
    agLocation: z.string().trim().max(100).optional(),
    agAttendees: z.coerce.number().int().positive().max(100_000).optional(),
    agResult: z.string().trim().max(120).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.isAgDecision) {
      if (!data.agDate || !data.agLocation || !data.agAttendees || !data.agResult) {
        ctx.addIssue({
          code: "custom",
          path: ["isAgDecision"],
          message:
            "Pour une décision d'AG, renseigne la date, le lieu, le nombre de présents et le résultat.",
        });
      }
    }
  });

export const createContreProposalSchema = z.object({
  text: z.string().trim().min(5).max(600),
  authorLabel: z.string().trim().min(1).max(120),
});

export const acceptRewordingSchema = z.object({
  accept: z.boolean().default(true),
});

export const adminReviewPetitionSchema = z.discriminatedUnion("decision", [
  z.object({
    decision: z.literal("approve"),
    opensAt: z
      .string()
      .datetime({ offset: true })
      .transform((v) => new Date(v))
      .optional(),
    facts: z.string().trim().max(2000).optional().nullable(),
    statusNote: z.string().trim().min(3).max(240).optional(),
  }),
  z.object({
    decision: z.literal("request_changes"),
    proposedRewording: z.string().trim().min(5).max(140),
    reason: z.string().trim().max(400).optional(),
  }),
  z.object({
    decision: z.literal("reject"),
    rejectReason: z.enum(PETITION_REJECT_REASON_CODES),
  }),
]);

export type CreatePetitionInput = z.infer<typeof createPetitionSchema>;
export type CreateContreProposalInput = z.infer<
  typeof createContreProposalSchema
>;
export type AdminReviewPetitionInput = z.infer<typeof adminReviewPetitionSchema>;

export function formatAgOriginDetail(input: {
  readonly agDate: string;
  readonly agLocation: string;
  readonly agAttendees: number;
  readonly agResult: string;
}): string {
  return `AG du ${input.agDate}, ${input.agLocation}, ${input.agAttendees} présents — ${input.agResult}`.slice(
    0,
    240,
  );
}

/**
 * Convertit un intervalle PostgreSQL (ex. "72:00:00", "3 days", "3 days 00:00:00")
 * en millisecondes. Repli sur 72 h si format inattendu.
 */
export function parsePostgresIntervalMs(raw: string): number {
  const daysMatch = /(\d+)\s+day/i.exec(raw);
  const timeMatch = /(\d+):(\d+):(\d+)/.exec(raw);
  let totalMs = 0;
  if (daysMatch?.[1]) {
    totalMs += Number(daysMatch[1]) * 24 * 60 * 60 * 1000;
  }
  if (timeMatch?.[1] && timeMatch[2] && timeMatch[3]) {
    totalMs +=
      (Number(timeMatch[1]) * 3600 +
        Number(timeMatch[2]) * 60 +
        Number(timeMatch[3])) *
      1000;
  }
  if (totalMs <= 0) {
    return VOTE_DEFAULT_DURATION_HOURS * 60 * 60 * 1000;
  }
  return totalMs;
}
