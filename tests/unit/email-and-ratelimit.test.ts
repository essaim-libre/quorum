import { afterEach, describe, expect, it } from "vitest";
import {
  isValidStudentEmail,
  normalizeEmail,
  parseAndNormalizeStudentEmail,
} from "@/lib/auth/email";
import { resetTestClock, setTestClock } from "@/lib/clock";
import { consoleMailDriver, setConsoleMailObserver } from "@/lib/mail/console";
import { formatOtpPlainText } from "@/lib/mail/types";
import {
  checkAuthCodeRateLimit,
  hashIpEphemeral,
  resetRateLimitersForTest,
} from "@/lib/ratelimit";

describe("normalisation et validation d'email étudiant (§5.1)", () => {
  it("normalise la casse et les espaces", () => {
    expect(normalizeEmail("  Test.Etudiant@ETU.U-BORDEAUX.FR  ")).toBe(
      "test.etudiant@etu.u-bordeaux.fr",
    );
    expect(
      parseAndNormalizeStudentEmail("  Test.Etudiant@ETU.U-BORDEAUX.FR "),
    ).toBe("test.etudiant@etu.u-bordeaux.fr");
  });

  it("accepte les formats valides sur etu.u-bordeaux.fr", () => {
    expect(isValidStudentEmail("test.etudiant@etu.u-bordeaux.fr")).toBe(true);
    expect(isValidStudentEmail("a_b-c.1@etu.u-bordeaux.fr")).toBe(true);
  });

  it("refuse le caractère + (sous-adresses interdites)", () => {
    expect(isValidStudentEmail("test.etudiant+alias@etu.u-bordeaux.fr")).toBe(
      false,
    );
    expect(
      parseAndNormalizeStudentEmail("test.etudiant+1@etu.u-bordeaux.fr"),
    ).toBeNull();
  });

  it("refuse tout autre domaine ou format invalide", () => {
    expect(isValidStudentEmail("test.etudiant@u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail("test.etudiant@gmail.com")).toBe(false);
    expect(
      isValidStudentEmail("test.etudiant@evil.etu.u-bordeaux.fr"),
    ).toBe(false);
    expect(isValidStudentEmail(".test@etu.u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail("test etudiant@etu.u-bordeaux.fr")).toBe(false);
    expect(isValidStudentEmail("")).toBe(false);
  });
});

describe("rate limiting en mémoire et anonymat IP (§5.1, §11, invariant n°2)", () => {
  afterEach(() => {
    resetRateLimitersForTest();
    resetTestClock();
  });

  it("applique la limite de 3 demandes par 15 minutes et 10 par jour par voter_id", () => {
    let current = new Date("2026-11-24T10:00:00.000Z").getTime();
    setTestClock(() => new Date(current));

    const voterHex = "voter-hash-test-1";

    // 3 demandes autorisées dans la première fenêtre de 15 min
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);

    // 4e refusée
    const fourth = checkAuthCodeRateLimit(voterHex, null);
    expect(fourth.allowed).toBe(false);
    expect(fourth.retryAfterSeconds).toBeGreaterThan(0);

    // Après 15 min + 1 s, nouvelle fenêtre de 3 demandes
    current += 15 * 60 * 1000 + 1000;
    for (let i = 0; i < 3; i += 1) {
      expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);
    }
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(false);

    // Encore +15 min : 3 demandes (total 9)
    current += 15 * 60 * 1000 + 1000;
    for (let i = 0; i < 3; i += 1) {
      expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);
    }

    // Encore +15 min : 10e autorisée, 11e refusée par la limite journalière
    current += 15 * 60 * 1000 + 1000;
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(true);
    expect(checkAuthCodeRateLimit(voterHex, null).allowed).toBe(false);
  });

  it("autorise jusqu'à 300 demandes par 15 min depuis une même IP (NAT eduroam)", () => {
    setTestClock(new Date("2026-11-24T10:00:00.000Z"));
    const ip = "192.0.2.42";

    for (let i = 0; i < 300; i += 1) {
      expect(checkAuthCodeRateLimit(`voter-${i}`, ip).allowed).toBe(true);
    }
    expect(checkAuthCodeRateLimit("voter-301", ip).allowed).toBe(false);
  });

  it("fait tourner le sel IP d'un jour à l'autre sans jamais conserver l'IP en clair", () => {
    setTestClock(new Date("2026-11-24T23:59:00.000Z"));
    const hashDay1 = hashIpEphemeral("198.51.100.7");
    expect(hashDay1).not.toContain("198.51.100.7");

    setTestClock(new Date("2026-11-25T00:01:00.000Z"));
    const hashDay2 = hashIpEphemeral("198.51.100.7");
    expect(hashDay2).not.toBe(hashDay1);
  });
});

describe("format et driver mail console (§5.1, invariants n°1 et n°8)", () => {
  afterEach(() => {
    setConsoleMailObserver(null);
  });

  it("formate un texte brut sans lien ni balise HTML", () => {
    const text = formatOtpPlainText("123456");
    expect(text).toBe(
      "Ton code Quorum : 123456. Il expire dans 10 minutes. Si tu n'as rien demandé, ignore ce message.",
    );
    expect(text).not.toContain("http");
    expect(text).not.toContain("<");
  });

  it("transmet le code à l'observateur sans jamais exposer l'email", async () => {
    const received: string[] = [];
    setConsoleMailObserver((code) => {
      received.push(code);
    });

    await consoleMailDriver.sendOtpCode({
      to: "test.etudiant@etu.u-bordeaux.fr",
      code: "654321",
    });

    expect(received).toEqual(["654321"]);
    expect(received.join(" ")).not.toContain("@");
  });
});
