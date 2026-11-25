import { expect, test } from "@playwright/test";
import { createAdminRequestContext } from "./helpers/admin-session";

test.describe("mode amphi, Comment ça marche, journal et données personnelles (J6)", () => {
  test("mode amphi : le compteur monte automatiquement, aucun résultat avant l'échéance", async ({
    browser,
    page,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";
    const uniqueSuffix = Date.now().toString(36);

    // 1. Crée et publie un scrutin ouvert via l'admin
    const adminContext = await createAdminRequestContext(browser, origin);
    const question = `Ouvrir l'amphi A en soirée cette semaine (${uniqueSuffix}) ?`;
    const optionPour = `OptionPourAmphi-${uniqueSuffix}`;
    const optionContre = `OptionContreAmphi-${uniqueSuffix}`;

    const createRes = await adminContext.request.post("/api/admin/votes", {
      data: {
        question,
        options: [optionPour, optionContre],
        statusNote: "Consultatif — projection amphi",
        originDetail: "AG amphi A",
        argumentPour: "Permet les révisions collectives.",
        argumentPourAuthor: "Collectif E2E",
        argumentContre: "Coût de gardiennage.",
        argumentContreAuthor: "Service test",
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

    // 2. Ouvre l'écran Mode amphi
    await page.goto(`/amphi/${created.slug}`);
    await expect(page.getByRole("heading", { name: question })).toBeVisible();
    await expect(page.getByTestId("amphi-ballots-count")).toHaveText("0");
    await expect(page.getByTestId("amphi-countdown")).toBeVisible();
    await expect(
      page.getByRole("img", { name: `QR code vers le scrutin : ${question}` }),
    ).toBeVisible();

    // Aucun repère de quorum ni résultat partiel avant l'échéance (invariant n°5 + §9)
    const amphiBodyText = await page.locator("main").innerText();
    expect(amphiBodyText).not.toContain(optionPour);
    expect(amphiBodyText).not.toContain(optionContre);
    expect(amphiBodyText.toLowerCase()).not.toContain("quorum atteint");
    await expect(
      page.getByText(/Résultats invisibles jusqu’à l’échéance/),
    ).toBeVisible();

    // 3. Un étudiant vote dans un contexte navigateur séparé
    const studentContext = await browser.newContext({ baseURL: origin });
    const studentPage = await studentContext.newPage();
    const studentEmail = `test.amphi.${uniqueSuffix}@etu.u-bordeaux.fr`;

    await studentPage.goto("/");
    await studentPage.getByRole("button", { name: "Recevoir un code" }).click();
    await studentPage.getByLabel("Adresse universitaire").fill(studentEmail);

    const codePromise = studentPage.waitForResponse(
      (res) =>
        res.url().endsWith("/api/auth/code") &&
        res.request().method() === "POST",
    );
    await studentPage.getByRole("button", { name: "Envoyer le code" }).click();
    const codeRes = await codePromise;
    const codePayload = (await codeRes.json()) as { devCode?: string };
    const digits = codePayload.devCode ?? "";
    expect(digits).toMatch(/^\d{6}$/);

    for (let i = 0; i < 6; i += 1) {
      await studentPage
        .getByLabel(`Chiffre ${i + 1} sur 6`)
        .fill(digits[i] ?? "");
    }
    await studentPage.getByRole("button", { name: "Se connecter" }).click();
    await studentPage.waitForURL("**/votes");

    await studentPage.goto(`/votes/${created.slug}`);
    await studentPage.getByRole("link", { name: "Voter" }).click();
    await studentPage.waitForURL(`**/votes/${created.slug}/bulletin`);
    await studentPage.getByRole("radio", { name: optionPour }).click();
    await studentPage.getByRole("button", { name: "Continuer" }).click();
    await studentPage.getByRole("button", { name: "Confirmer mon vote" }).click();
    await studentPage.waitForURL(`**/votes/${created.slug}/a-vote`, {
      timeout: 15_000,
    });
    await studentContext.close();

    // 4. Sans recharger la page amphi, le rafraîchissement toutes les 10 s fait monter le compteur à 1
    await expect(page.getByTestId("amphi-ballots-count")).toHaveText("1", {
      timeout: 15_000,
    });

    // Toujours aucun résultat avant l'échéance
    const updatedText = await page.locator("main").innerText();
    expect(updatedText).not.toContain(optionPour);
    expect(updatedText).not.toContain(optionContre);

    // 5. Journal public : le scrutin publié y figure avec son intitulé et son lien
    await page.goto("/journal");
    await expect(
      page.getByRole("heading", { name: "Journal d’administration" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: question }).first()).toBeVisible();

    await page.getByRole("link", { name: "Scrutins" }).click();
    await page.waitForURL("**/journal?type=vote");
    await expect(page.getByRole("link", { name: question }).first()).toBeVisible();

    // 6. Page « Comment ça marche » (§9, §6.2, §6.7)
    await page.goto("/comment-ca-marche");
    await expect(
      page.getByRole("heading", { name: "Comment ça marche" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "L’analogie du ticket tamponné sans être lu",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "Ce qui est stocké, et ce qui ne l’est pas",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", {
        name: "En cas de perte de l’appareil ou de vidage du navigateur",
      }),
    ).toBeVisible();
    await expect(
      page.getByRole("link", {
        name: "Consulter le journal public d’administration",
      }),
    ).toBeVisible();

    // 7. Page « Données personnelles » (§15)
    await page.goto("/donnees-personnelles");
    await expect(
      page.getByRole("heading", { name: "Données personnelles" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Responsable de traitement" }),
    ).toBeVisible();
    await expect(
      page.getByText(/Jusqu’au 31 août de l’année universitaire/),
    ).toBeVisible();
    await expect(
      page.getByText(/Supprimé et purgé dès la clôture du scrutin/),
    ).toBeVisible();
    await expect(page.getByText(/CNIL/)).toBeVisible();
  });
});
