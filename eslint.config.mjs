import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTs,
  {
    ignores: [".next/**", "out/**", "build/**", "next-env.d.ts"],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
    },
  },
  {
    // Invariant n°4 : POST /api/ballots ne lit ni cookie, ni session, ni en-tête d'identification.
    files: ["src/app/api/ballots/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "next/headers",
              message:
                "Invariant n°4 : /api/ballots ne doit jamais importer next/headers.",
            },
            {
              name: "@/lib/auth",
              message:
                "Invariant n°4 : /api/ballots ne doit jamais importer @/lib/auth.",
            },
          ],
          patterns: [
            {
              group: ["@/lib/auth/*", "**/lib/auth", "**/lib/auth/*"],
              message:
                "Invariant n°4 : /api/ballots ne doit jamais importer de module d'authentification.",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
