import { afterEach, describe, expect, it } from "vitest";
import { now, resetTestClock, setTestClock } from "@/lib/clock";
import { log, maskEmails, sanitizeForLog, setLogSink } from "@/lib/log";

describe("journalisation sécurisée (invariant n°1)", () => {
  afterEach(() => {
    setLogSink(null);
    resetTestClock();
  });

  it("masque les adresses email dans les chaînes et objets imbriqués", () => {
    expect(maskEmails("Envoi à test.etudiant@etu.u-bordeaux.fr échoué")).toBe(
      "Envoi à [redacted] échoué",
    );

    const sanitized = sanitizeForLog({
      reason: "refus pour test.etudiant@etu.u-bordeaux.fr",
      nested: {
        items: ["ok", "autre.test@etu.u-bordeaux.fr"],
        count: 2,
      },
    });

    expect(JSON.stringify(sanitized)).not.toContain("@");
  });

  it("n'émet jamais d'email en clair dans les lignes de log", () => {
    const lines: string[] = [];
    setLogSink((line) => {
      lines.push(line);
    });
    setTestClock(new Date("2026-11-24T12:00:00.000Z"));

    log("info", "auth.code.sent pour test.etudiant@etu.u-bordeaux.fr", {
      detail: "contact test.etudiant@etu.u-bordeaux.fr",
      status: 200,
    });

    expect(lines).toHaveLength(1);
    const firstLine = lines[0];
    expect(firstLine).toBeDefined();
    expect(firstLine).not.toContain("@");
    expect(firstLine).toContain("2026-11-24T12:00:00.000Z");
  });
});

describe("horloge injectable (src/lib/clock.ts)", () => {
  afterEach(() => {
    resetTestClock();
  });

  it("permet de figer et d'avancer le temps dans les tests", () => {
    setTestClock(new Date("2026-12-01T18:00:00.000Z"));
    expect(now().toISOString()).toBe("2026-12-01T18:00:00.000Z");

    resetTestClock();
    expect(Math.abs(now().getTime() - Date.now())).toBeLessThan(1000);
  });
});
