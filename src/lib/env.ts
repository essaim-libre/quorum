import "server-only";
import { z } from "zod";

const BASE64_PATTERN = /^[A-Za-z0-9+/]+={0,2}$/;

export function isLocalhostUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    return (
      parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1" ||
      parsed.hostname === "[::1]"
    );
  } catch {
    return false;
  }
}

function decodeSecretKey(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length % 4 !== 0) {
    return null;
  }
  if (!BASE64_PATTERN.test(trimmed)) {
    return null;
  }
  const decoded = Buffer.from(trimmed, "base64");
  if (decoded.length < 32) {
    return null;
  }
  return decoded;
}

const secretKeySchema = z
  .string()
  .min(1, "La clé secrète est obligatoire.")
  .transform((value, ctx) => {
    const decoded = decodeSecretKey(value);
    if (!decoded) {
      ctx.addIssue({
        code: "custom",
        message: "La clé secrète doit être encodée en base64 et faire au moins 32 octets.",
      });
      return z.NEVER;
    }
    return decoded;
  });

const rawEnvSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    APP_URL: z.string().url(),
    DATABASE_URL: z
      .string()
      .refine(
        (val) => val.startsWith("postgres://") || val.startsWith("postgresql://"),
        "DATABASE_URL doit utiliser le schéma postgres:// ou postgresql://.",
      ),

    K_ID: secretKeySchema,
    K_EMARG: secretKeySchema,
    K_SIG: secretKeySchema,
    K_OTP: secretKeySchema,
    MASTER_KEY: secretKeySchema,

    ALLOWED_EMAIL_DOMAIN: z
      .string()
      .trim()
      .min(1)
      .default("etu.u-bordeaux.fr"),
    ADMIN_EMAILS: z
      .string()
      .default("")
      .transform((value) =>
        value
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter((item) => item.length > 0),
      ),
    ELECTORATE_SIZE: z.coerce.number().int().positive().default(56000),
    PETITION_THRESHOLD: z.coerce.number().int().positive().default(300),
    PETITION_COLLECT_DAYS: z.coerce.number().int().positive().default(7),

    // Nombre de reverse-proxies de confiance devant l'application (SEC-01).
    // 0 en direct/dev (ignore les en-têtes proxy), 1 derrière Scaleway Serverless Containers.
    TRUSTED_PROXY_HOPS: z.coerce.number().int().min(0).max(10).default(0),

    MAIL_DRIVER: z.enum(["console", "scaleway"]).default("console"),
    MAIL_FROM: z.string().trim().min(1),
    SCW_SECRET_KEY: z.string().trim().optional().default(""),
    SCW_PROJECT_ID: z.string().trim().optional().default(""),
    SCW_REGION: z.string().trim().min(1).default("fr-par"),

    CRON_SECRET: z.string().trim().optional().default(""),
  })
  .superRefine((env, ctx) => {
    const keys: ReadonlyArray<readonly [string, Buffer]> = [
      ["K_ID", env.K_ID],
      ["K_EMARG", env.K_EMARG],
      ["K_SIG", env.K_SIG],
      ["K_OTP", env.K_OTP],
      ["MASTER_KEY", env.MASTER_KEY],
    ];
    const seen = new Map<string, string>();
    for (const [name, buf] of keys) {
      const hex = buf.toString("hex");
      const previous = seen.get(hex);
      if (previous) {
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `La clé ${name} doit être différente de ${previous}.`,
        });
      } else {
        seen.set(hex, name);
      }
    }

    if (env.MASTER_KEY.length !== 32) {
      ctx.addIssue({
        code: "custom",
        path: ["MASTER_KEY"],
        message: "MASTER_KEY doit faire exactement 32 octets pour AES-256-GCM.",
      });
    }

    if (env.NODE_ENV === "production" && env.MAIL_DRIVER === "console") {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message: "MAIL_DRIVER=console est refusé en production.",
      });
    }

    // SEC-14 : refuse MAIL_DRIVER=console hors localhost même si NODE_ENV n'est pas production
    if (env.MAIL_DRIVER === "console" && !isLocalhostUrl(env.APP_URL)) {
      ctx.addIssue({
        code: "custom",
        path: ["MAIL_DRIVER"],
        message:
          "MAIL_DRIVER=console est autorisé uniquement lorsque APP_URL pointe vers localhost.",
      });
    }

    if (env.MAIL_DRIVER === "scaleway") {
      if (env.SCW_SECRET_KEY.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["SCW_SECRET_KEY"],
          message: "SCW_SECRET_KEY est obligatoire avec MAIL_DRIVER=scaleway.",
        });
      }
      if (env.SCW_PROJECT_ID.length === 0) {
        ctx.addIssue({
          code: "custom",
          path: ["SCW_PROJECT_ID"],
          message: "SCW_PROJECT_ID est obligatoire avec MAIL_DRIVER=scaleway.",
        });
      }
    }

    if (env.NODE_ENV === "production" && env.CRON_SECRET.length < 32) {
      ctx.addIssue({
        code: "custom",
        path: ["CRON_SECRET"],
        message: "CRON_SECRET doit contenir au moins 32 caractères en production.",
      });
    }
  });

export type AppEnv = z.infer<typeof rawEnvSchema>;

export function parseEnv(
  raw: Readonly<Record<string, string | undefined>>,
): AppEnv {
  return rawEnvSchema.parse(raw);
}

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = parseEnv(process.env);
  }
  return cachedEnv;
}

export function resetEnvCache(): void {
  cachedEnv = null;
}
