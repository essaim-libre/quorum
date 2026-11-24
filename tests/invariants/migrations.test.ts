import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

interface DrizzleJournal {
  entries: Array<{ tag: string }>;
}

describe("invariants SQL — migrations Drizzle et triggers (§7)", () => {
  const drizzleDir = path.resolve(process.cwd(), "drizzle");

  it("référence toutes les migrations dans le journal Drizzle", () => {
    const journalRaw = readFileSync(
      path.join(drizzleDir, "meta", "_journal.json"),
      "utf8",
    );
    const journal = JSON.parse(journalRaw) as DrizzleJournal;
    const tags = journal.entries.map((entry) => entry.tag);

    expect(tags).toContain("0000_initial_schema");
    expect(tags).toContain("0001_triggers_and_pgcrypto");

    for (const tag of tags) {
      const sqlContent = readFileSync(
        path.join(drizzleDir, `${tag}.sql`),
        "utf8",
      );
      expect(sqlContent.trim().length).toBeGreaterThan(0);
    }
  });

  it("définit les trois triggers obligatoires et l'extension pgcrypto", () => {
    const triggersSql = readFileSync(
      path.join(drizzleDir, "0001_triggers_and_pgcrypto.sql"),
      "utf8",
    );

    expect(triggersSql).toContain("CREATE EXTENSION IF NOT EXISTS pgcrypto;");
    expect(triggersSql).toContain("CREATE TRIGGER trg_votes_immutability");
    expect(triggersSql).toContain(
      "CREATE TRIGGER trg_vote_options_immutability",
    );
    expect(triggersSql).toContain("CREATE TRIGGER trg_ballots_guard");
  });
});
