CREATE TYPE "public"."petition_state" AS ENUM('collecting', 'in_review', 'changes_requested', 'approved', 'rejected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."vote_origin" AS ENUM('admin', 'petition');--> statement-breakpoint
CREATE TYPE "public"."vote_state" AS ENUM('draft', 'published', 'cancelled');--> statement-breakpoint
CREATE TABLE "admin_journal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text
);
--> statement-breakpoint
CREATE TABLE "ballots" (
	"vote_id" uuid NOT NULL,
	"token_hash" "bytea" NOT NULL,
	"option_id" uuid NOT NULL,
	"revision" smallint DEFAULT 1 NOT NULL,
	CONSTRAINT "ballots_vote_id_token_hash_pk" PRIMARY KEY("vote_id","token_hash"),
	CONSTRAINT "ballots_revision_chk" CHECK ("ballots"."revision" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE TABLE "contre_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"petition_id" uuid NOT NULL,
	"text" text NOT NULL,
	"author_label" text NOT NULL,
	"author_tag" "bytea" NOT NULL,
	"supports" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contre_proposals_text_len_chk" CHECK (char_length("contre_proposals"."text") <= 600)
);
--> statement-breakpoint
CREATE TABLE "contre_supports" (
	"petition_id" uuid NOT NULL,
	"supporter_tag" "bytea" NOT NULL,
	"proposal_id" uuid NOT NULL,
	CONSTRAINT "contre_supports_petition_id_supporter_tag_pk" PRIMARY KEY("petition_id","supporter_tag")
);
--> statement-breakpoint
CREATE TABLE "emargement" (
	"vote_id" uuid NOT NULL,
	"voter_tag" "bytea" NOT NULL,
	"blinded_hash" "bytea" NOT NULL,
	"blind_sig" "bytea" NOT NULL,
	CONSTRAINT "emargement_vote_id_voter_tag_pk" PRIMARY KEY("vote_id","voter_tag")
);
--> statement-breakpoint
CREATE TABLE "otp_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"voter_id" "bytea" NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"consumed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "petition_signatures" (
	"petition_id" uuid NOT NULL,
	"signer_tag" "bytea" NOT NULL,
	CONSTRAINT "petition_signatures_petition_id_signer_tag_pk" PRIMARY KEY("petition_id","signer_tag")
);
--> statement-breakpoint
CREATE TABLE "petitions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"author_tag" "bytea" NOT NULL,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"argument_pour" text NOT NULL,
	"argument_pour_author" text NOT NULL,
	"is_ag_decision" boolean DEFAULT false NOT NULL,
	"origin_detail" text,
	"requested_duration" interval DEFAULT interval '72 hours' NOT NULL,
	"state" "petition_state" DEFAULT 'collecting' NOT NULL,
	"collect_until" timestamp with time zone NOT NULL,
	"threshold" integer NOT NULL,
	"signatures_count" integer DEFAULT 0 NOT NULL,
	"review_deadline" timestamp with time zone,
	"proposed_rewording" text,
	"decision_reason" text,
	"vote_id" uuid,
	"created_on" date DEFAULT current_date NOT NULL,
	CONSTRAINT "petitions_slug_unique" UNIQUE("slug"),
	CONSTRAINT "petitions_question_len_chk" CHECK (char_length("petitions"."question") <= 140),
	CONSTRAINT "petitions_argument_pour_len_chk" CHECK (char_length("petitions"."argument_pour") <= 600),
	CONSTRAINT "petitions_requested_duration_chk" CHECK ("petitions"."requested_duration" BETWEEN interval '24 hours' AND interval '14 days')
);
--> statement-breakpoint
CREATE TABLE "results" (
	"vote_id" uuid NOT NULL,
	"option_id" uuid NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "results_vote_id_option_id_pk" PRIMARY KEY("vote_id","option_id")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" "bytea" PRIMARY KEY NOT NULL,
	"voter_id" "bytea" NOT NULL,
	"is_admin" boolean DEFAULT false NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vote_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"vote_id" uuid NOT NULL,
	"label" text NOT NULL,
	"position" smallint NOT NULL,
	"is_blank" boolean DEFAULT false NOT NULL,
	CONSTRAINT "vote_options_vote_id_position_uniq" UNIQUE("vote_id","position"),
	CONSTRAINT "vote_options_label_len_chk" CHECK (char_length("vote_options"."label") <= 80)
);
--> statement-breakpoint
CREATE TABLE "voters" (
	"id" "bytea" PRIMARY KEY NOT NULL,
	"created_on" date DEFAULT current_date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "votes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"question" text NOT NULL,
	"origin" "vote_origin" NOT NULL,
	"origin_detail" text,
	"petition_id" uuid,
	"status_note" text NOT NULL,
	"argument_pour" text NOT NULL,
	"argument_pour_author" text NOT NULL,
	"argument_contre" text,
	"argument_contre_author" text,
	"facts" text,
	"state" "vote_state" DEFAULT 'draft' NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"public_key_spki" "bytea",
	"private_key_enc" "bytea",
	"key_fingerprint" text,
	"tokens_issued" integer,
	"cancel_reason" text,
	CONSTRAINT "votes_slug_unique" UNIQUE("slug"),
	CONSTRAINT "votes_question_len_chk" CHECK (char_length("votes"."question") <= 140),
	CONSTRAINT "votes_argument_pour_len_chk" CHECK (char_length("votes"."argument_pour") <= 600),
	CONSTRAINT "votes_argument_contre_len_chk" CHECK ("votes"."argument_contre" IS NULL OR char_length("votes"."argument_contre") <= 600),
	CONSTRAINT "votes_duration_chk" CHECK ("votes"."closes_at" - "votes"."opens_at" BETWEEN interval '24 hours' AND interval '14 days')
);
--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ballots" ADD CONSTRAINT "ballots_option_id_vote_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."vote_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contre_proposals" ADD CONSTRAINT "contre_proposals_petition_id_petitions_id_fk" FOREIGN KEY ("petition_id") REFERENCES "public"."petitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contre_supports" ADD CONSTRAINT "contre_supports_petition_id_petitions_id_fk" FOREIGN KEY ("petition_id") REFERENCES "public"."petitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contre_supports" ADD CONSTRAINT "contre_supports_proposal_id_contre_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."contre_proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "emargement" ADD CONSTRAINT "emargement_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petition_signatures" ADD CONSTRAINT "petition_signatures_petition_id_petitions_id_fk" FOREIGN KEY ("petition_id") REFERENCES "public"."petitions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "petitions" ADD CONSTRAINT "petitions_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_option_id_vote_options_id_fk" FOREIGN KEY ("option_id") REFERENCES "public"."vote_options"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_voter_id_voters_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."voters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vote_options" ADD CONSTRAINT "vote_options_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "otp_codes_voter_id_idx" ON "otp_codes" USING btree ("voter_id");