import { randomBytes } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { requestOtpCode, verifyOtpCode } from "@/lib/auth/otp";
import * as schema from "@/lib/db/schema";
import { resetEnvCache } from "@/lib/env";
import { log, setLogSink } from "@/lib/log";
import { setConsoleMailObserver } from "@/lib/mail/console";
import { resetRateLimitersForTest } from "@/lib/ratelimit";
import {
  buildCspHeader,
  buildStaticSecurityHeaders,
} from "@/lib/security-headers";
import {
  cancelPublishedVote,
  createVoteDraft,
  publishVoteDraft,
} from "@/lib/votes/service";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

function listSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      results.push(...listSourceFiles(full));
    } else if (full.endsWith(".ts") || full.endsWith(".tsx")) {
      results.push(full);
    }
  }
  return results;
}

describe("invariants J7 — revue des logs, en-têtes HTTP, CSP et absence de tiers (§11, §13)", () => {
  it("interdit tout console.* dans src/ et cantonne la lecture d'IP à ratelimit.ts", () => {
    const srcDir = path.resolve(process.cwd(), "src");
    const files = listSourceFiles(srcDir);

    const consoleOffenders: string[] = [];
    const ipHeaderOffenders: string[] = [];

    for (const file of files) {
      const content = readFileSync(file, "utf8");
      const rel = path.relative(process.cwd(), file).replace(/\\/g, "/");

      if (/\bconsole\.(log|info|warn|error|debug|trace)\s*\(/.test(content)) {
        consoleOffenders.push(rel);
      }

      if (
        /x-forwarded-for|x-real-ip/i.test(content) &&
        rel !== "src/lib/ratelimit.ts"
      ) {
        ipHeaderOffenders.push(rel);
      }
    }

    expect(consoleOffenders).toEqual([]);
    expect(ipHeaderOffenders).toEqual([]);
  });

  it("n'embarque aucune ressource tierce (CDN, analytics, polices distantes) dans l'UI (invariant n°8)", () => {
    const uiDirs = [
      path.resolve(process.cwd(), "src/app"),
      path.resolve(process.cwd(), "src/components"),
    ];
    const forbiddenThirdPartyPattern =
      /https?:\/\/(?!localhost|127\.0\.0\.1)[^\s"'`<>]+/gi;

    const offenders: string[] = [];
    for (const dir of uiDirs) {
      for (const file of listSourceFiles(dir)) {
        const content = readFileSync(file, "utf8");
        const matches = content.match(forbiddenThirdPartyPattern);
        if (matches && matches.length > 0) {
          offenders.push(`${path.relative(process.cwd(), file)}: ${matches.join(", ")}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it("génère des en-têtes HTTP et une CSP conformes au §11 en production", () => {
    const prodCsp = buildCspHeader({ isProd: true, nonce: "abc123XYZ==" });
    expect(prodCsp).toContain("default-src 'self'");
    expect(prodCsp).toContain("img-src 'self' data:");
    expect(prodCsp).toContain("script-src 'self' 'nonce-abc123XYZ==' 'strict-dynamic'");
    expect(prodCsp).not.toContain("'unsafe-eval'");
    expect(prodCsp).toContain("connect-src 'self'");
    expect(prodCsp).toContain("frame-ancestors 'none'");
    expect(prodCsp).toContain("object-src 'none'");
    expect(prodCsp).toContain("upgrade-insecure-requests");

    const scriptDirective = prodCsp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptDirective).toBeDefined();
    expect(scriptDirective).not.toContain("'unsafe-inline'");

    const headers = buildStaticSecurityHeaders(true);
    const byKey = new Map(headers.map((h) => [h.key, h.value]));
    expect(byKey.get("Referrer-Policy")).toBe("no-referrer");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(byKey.get("Strict-Transport-Security")).toBe(
      "max-age=63072000; includeSubDomains",
    );
  });

  describe("aucune entrée de log produite en exécution réelle ne contient '@' (§13)", () => {
    const pool = new Pool({ connectionString: DATABASE_URL });
    const db = drizzle(pool, { schema });
    const savedEnv: Record<string, string | undefined> = {};
    const capturedLogs: string[] = [];

    beforeAll(async () => {
      await pool.query("SELECT 1");

      const testEnv: Record<string, string> = {
        NODE_ENV: "test",
        APP_URL: "http://localhost:3000",
        DATABASE_URL,
        K_ID: randomBytes(32).toString("base64"),
        K_EMARG: randomBytes(32).toString("base64"),
        K_SIG: randomBytes(32).toString("base64"),
        K_OTP: randomBytes(32).toString("base64"),
        MASTER_KEY: randomBytes(32).toString("base64"),
        ALLOWED_EMAIL_DOMAIN: "etu.u-bordeaux.fr",
        ADMIN_EMAILS: "test.admin.j7@etu.u-bordeaux.fr",
        ELECTORATE_SIZE: "56000",
        PETITION_THRESHOLD: "300",
        PETITION_COLLECT_DAYS: "7",
        MAIL_DRIVER: "console",
        MAIL_FROM: "Quorum <code@exemple.fr>",
      };

      for (const [k, v] of Object.entries(testEnv)) {
        savedEnv[k] = process.env[k];
        process.env[k] = v;
      }
      resetEnvCache();
      resetRateLimitersForTest();
      capturedLogs.length = 0;
      setLogSink((line) => {
        capturedLogs.push(line);
      });
    });

    afterAll(async () => {
      setLogSink(null);
      setConsoleMailObserver(null);
      await pool.end();
      for (const [k, v] of Object.entries(savedEnv)) {
        if (v === undefined) {
          delete process.env[k];
        } else {
          process.env[k] = v;
        }
      }
      resetEnvCache();
    });

    it("masque tout email et n'émet jamais '@' lors des flux auth, admin et erreur", async () => {
      let lastCode = "";
      setConsoleMailObserver((code) => {
        lastCode = code;
      });

      const email = `test.logs.${Date.now().toString(36)}@etu.u-bordeaux.fr`;
      const otpRes = await requestOtpCode({ db, email, ip: "192.0.2.42" });
      expect(otpRes.ok).toBe(true);
      expect(lastCode).toMatch(/^\d{6}$/);

      const verifyBad = await verifyOtpCode({ db, email, code: "000000" });
      expect(verifyBad.ok).toBe(false);

      const verifyOk = await verifyOtpCode({ db, email, code: lastCode });
      expect(verifyOk.ok).toBe(true);

      const draft = await createVoteDraft(db, {
        question: "Test revue des logs J7 ?",
        options: ["Oui", "Non"],
        statusNote: "Consultatif",
        originDetail: null,
        argumentPour: "Argument pour.",
        argumentPourAuthor: "Test",
        argumentContre: null,
        argumentContreAuthor: null,
        facts: null,
        opensAt: null,
        closesAt: null,
      });
      await publishVoteDraft(db, draft.id, { durationHours: 72 });
      await cancelPublishedVote(db, draft.id, { reason: "Nettoyage test J7" });

      // Même un appel direct avec email en clair doit être masqué
      log("error", "test.synthetic.leak", {
        reason: `Erreur liée à ${email}`,
        nested: { list: [email] },
      });

      expect(capturedLogs.length).toBeGreaterThanOrEqual(6);
      for (const line of capturedLogs) {
        expect(line).not.toContain("@");
        expect(line).not.toContain("192.0.2.42");
      }
    });
  });
});
