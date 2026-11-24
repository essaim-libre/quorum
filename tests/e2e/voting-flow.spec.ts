import { expect, test } from "@playwright/test";

const RECEIPT_REGEX =
  /^[0-9A-HJKMNP-TV-Z]{2}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{3}$/;

test.describe("parcours étudiant complet — connexion, vote anonyme, revote et reçu (J3)", () => {
  test("connexion, vote, revote, A voté, reçu dans Moi, sans cookie sur /api/ballots ni choix stocké", async ({
    browser,
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";

    // 1. Prépare un scrutin ouvert via le compte admin configuré en local (.env)
    const adminContext = await browser.newContext({ baseURL: origin });
    const adminEmail = "admin@etu.u-bordeaux.fr";

    const adminCodeRes = await adminContext.request.post("/api/auth/code", {
      data: { email: adminEmail },
    });
    expect(adminCodeRes.status()).toBe(200);
    const adminCodeJson = (await adminCodeRes.json()) as {
      ok: boolean;
      devCode?: string;
    };
    expect(adminCodeJson.devCode).toMatch(/^\d{6}$/);

    const adminVerifyRes = await adminContext.request.post("/api/auth/verify", {
      data: { email: adminEmail, code: adminCodeJson.devCode },
    });
    expect(adminVerifyRes.status()).toBe(200);

    const uniqueSuffix = Date.now().toString(36);
    const question = `Maintenir l'ouverture de la BU samedi (${uniqueSuffix}) ?`;

    const createRes = await adminContext.request.post("/api/admin/votes", {
      data: {
        question,
        options: ["Pour l'ouverture", "Contre l'ouverture"],
        statusNote: "Consultatif — test E2E",
        originDetail: "Test Playwright J3",
        argumentPour: "Utile avant les partiels.",
        argumentPourAuthor: "Collectif E2E",
        argumentContre: "Coût de fonctionnement.",
        argumentContreAuthor: "Service test",
        facts: "Ouverture de 9 h à 18 h.",
      },
    });
    expect(createRes.status()).toBe(201);
    const created = (await createRes.json()) as { id: string; slug: string };

    const pubRes = await adminContext.request.post(
      `/api/admin/votes/${created.id}/publish`,
      { data: { durationHours: 72 } },
    );
    expect(pubRes.status()).toBe(200);
    await adminContext.close();

    // 2. Connexion étudiant dans le navigateur réel
    const studentEmail = `test.etudiant.${uniqueSuffix}@etu.u-bordeaux.fr`;
    await page.goto("/");
    await page.getByRole("button", { name: "Recevoir un code" }).click();
    await page.getByLabel("Adresse universitaire").fill(studentEmail);

    const codeResponsePromise = page.waitForResponse(
      (res) =>
        res.url().endsWith("/api/auth/code") &&
        res.request().method() === "POST",
    );
    await page.getByRole("button", { name: "Envoyer le code" }).click();
    const codeResponse = await codeResponsePromise;
    expect(codeResponse.status()).toBe(200);
    const codePayload = (await codeResponse.json()) as { devCode?: string };
    expect(codePayload.devCode).toMatch(/^\d{6}$/);

    const codeDigits = codePayload.devCode ?? "";
    for (let i = 0; i < 6; i += 1) {
      await page
        .getByLabel(`Chiffre ${i + 1} sur 6`)
        .fill(codeDigits[i] ?? "");
    }
    await page.getByRole("button", { name: "Se connecter" }).click();
    await page.waitForURL("**/votes");

    // 3. Ouvre la question (Phase 1 : le jeton aveugle est demandé dès l'ouverture)
    await page.getByRole("link", { name: question }).click();
    await page.waitForURL(`**/votes/${created.slug}`);

    // Surveille les requêtes POST /api/ballots pour vérifier l'absence de Cookie (invariant n°4)
    const ballotCookieHeaders: Array<string | undefined> = [];
    page.on("request", (req) => {
      if (req.url().endsWith("/api/ballots") && req.method() === "POST") {
        ballotCookieHeaders.push(req.headers()["cookie"]);
      }
    });

    // 4. Premier vote
    await page.getByRole("link", { name: "Voter" }).click();
    await page.waitForURL(`**/votes/${created.slug}/bulletin`);

    // Aucune option présélectionnée
    const radios = page.getByRole("radio");
    await expect(radios).toHaveCount(3);
    for (let i = 0; i < 3; i += 1) {
      await expect(radios.nth(i)).toHaveAttribute("aria-checked", "false");
    }

    await page.getByRole("radio", { name: /Pour l'ouverture/ }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Confirmer mon vote" }).click();

    await page.waitForURL(`**/votes/${created.slug}/a-vote`, {
      timeout: 15_000,
    });
    await expect(page.getByRole("heading", { name: "A voté." })).toBeVisible();

    const firstReceipt = (
      await page.getByTestId("vote-receipt").innerText()
    ).trim();
    expect(firstReceipt).toMatch(RECEIPT_REGEX);

    // 5. Invariant n°10 : aucun choix stocké dans IndexedDB / localStorage / sessionStorage
    const storedTokenSnapshot = await page.evaluate(async (voteId) => {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = indexedDB.open("quorum-tokens", 1);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      const record = await new Promise<unknown>((resolve, reject) => {
        const tx = db.transaction("tokens", "readonly");
        const req = tx.objectStore("tokens").get(`quorum:token:${voteId}`);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      db.close();
      return {
        record,
        localStorageDump: JSON.stringify(window.localStorage),
        sessionStorageDump: JSON.stringify(window.sessionStorage),
      };
    }, created.id);

    const recordJson = JSON.stringify(storedTokenSnapshot.record);
    expect(recordJson).not.toContain("optionId");
    expect(recordJson).not.toContain("Pour l'ouverture");
    expect(storedTokenSnapshot.localStorageDump).not.toContain(
      "Pour l'ouverture",
    );
    expect(storedTokenSnapshot.sessionStorageDump).not.toContain(
      "Pour l'ouverture",
    );

    // 6. Revote : aucune présélection, même reçu après confirmation
    await page.getByRole("link", { name: "Modifier mon vote" }).click();
    await page.waitForURL(`**/votes/${created.slug}/bulletin`);

    for (let i = 0; i < 3; i += 1) {
      await expect(
        page.getByRole("radio").nth(i),
      ).toHaveAttribute("aria-checked", "false");
    }

    await page.getByRole("radio", { name: /Contre l'ouverture/ }).click();
    await page.getByRole("button", { name: "Continuer" }).click();
    await page.getByRole("button", { name: "Confirmer mon vote" }).click();

    await page.waitForURL(`**/votes/${created.slug}/a-vote`, {
      timeout: 15_000,
    });
    const secondReceipt = (
      await page.getByTestId("vote-receipt").innerText()
    ).trim();
    expect(secondReceipt).toBe(firstReceipt);

    // Vérifie que les 2 appels POST /api/ballots n'ont envoyé aucun Cookie (invariant n°4)
    expect(ballotCookieHeaders).toHaveLength(2);
    for (const cookieHeader of ballotCookieHeaders) {
      expect(cookieHeader).toBeUndefined();
    }

    // 7. Reçu visible dans « Moi »
    await page.goto("/moi");
    await expect(
      page.getByTestId(`my-receipt-${created.slug}`),
    ).toHaveText(firstReceipt);
  });
});
