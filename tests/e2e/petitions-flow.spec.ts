import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";
import { Pool } from "pg";
import { createAdminRequestContext } from "./helpers/admin-session";

const DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgres://quorum:quorum@localhost:5432/quorum";

test.describe("pétitions de bout en bout — dépôt, 300 signatures simulées, relecture, publication (J5)", () => {
  test("dépôt en 4 étapes, argument Contre, 300 signatures simulées, approbation admin et vote publié", async ({
    browser,
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";
    const unique = Date.now().toString(36);
    const studentEmail = `test.pet.${unique}@etu.u-bordeaux.fr`;

    // 1. Connexion étudiant via l'interface
    await page.goto("/");
    await page.getByRole("button", { name: "Recevoir un code" }).click();
    await page.getByLabel("Adresse universitaire").fill(studentEmail);

    const codeRespPromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/auth/code") &&
        res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Envoyer le code" }).click();
    const codeJson = (await (await codeRespPromise).json()) as {
      devCode?: string;
    };
    const digits = codeJson.devCode ?? "";
    for (let i = 0; i < 6; i += 1) {
      await page.getByLabel(`Chiffre ${i + 1} sur 6`).fill(digits[i] ?? "");
    }
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/votes");

    // 2. Dépôt d'une pétition en 4 étapes sur /proposer
    const question = `Installer des bornes d'eau sur le campus (${unique}) ?`;
    await page.goto("/proposer");
    await page.getByLabel(/Question/).fill(question);
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 2 : Options (Pour / Contre déjà pré-remplies)
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 3 : Argument Pour + décision d'AG
    await page
      .getByLabel(/Argument Pour/)
      .fill("Réduit les bouteilles plastiques et améliore l'accès à l'eau.");
    await page.getByLabel(/Signature de l’argument Pour/).fill("Collectif eau");
    await page.getByLabel("C’est une décision d’AG").check();
    await page.getByLabel("Date de l’AG").fill("24 nov. 2026");
    await page.getByLabel(/Lieu/).fill("Amphi B");
    await page.getByLabel("Nombre de présents").fill("250");
    await page.getByLabel(/Résultat/).fill("Pour 210 / Contre 40");
    await page.getByRole("button", { name: "Continuer" }).click();

    // Étape 4 : Durée & Dépôt
    await page.getByRole("button", { name: "Déposer la pétition" }).click();
    await page.waitForURL("**/petitions/**");

    await expect(page.getByText("1 / 300 signatures")).toBeVisible();
    await expect(
      page.getByText("AG du 24 nov. 2026, Amphi B, 250 présents"),
    ).toBeVisible();

    // Dépose un argument Contre et le soutient
    await page
      .getByLabel(/Ton argument Contre/)
      .fill("Budget d'entretien annuel à prévoir par l'université.");
    await page.getByLabel(/Signature libre/).fill("Observateur budget");
    await page
      .getByRole("button", { name: "Déposer cet argument Contre" })
      .click();
    await expect(
      page.getByText("Budget d'entretien annuel à prévoir par l'université."),
    ).toBeVisible();
    await page.getByRole("button", { name: "Soutenir" }).click();
    await expect(page.getByRole("button", { name: "Soutenu" })).toBeVisible();

    // 3. Simule 299 signatures supplémentaires pour atteindre 300/300 -> in_review (§13)
    const slug = new URL(page.url()).pathname.split("/").pop() ?? "";
    const pool = new Pool({ connectionString: DATABASE_URL });
    let petitionId = "";
    try {
      const petRes = await pool.query<{ id: string }>(
        "SELECT id FROM petitions WHERE slug = $1",
        [slug],
      );
      petitionId = petRes.rows[0]?.id ?? "";
      expect(petitionId).toBeTruthy();

      const tags = Array.from({ length: 299 }, () => randomBytes(32));
      await pool.query(
        `INSERT INTO petition_signatures (petition_id, signer_tag)
         SELECT $1, unnest($2::bytea[])`,
        [petitionId, tags],
      );
      await pool.query(
        `UPDATE petitions
         SET signatures_count = 300,
             state = 'in_review',
             review_deadline = now() + interval '48 hours'
         WHERE id = $1`,
        [petitionId],
      );
    } finally {
      await pool.end();
    }

    // 4. Relecture admin -> approbation et publication du vote
    const adminContext = await createAdminRequestContext(browser, origin);
    const reviewRes = await adminContext.request.post(
      `/api/admin/petitions/${petitionId}/review`,
      {
        data: {
          decision: "approve",
          facts: "Coût estimé à 12 000 € sur le budget vie étudiante.",
        },
      },
    );
    expect(reviewRes.status()).toBe(200);
    const reviewJson = (await reviewRes.json()) as {
      ok: boolean;
      state: string;
      voteSlug: string;
    };
    expect(reviewJson.state).toBe("approved");
    await adminContext.close();

    // 5. Le vote publié est immédiatement accessible avec l'argument Contre retenu
    await page.goto(`/votes/${reviewJson.voteSlug}`);
    await expect(page.getByRole("heading", { name: question })).toBeVisible();
    await page.getByRole("tab", { name: "Contre" }).click();
    await expect(
      page.getByText("Budget d'entretien annuel à prévoir par l'université."),
    ).toBeVisible();
  });
});
