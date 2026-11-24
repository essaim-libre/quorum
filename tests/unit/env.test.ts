import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

function makeKey(bytes = 32): string {
  return randomBytes(bytes).toString("base64");
}

function validEnv(
  overrides: Record<string, string | undefined> = {},
): Record<string, string | undefined> {
  return {
    NODE_ENV: "development",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: "postgres://quorum:quorum@localhost:5432/quorum",
    K_ID: makeKey(),
    K_EMARG: makeKey(),
    K_SIG: makeKey(),
    K_OTP: makeKey(),
    MASTER_KEY: makeKey(),
    ALLOWED_EMAIL_DOMAIN: "etu.u-bordeaux.fr",
    ADMIN_EMAILS: "Test.Admin@etu.u-bordeaux.fr, autre.admin@etu.u-bordeaux.fr",
    ELECTORATE_SIZE: "56000",
    PETITION_THRESHOLD: "300",
    PETITION_COLLECT_DAYS: "7",
    MAIL_DRIVER: "console",
    MAIL_FROM: "Quorum <code@exemple.fr>",
    ...overrides,
  };
}

describe("validation de la configuration (src/lib/env.ts)", () => {
  it("accepte une configuration de développement valide", () => {
    const env = parseEnv(validEnv());

    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.K_ID.length).toBe(32);
    expect(env.MASTER_KEY.length).toBe(32);
    expect(env.ELECTORATE_SIZE).toBe(56000);
    expect(env.ADMIN_EMAILS).toEqual([
      "test.admin@etu.u-bordeaux.fr",
      "autre.admin@etu.u-bordeaux.fr",
    ]);
  });

  it("refuse une clé manquante", () => {
    expect(() => parseEnv(validEnv({ K_ID: undefined }))).toThrow();
  });

  it("refuse une clé faisant moins de 32 octets", () => {
    expect(() => parseEnv(validEnv({ MASTER_KEY: makeKey(16) }))).toThrow();
  });

  it("refuse deux clés secrètes identiques", () => {
    const shared = makeKey(32);
    expect(() =>
      parseEnv(validEnv({ K_ID: shared, K_EMARG: shared })),
    ).toThrow();
  });

  it("refuse MAIL_DRIVER=console en production", () => {
    expect(() =>
      parseEnv(
        validEnv({
          NODE_ENV: "production",
          MAIL_DRIVER: "console",
          CRON_SECRET: "a".repeat(32),
        }),
      ),
    ).toThrow();
  });

  it("exige les identifiants Scaleway quand MAIL_DRIVER=scaleway", () => {
    expect(() =>
      parseEnv(
        validEnv({
          NODE_ENV: "production",
          MAIL_DRIVER: "scaleway",
          SCW_SECRET_KEY: "",
          SCW_PROJECT_ID: "",
          CRON_SECRET: "a".repeat(32),
        }),
      ),
    ).toThrow();

    const prodEnv = parseEnv(
      validEnv({
        NODE_ENV: "production",
        MAIL_DRIVER: "scaleway",
        SCW_SECRET_KEY: "secret-key",
        SCW_PROJECT_ID: "project-id",
        SCW_REGION: "fr-par",
        CRON_SECRET: "a".repeat(32),
      }),
    );

    expect(prodEnv.MAIL_DRIVER).toBe("scaleway");
    expect(prodEnv.SCW_REGION).toBe("fr-par");
  });
});
