import { describe, expect, it } from "vitest";
import { formatDurationRemaining } from "@/lib/dates";
import {
  buildVoteOptionsWithBlank,
  cancelVoteSchema,
  classifyPublishedVote,
  createVoteDraftSchema,
  publishVoteSchema,
  slugifyQuestion,
} from "@/lib/votes/rules";

describe("règles métier des votes (§2, src/lib/votes/rules.ts)", () => {
  it("valide un brouillon conforme et rejette les hors-limites", () => {
    const valid = createVoteDraftSchema.safeParse({
      question: "Maintenir le blocage du bâtiment A mardi ?",
      options: ["Pour", "Contre"],
      statusNote: "Consultatif — le bureau suit le résultat",
      argumentPour: "Permet d'organiser une assemblée générale ouverte.",
      argumentPourAuthor: "Collectif test",
    });
    expect(valid.success).toBe(true);

    // Moins de 2 options refusé
    expect(
      createVoteDraftSchema.safeParse({
        question: "Question valide ?",
        options: ["Pour"],
        statusNote: "Consultatif",
        argumentPour: "Argument valide",
        argumentPourAuthor: "Auteur",
      }).success,
    ).toBe(false);

    // Plus de 4 options refusé
    expect(
      createVoteDraftSchema.safeParse({
        question: "Question valide ?",
        options: ["A", "B", "C", "D", "E"],
        statusNote: "Consultatif",
        argumentPour: "Argument valide",
        argumentPourAuthor: "Auteur",
      }).success,
    ).toBe(false);

    // « Vote blanc » manuel refusé (ajouté automatiquement)
    expect(
      createVoteDraftSchema.safeParse({
        question: "Question valide ?",
        options: ["Pour", "Vote blanc"],
        statusNote: "Consultatif",
        argumentPour: "Argument valide",
        argumentPourAuthor: "Auteur",
      }).success,
    ).toBe(false);

    // Question > 140 caractères refusée
    expect(
      createVoteDraftSchema.safeParse({
        question: "Q".repeat(141),
        options: ["Pour", "Contre"],
        statusNote: "Consultatif",
        argumentPour: "Argument valide",
        argumentPourAuthor: "Auteur",
      }).success,
    ).toBe(false);
  });

  it("impose une durée comprise entre 24 h et 14 jours", () => {
    expect(publishVoteSchema.safeParse({ durationHours: 23 }).success).toBe(
      false,
    );
    expect(publishVoteSchema.safeParse({ durationHours: 24 }).success).toBe(
      true,
    );
    expect(publishVoteSchema.safeParse({ durationHours: 72 }).success).toBe(
      true,
    );
    expect(publishVoteSchema.safeParse({ durationHours: 336 }).success).toBe(
      true,
    );
    expect(publishVoteSchema.safeParse({ durationHours: 337 }).success).toBe(
      false,
    );

    expect(
      publishVoteSchema.safeParse({
        opensAt: "2026-12-01T10:00:00.000Z",
        closesAt: "2026-12-01T20:00:00.000Z",
      }).success,
    ).toBe(false);
  });

  it("ajoute « Vote blanc » automatiquement en dernière position", () => {
    const built = buildVoteOptionsWithBlank(["Pour", "Contre"]);
    expect(built).toEqual([
      { label: "Pour", position: 1, isBlank: false },
      { label: "Contre", position: 2, isBlank: false },
      { label: "Vote blanc", position: 3, isBlank: true },
    ]);
  });

  it("classe correctement un vote publié selon l'heure de référence", () => {
    const opens = new Date("2026-12-01T10:00:00.000Z");
    const closes = new Date("2026-12-04T10:00:00.000Z");

    expect(
      classifyPublishedVote(opens, closes, new Date("2026-12-01T09:59:59Z")),
    ).toBe("upcoming");
    expect(
      classifyPublishedVote(opens, closes, new Date("2026-12-01T10:00:00Z")),
    ).toBe("open");
    expect(
      classifyPublishedVote(opens, closes, new Date("2026-12-04T10:00:00Z")),
    ).toBe("closed");
  });

  it("génère un slug ASCII propre et exige un motif d'annulation", () => {
    expect(slugifyQuestion("Bloquer l'amphi A du 30 nov. au 4 déc. ?")).toBe(
      "bloquer-l-amphi-a-du-30-nov-au-4-dec",
    );
    expect(cancelVoteSchema.safeParse({ reason: "   " }).success).toBe(false);
    expect(
      cancelVoteSchema.safeParse({ reason: "Doublon manifeste" }).success,
    ).toBe(true);
  });

  it("formate un compte à rebours lisible", () => {
    const start = new Date("2026-12-01T10:00:00.000Z");
    expect(
      formatDurationRemaining(new Date("2026-12-02T14:00:00.000Z"), start),
    ).toBe("1 j 4 h");
    expect(
      formatDurationRemaining(new Date("2026-12-01T12:15:00.000Z"), start),
    ).toBe("2 h 15 min");
  });
});
