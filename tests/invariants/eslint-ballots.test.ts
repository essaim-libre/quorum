import path from "node:path";
import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

describe("invariant n°4 — règle ESLint sur src/app/api/ballots/**", () => {
  it("interdit l'import de @/lib/auth/* et de next/headers dans /api/ballots", async () => {
    const eslint = new ESLint({
      cwd: process.cwd(),
    });

    const targetPath = path.resolve(
      process.cwd(),
      "src/app/api/ballots/route.ts",
    );

    const results = await eslint.lintText(
      [
        'import { cookies } from "next/headers";',
        'import { getSession } from "@/lib/auth/session";',
        "export function POST() {",
        "  return { cookies, getSession };",
        "}",
      ].join("\n"),
      { filePath: targetPath },
    );

    const restricted = (results[0]?.messages ?? []).filter(
      (msg) => msg.ruleId === "no-restricted-imports",
    );

    expect(restricted).toHaveLength(2);
    expect(restricted.some((msg) => msg.message.includes("next/headers"))).toBe(
      true,
    );
    expect(
      restricted.some((msg) => msg.message.includes("authentification")),
    ).toBe(true);
  }, 15_000);
});
