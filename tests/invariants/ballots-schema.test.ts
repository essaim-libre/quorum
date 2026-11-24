import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ballots } from "@/lib/db/schema";

describe("invariant n°3 — structure stricte de la table ballots", () => {
  it("ne contient que vote_id, token_hash, option_id et revision", () => {
    const columns = getTableColumns(ballots);
    const sqlColumnNames = Object.values(columns)
      .map((col) => col.name)
      .sort();

    expect(sqlColumnNames).toEqual([
      "option_id",
      "revision",
      "token_hash",
      "vote_id",
    ]);
  });
});
