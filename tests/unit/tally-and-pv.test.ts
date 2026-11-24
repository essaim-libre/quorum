import { describe, expect, it } from "vitest";
import { generateProcesVerbalPdf } from "@/lib/votes/pv-pdf";
import {
  computeReceiptsListHash,
  computeTally,
  formatOutcomeHeadline,
} from "@/lib/votes/tally";

describe("dépouillement et calcul des résultats (§2.2, §6.6)", () => {
  it("calcule les pourcentages sur les exprimés uniquement et compte les blancs à part", () => {
    const tally = computeTally({
      electorateSize: 56000,
      tokensIssued: 4102,
      rows: [
        { optionId: "o1", label: "Pour", position: 1, isBlank: false, count: 1403 },
        { optionId: "o2", label: "Contre", position: 2, isBlank: false, count: 2288 },
        { optionId: "o3", label: "Vote blanc", position: 3, isBlank: true, count: 327 },
      ],
    });

    expect(tally.totalBallots).toBe(4018);
    expect(tally.expressedCount).toBe(3691);
    expect(tally.blankCount).toBe(327);
    expect(tally.integrityBallotsLeqTokens).toBe(true);
    expect(tally.blankOption?.expressedPercent).toBeNull();

    const pour = tally.options.find((o) => o.label === "Pour");
    const contre = tally.options.find((o) => o.label === "Contre");
    expect(pour?.expressedPercent).toBe(38);
    expect(contre?.expressedPercent).toBe(62);
    expect(tally.outcome.kind).toBe("winner");
    expect(formatOutcomeHeadline(tally.outcome)).toBe("Contre");
  });

  it("gère l'égalité entre deux options", () => {
    const tally = computeTally({
      electorateSize: 56000,
      tokensIssued: 100,
      rows: [
        { optionId: "o1", label: "Pour", position: 1, isBlank: false, count: 50 },
        { optionId: "o2", label: "Contre", position: 2, isBlank: false, count: 50 },
        { optionId: "o3", label: "Vote blanc", position: 3, isBlank: true, count: 0 },
      ],
    });

    expect(tally.outcome.kind).toBe("tie");
    expect(formatOutcomeHeadline(tally.outcome)).toBe(
      "Égalité entre Pour et Contre",
    );
  });

  it("gère le cas aucun suffrage exprimé (uniquement blancs ou 0 bulletin)", () => {
    const onlyBlanks = computeTally({
      electorateSize: 56000,
      tokensIssued: 12,
      rows: [
        { optionId: "o1", label: "Pour", position: 1, isBlank: false, count: 0 },
        { optionId: "o2", label: "Contre", position: 2, isBlank: false, count: 0 },
        { optionId: "o3", label: "Vote blanc", position: 3, isBlank: true, count: 12 },
      ],
    });

    expect(onlyBlanks.expressedCount).toBe(0);
    expect(onlyBlanks.blankCount).toBe(12);
    expect(onlyBlanks.outcome.kind).toBe("no_expressed");
    expect(formatOutcomeHeadline(onlyBlanks.outcome)).toBe(
      "Aucun suffrage exprimé",
    );
  });

  it("signale une anomalie d'intégrité si bulletins > jetons émis", () => {
    const anomalous = computeTally({
      electorateSize: 56000,
      tokensIssued: 10,
      rows: [
        { optionId: "o1", label: "Pour", position: 1, isBlank: false, count: 11 },
        { optionId: "o2", label: "Contre", position: 2, isBlank: false, count: 0 },
        { optionId: "o3", label: "Vote blanc", position: 3, isBlank: true, count: 0 },
      ],
    });
    expect(anomalous.integrityBallotsLeqTokens).toBe(false);
  });

  it("calcule une empreinte SHA-256 déterministe de la liste triée des reçus et génère un PV PDF valide", () => {
    const receipts = ["12-ABCD-EFG", "7K-M4P2-9X1"];
    const receiptsHash = computeReceiptsListHash(receipts);
    expect(receiptsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(computeReceiptsListHash(receipts)).toBe(receiptsHash);

    const tally = computeTally({
      electorateSize: 56000,
      tokensIssued: 2,
      rows: [
        { optionId: "o1", label: "Pour", position: 1, isBlank: false, count: 2 },
        { optionId: "o2", label: "Contre", position: 2, isBlank: false, count: 0 },
        { optionId: "o3", label: "Vote blanc", position: 3, isBlank: true, count: 0 },
      ],
    });

    const pdf = generateProcesVerbalPdf({
      voteId: "00000000-0000-4000-8000-000000000001",
      slug: "test-pv",
      question: "Ouvrir la bibliothèque le dimanche ?",
      originDetail: "AG étudiante",
      statusNote: "Consultatif",
      opensAt: new Date("2026-12-01T09:00:00.000Z"),
      closesAt: new Date("2026-12-04T09:00:00.000Z"),
      keyFingerprint: "a".repeat(64),
      receiptsCount: receipts.length,
      receiptsHash,
      tally,
      generatedAt: new Date("2026-12-04T09:05:00.000Z"),
    });

    const raw = pdf.toString("latin1");
    expect(raw.startsWith("%PDF-1.4\n")).toBe(true);
    expect(raw.trimEnd().endsWith("%%EOF")).toBe(true);
    expect(raw).toContain("a".repeat(64));
    expect(raw).toContain(receiptsHash);
    expect(raw).toContain("QUORUM");
  });
});
