import { expect, test } from "@playwright/test";
import { createAdminRequestContext } from "./helpers/admin-session";

test.describe("clôture, résultats, liste des reçus et PV PDF (J4)", () => {
  test("vote puis clôture à l'échéance, affichage résultats, vérification reçu et téléchargement PV PDF", async ({
    browser,
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";

    // 1. Admin crée un scrutin qui ferme dans 14 secondes (durée 24 h + 14 s)
    const adminContext = await createAdminRequestContext(browser, origin);

    const unique = Date.now().toString(36);
    const question = `Publier les annales d'examen en accès libre (${unique}) ?`;
    const createRes = await adminContext.request.post("/api/admin/votes", {
      data: {
        question,
        options: ["Oui, publier", "Non, conserver l'accès restreint"],
        statusNote: "Consultatif — test E2E J4",
        originDetail: "Test Playwright J4",
        argumentPour: "Aide équitable pour les révisions.",
        argumentPourAuthor: "Collectif E2E",
      },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string; slug: string };

    // Lit l'heure PostgreSQL via /api/votes pour éviter toute dérive horloge hôte/Docker
    const votesListRes = await adminContext.request.get("/api/votes?view=open");
    const votesListJson = (await votesListRes.json()) as { serverNow: string };
    const dbNowMs = new Date(votesListJson.serverNow).getTime();
    const opensAt = new Date(dbNowMs - 24 * 60 * 60 * 1000).toISOString();
    const closesAtMs = dbNowMs + 14_000;
    const closesAt = new Date(closesAtMs).toISOString();

    const pubRes = await adminContext.request.post(
      `/api/admin/votes/${created.id}/publish`,
      { data: { opensAt, closesAt } },
    );
    expect(pubRes.status()).toBe(200);
    await adminContext.close();

    // 2. Étudiant se connecte et vote avant l'échéance
    const studentEmail = `test.j4.${unique}@etu.u-bordeaux.fr`;
    await page.goto("/");
    await page.getByRole("button", { name: "Recevoir un code" }).click();
    await page.getByLabel("Adresse universitaire").fill(studentEmail);

    const studentCodePromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/auth/code") &&
        res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Envoyer le code" }).click();
    const studentCodeJson = (await (await studentCodePromise).json()) as {
      devCode?: string;
    };
    const digits = studentCodeJson.devCode ?? "";
    for (let i = 0; i < 6; i += 1) {
      await page.getByLabel(`Chiffre ${i + 1} sur 6`).fill(digits[i] ?? "");
    }
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/votes");

    await page.goto(`/votes/${created.slug}/bulletin`);
    await page.getByRole("radio", { name: /Oui, publier/ }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Confirmer mon vote" }).click();
    await page.waitForURL(`**/votes/${created.slug}/a-vote`, {
      timeout: 15_000,
    });

    const receipt = (await page.getByTestId("vote-receipt").innerText()).trim();

    // 3. Attend le dépassement réel de closes_at sur PostgreSQL
    for (let attempt = 0; attempt < 40; attempt += 1) {
      const statusRes = await page.request.get(`/api/votes/${created.slug}`);
      const statusJson = (await statusRes.json()) as {
        vote?: { status?: string };
      };
      if (statusJson.vote?.status === "closed") {
        break;
      }
      await page.waitForTimeout(500);
    }

    // 4. Ouvre la page Résultats -> clôture idempotente déclenchée automatiquement
    await page.goto(`/votes/${created.slug}/resultats`);
    await expect(
      page.getByText(/Oui, publier l’emporte avec 100 % des suffrages exprimés/),
    ).toBeVisible();
    await expect(
      page.getByText("Bulletins : 1 · Jetons émis : 1"),
    ).toBeVisible();

    // 5. Téléchargement du PV PDF : statut 200 et Content-Type application/pdf
    const pdfRes = await page.request.get(`/api/votes/${created.slug}/pv.pdf`);
    expect(pdfRes.status()).toBe(200);
    expect(pdfRes.headers()["content-type"]).toContain("application/pdf");
    const pdfBytes = await pdfRes.body();
    expect(pdfBytes.subarray(0, 8).toString("latin1")).toBe("%PDF-1.4");

    // 6. Liste publique des reçus : détecte automatiquement le reçu personnel depuis IndexedDB
    await page.getByRole("link", { name: /Liste des reçus/ }).click();
    await page.waitForURL(`**/votes/${created.slug}/recus`);
    await expect(
      page.getByText(`Ton reçu (${receipt}) figure bien dans la liste publique`),
    ).toBeVisible();
  });
});
