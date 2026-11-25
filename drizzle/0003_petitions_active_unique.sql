-- SEC-09 : empêche la création concurrente de plusieurs pétitions actives par le même auteur (§3.2)
CREATE UNIQUE INDEX IF NOT EXISTS "petitions_one_active_per_author_idx"
  ON "petitions" ("author_tag")
  WHERE "state" IN ('collecting', 'in_review', 'changes_requested');
