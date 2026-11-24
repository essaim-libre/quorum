CREATE TABLE "vote_receipts" (
	"vote_id" uuid NOT NULL,
	"receipt" text NOT NULL,
	CONSTRAINT "vote_receipts_vote_id_receipt_pk" PRIMARY KEY("vote_id","receipt")
);
--> statement-breakpoint
ALTER TABLE "vote_receipts" ADD CONSTRAINT "vote_receipts_vote_id_votes_id_fk" FOREIGN KEY ("vote_id") REFERENCES "public"."votes"("id") ON DELETE no action ON UPDATE no action;

--> statement-breakpoint
CREATE OR REPLACE FUNCTION quorum_guard_vote_receipts_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_state vote_state;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
BEGIN
  SELECT state, opens_at, closes_at
  INTO v_state, v_opens_at, v_closes_at
  FROM "votes"
  WHERE id = NEW.vote_id;

  IF NOT FOUND OR v_state <> 'published' THEN
    RAISE EXCEPTION 'Vote non publié : reçu refusé.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_opens_at IS NULL OR v_closes_at IS NULL OR now() < v_opens_at OR now() >= v_closes_at THEN
    RAISE EXCEPTION 'Vote fermé ou non encore ouvert : reçu refusé.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER trg_vote_receipts_guard
BEFORE INSERT ON "vote_receipts"
FOR EACH ROW
EXECUTE FUNCTION quorum_guard_vote_receipts_write();
