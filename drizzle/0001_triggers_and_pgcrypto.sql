CREATE EXTENSION IF NOT EXISTS pgcrypto;
--> statement-breakpoint

-- Trigger 1 : Immutabilité d'un vote publié (cahier §7, invariant n°6)
CREATE OR REPLACE FUNCTION quorum_guard_votes_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.state IN ('published', 'cancelled') THEN
      RAISE EXCEPTION 'Un vote publié ou annulé ne peut pas être supprimé.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD.state = 'cancelled' THEN
    RAISE EXCEPTION 'Un vote annulé est immuable.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF OLD.state = 'published' THEN
    IF NEW.slug IS DISTINCT FROM OLD.slug
      OR NEW.question IS DISTINCT FROM OLD.question
      OR NEW.origin IS DISTINCT FROM OLD.origin
      OR NEW.origin_detail IS DISTINCT FROM OLD.origin_detail
      OR NEW.petition_id IS DISTINCT FROM OLD.petition_id
      OR NEW.status_note IS DISTINCT FROM OLD.status_note
      OR NEW.argument_pour IS DISTINCT FROM OLD.argument_pour
      OR NEW.argument_pour_author IS DISTINCT FROM OLD.argument_pour_author
      OR NEW.argument_contre IS DISTINCT FROM OLD.argument_contre
      OR NEW.argument_contre_author IS DISTINCT FROM OLD.argument_contre_author
      OR NEW.facts IS DISTINCT FROM OLD.facts
      OR NEW.opens_at IS DISTINCT FROM OLD.opens_at
      OR NEW.closes_at IS DISTINCT FROM OLD.closes_at
      OR NEW.public_key_spki IS DISTINCT FROM OLD.public_key_spki
      OR NEW.key_fingerprint IS DISTINCT FROM OLD.key_fingerprint
    THEN
      RAISE EXCEPTION 'Un vote publié est immuable.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.state IS DISTINCT FROM OLD.state THEN
      IF NEW.state <> 'cancelled' THEN
        RAISE EXCEPTION 'Seule l''annulation d''un vote publié est autorisée.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF NEW.cancel_reason IS NULL OR btrim(NEW.cancel_reason) = '' THEN
        RAISE EXCEPTION 'L''annulation d''un vote exige un motif public.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF OLD.closes_at IS NULL OR now() >= OLD.closes_at THEN
        RAISE EXCEPTION 'Un vote ne peut plus être annulé après son échéance.'
          USING ERRCODE = 'check_violation';
      END IF;
    ELSIF NEW.cancel_reason IS DISTINCT FROM OLD.cancel_reason THEN
      RAISE EXCEPTION 'cancel_reason ne peut être renseigné qu''à l''annulation.'
        USING ERRCODE = 'check_violation';
    END IF;

    IF NEW.tokens_issued IS DISTINCT FROM OLD.tokens_issued THEN
      IF OLD.tokens_issued IS NOT NULL OR NEW.tokens_issued IS NULL OR NEW.tokens_issued < 0 THEN
        RAISE EXCEPTION 'tokens_issued ne peut être écrit qu''une seule fois à la clôture.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    IF NEW.private_key_enc IS DISTINCT FROM OLD.private_key_enc THEN
      IF NEW.private_key_enc IS NOT NULL THEN
        RAISE EXCEPTION 'private_key_enc ne peut être que supprimée (NULL) après publication.'
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_votes_immutability
BEFORE UPDATE OR DELETE ON "votes"
FOR EACH ROW
EXECUTE FUNCTION quorum_guard_votes_mutation();
--> statement-breakpoint

-- Trigger 2 : Immutabilité des options d'un vote publié (cahier §7, invariant n°6)
CREATE OR REPLACE FUNCTION quorum_guard_vote_options_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_state vote_state;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT state INTO v_state FROM "votes" WHERE id = OLD.vote_id;
    IF v_state IN ('published', 'cancelled') THEN
      RAISE EXCEPTION 'Les options d''un vote publié ou annulé sont immuables.'
        USING ERRCODE = 'check_violation';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.vote_id IS DISTINCT FROM OLD.vote_id THEN
    SELECT state INTO v_state FROM "votes" WHERE id = OLD.vote_id;
    IF v_state IN ('published', 'cancelled') THEN
      RAISE EXCEPTION 'Les options d''un vote publié ou annulé sont immuables.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  SELECT state INTO v_state FROM "votes" WHERE id = NEW.vote_id;
  IF v_state IN ('published', 'cancelled') THEN
    RAISE EXCEPTION 'Les options d''un vote publié ou annulé sont immuables.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_vote_options_immutability
BEFORE INSERT OR UPDATE OR DELETE ON "vote_options"
FOR EACH ROW
EXECUTE FUNCTION quorum_guard_vote_options_mutation();
--> statement-breakpoint

-- Trigger 3 : Garde-fou sur l'urne (cahier §7, double sécurité derrière l'API)
CREATE OR REPLACE FUNCTION quorum_guard_ballots_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_state vote_state;
  v_opens_at timestamptz;
  v_closes_at timestamptz;
  v_option_valid boolean;
BEGIN
  SELECT state, opens_at, closes_at
  INTO v_state, v_opens_at, v_closes_at
  FROM "votes"
  WHERE id = NEW.vote_id;

  IF NOT FOUND OR v_state <> 'published' THEN
    RAISE EXCEPTION 'Vote non publié : bulletin refusé.'
      USING ERRCODE = 'check_violation';
  END IF;

  IF v_opens_at IS NULL OR v_closes_at IS NULL OR now() < v_opens_at OR now() >= v_closes_at THEN
    RAISE EXCEPTION 'Vote fermé ou non encore ouvert : bulletin refusé.'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM "vote_options"
    WHERE id = NEW.option_id AND vote_id = NEW.vote_id
  )
  INTO v_option_valid;

  IF NOT v_option_valid THEN
    RAISE EXCEPTION 'Option étrangère au vote : bulletin refusé.'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;
--> statement-breakpoint

CREATE TRIGGER trg_ballots_guard
BEFORE INSERT OR UPDATE ON "ballots"
FOR EACH ROW
EXECUTE FUNCTION quorum_guard_ballots_write();
