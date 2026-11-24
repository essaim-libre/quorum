import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  customType,
  date,
  index,
  integer,
  interval,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// Enums
export const voteOriginEnum = pgEnum("vote_origin", ["admin", "petition"]);
export const voteStateEnum = pgEnum("vote_state", [
  "draft",
  "published",
  "cancelled",
]);
export const petitionStateEnum = pgEnum("petition_state", [
  "collecting",
  "in_review",
  "changes_requested",
  "approved",
  "rejected",
  "expired",
]);

// Identités pseudonymes
export const voters = pgTable("voters", {
  id: bytea("id").primaryKey(),
  createdOn: date("created_on")
    .notNull()
    .default(sql`current_date`),
});

export const otpCodes = pgTable(
  "otp_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voterId: bytea("voter_id").notNull(),
    codeHash: bytea("code_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    attempts: smallint("attempts").notNull().default(0),
    consumed: boolean("consumed").notNull().default(false),
  },
  (table) => [index("otp_codes_voter_id_idx").on(table.voterId)],
);

export const sessions = pgTable("sessions", {
  tokenHash: bytea("token_hash").primaryKey(),
  voterId: bytea("voter_id")
    .notNull()
    .references(() => voters.id, { onDelete: "cascade" }),
  isAdmin: boolean("is_admin").notNull().default(false),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

// Votes
export const votes = pgTable(
  "votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    question: text("question").notNull(),
    origin: voteOriginEnum("origin").notNull(),
    originDetail: text("origin_detail"),
    petitionId: uuid("petition_id"),
    statusNote: text("status_note").notNull(),
    argumentPour: text("argument_pour").notNull(),
    argumentPourAuthor: text("argument_pour_author").notNull(),
    argumentContre: text("argument_contre"),
    argumentContreAuthor: text("argument_contre_author"),
    facts: text("facts"),
    state: voteStateEnum("state").notNull().default("draft"),
    opensAt: timestamp("opens_at", { withTimezone: true }),
    closesAt: timestamp("closes_at", { withTimezone: true }),
    publicKeySpki: bytea("public_key_spki"),
    privateKeyEnc: bytea("private_key_enc"),
    keyFingerprint: text("key_fingerprint"),
    tokensIssued: integer("tokens_issued"),
    cancelReason: text("cancel_reason"),
  },
  (table) => [
    check("votes_question_len_chk", sql`char_length(${table.question}) <= 140`),
    check(
      "votes_argument_pour_len_chk",
      sql`char_length(${table.argumentPour}) <= 600`,
    ),
    check(
      "votes_argument_contre_len_chk",
      sql`${table.argumentContre} IS NULL OR char_length(${table.argumentContre}) <= 600`,
    ),
    check(
      "votes_duration_chk",
      sql`${table.closesAt} - ${table.opensAt} BETWEEN interval '24 hours' AND interval '14 days'`,
    ),
  ],
);

export const voteOptions = pgTable(
  "vote_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id, { onDelete: "cascade" }),
    label: text("label").notNull(),
    position: smallint("position").notNull(),
    isBlank: boolean("is_blank").notNull().default(false),
  },
  (table) => [
    unique("vote_options_vote_id_position_uniq").on(
      table.voteId,
      table.position,
    ),
    check("vote_options_label_len_chk", sql`char_length(${table.label}) <= 80`),
  ],
);

// Phase 1 : registre d'émargement, supprimé à la clôture
export const emargement = pgTable(
  "emargement",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id),
    voterTag: bytea("voter_tag").notNull(),
    blindedHash: bytea("blinded_hash").notNull(),
    blindSig: bytea("blind_sig").notNull(),
  },
  (table) => [primaryKey({ columns: [table.voteId, table.voterTag] })],
);

// Phase 2 : urne. Invariant n°3 : uniquement vote_id, token_hash, option_id, revision.
export const ballots = pgTable(
  "ballots",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id),
    tokenHash: bytea("token_hash").notNull(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => voteOptions.id),
    revision: smallint("revision").notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.voteId, table.tokenHash] }),
    check("ballots_revision_chk", sql`${table.revision} BETWEEN 1 AND 20`),
  ],
);

export const results = pgTable(
  "results",
  {
    voteId: uuid("vote_id")
      .notNull()
      .references(() => votes.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => voteOptions.id),
    count: integer("count").notNull(),
  },
  (table) => [primaryKey({ columns: [table.voteId, table.optionId] })],
);

// Pétitions
export const petitions = pgTable(
  "petitions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").unique().notNull(),
    authorTag: bytea("author_tag").notNull(),
    question: text("question").notNull(),
    options: jsonb("options").$type<string[]>().notNull(),
    argumentPour: text("argument_pour").notNull(),
    argumentPourAuthor: text("argument_pour_author").notNull(),
    isAgDecision: boolean("is_ag_decision").notNull().default(false),
    originDetail: text("origin_detail"),
    requestedDuration: interval("requested_duration")
      .notNull()
      .default(sql`interval '72 hours'`),
    state: petitionStateEnum("state").notNull().default("collecting"),
    collectUntil: timestamp("collect_until", { withTimezone: true }).notNull(),
    threshold: integer("threshold").notNull(),
    signaturesCount: integer("signatures_count").notNull().default(0),
    reviewDeadline: timestamp("review_deadline", { withTimezone: true }),
    proposedRewording: text("proposed_rewording"),
    decisionReason: text("decision_reason"),
    voteId: uuid("vote_id").references(() => votes.id),
    createdOn: date("created_on")
      .notNull()
      .default(sql`current_date`),
  },
  (table) => [
    check(
      "petitions_question_len_chk",
      sql`char_length(${table.question}) <= 140`,
    ),
    check(
      "petitions_argument_pour_len_chk",
      sql`char_length(${table.argumentPour}) <= 600`,
    ),
    check(
      "petitions_requested_duration_chk",
      sql`${table.requestedDuration} BETWEEN interval '24 hours' AND interval '14 days'`,
    ),
  ],
);

export const petitionSignatures = pgTable(
  "petition_signatures",
  {
    petitionId: uuid("petition_id")
      .notNull()
      .references(() => petitions.id, { onDelete: "cascade" }),
    signerTag: bytea("signer_tag").notNull(),
  },
  (table) => [primaryKey({ columns: [table.petitionId, table.signerTag] })],
);

export const contreProposals = pgTable(
  "contre_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    petitionId: uuid("petition_id")
      .notNull()
      .references(() => petitions.id, { onDelete: "cascade" }),
    text: text("text").notNull(),
    authorLabel: text("author_label").notNull(),
    authorTag: bytea("author_tag").notNull(),
    supports: integer("supports").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "contre_proposals_text_len_chk",
      sql`char_length(${table.text}) <= 600`,
    ),
  ],
);

export const contreSupports = pgTable(
  "contre_supports",
  {
    petitionId: uuid("petition_id")
      .notNull()
      .references(() => petitions.id, { onDelete: "cascade" }),
    supporterTag: bytea("supporter_tag").notNull(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => contreProposals.id, { onDelete: "cascade" }),
  },
  (table) => [
    primaryKey({ columns: [table.petitionId, table.supporterTag] }),
  ],
);

// Journal public des actions d'administration
export const adminJournal = pgTable("admin_journal", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
  action: text("action").notNull(),
  targetType: text("target_type").notNull(),
  targetId: uuid("target_id").notNull(),
  reason: text("reason"),
});

export const schema = {
  voteOriginEnum,
  voteStateEnum,
  petitionStateEnum,
  voters,
  otpCodes,
  sessions,
  votes,
  voteOptions,
  emargement,
  ballots,
  results,
  petitions,
  petitionSignatures,
  contreProposals,
  contreSupports,
  adminJournal,
};
