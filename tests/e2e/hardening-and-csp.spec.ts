import { expect, test } from "@playwright/test";
import { createAdminRequestContext } from "./helpers/admin-session";

test.describe("durcissement J7 — en-têtes HTTP, CSP par nonce, zéro tiers et /api/health", () => {
  test("applique les en-têtes de sécurité §11, un nonce CSP unique sans violation et zéro requête tierce", async ({
    browser,
    page,
    request,
    baseURL,
  }) => {
    const origin = baseURL ?? "http://localhost:3000";

    // 1. Healthcheck opérationnel sans cache
    const healthRes = await request.get("/api/health");
    expect(healthRes.status()).toBe(200);
    expect(await healthRes.json()).toEqual({ ok: true });
    expect(healthRes.headers()["cache-control"]).toContain("no-store");
    expect(healthRes.headers()["x-powered-by"]).toBeUndefined();
    expect(healthRes.headers()["referrer-policy"]).toBe("no-referrer");
    expect(healthRes.headers()["x-content-type-options"]).toBe("nosniff");
    expect(healthRes.headers()["permissions-policy"]).toBe(
      "camera=(), microphone=(), geolocation=()",
    );

    // 2. Deux requêtes HTML produisent deux nonces CSP distincts sans 'unsafe-inline' sur script-src
    const firstHtmlRes = await request.get("/");
    const secondHtmlRes = await request.get("/");
    const firstCsp = firstHtmlRes.headers()["content-security-policy"] ?? "";
    const secondCsp = secondHtmlRes.headers()["content-security-policy"] ?? "";

    const extractNonce = (csp: string): string | null => {
      const match = /'nonce-([A-Za-z0-9+/=]+)'/.exec(csp);
      return match?.[1] ?? null;
    };

    const nonce1 = extractNonce(firstCsp);
    const nonce2 = extractNonce(secondCsp);
    expect(nonce1).not.toBeNull();
    expect(nonce2).not.toBeNull();
    expect(nonce1).not.toBe(nonce2);

    const scriptDirective = firstCsp
      .split(";")
      .map((d) => d.trim())
      .find((d) => d.startsWith("script-src"));
    expect(scriptDirective).toBeDefined();
    expect(scriptDirective).not.toContain("'unsafe-inline'");
    expect(firstCsp).toContain("frame-ancestors 'none'");
    expect(firstCsp).toContain("object-src 'none'");

    // 3. Navigation réelle : zéro violation CSP et zéro ressource tierce (invariant n°8)
    const cspViolations: string[] = [];
    const thirdPartyRequests: string[] = [];

    await page.addInitScript(() => {
      const globalWin = window as unknown as { __cspViolations?: string[] };
      globalWin.__cspViolations = [];
      window.addEventListener("securitypolicyviolation", (event) => {
        globalWin.__cspViolations?.push(
          `${event.violatedDirective}:${event.blockedURI}`,
        );
      });
    });

    page.on("request", (req) => {
      const url = req.url();
      if (!url.startsWith(origin) && !url.startsWith("data:")) {
        thirdPartyRequests.push(url);
      }
    });

    for (const route of [
      "/",
      "/comment-ca-marche",
      "/journal",
      "/donnees-personnelles",
    ]) {
      const res = await page.goto(route);
      expect(res?.status()).toBe(200);
      const violations = await page.evaluate(() => {
        const globalWin = window as unknown as { __cspViolations?: string[] };
        return globalWin.__cspViolations ?? [];
      });
      cspViolations.push(...violations);
    }

    // Vérifie le comportement de l'en-tête fixe contextuel (StickyHeader) au défilement
    await page.goto("/comment-ca-marche");
    const stickyHeader = page.locator("header[data-condensed]");
    await expect(stickyHeader).toHaveAttribute("data-condensed", "false");
    await page.evaluate(() => window.scrollTo(0, 600));
    await expect(stickyHeader).toHaveAttribute("data-condensed", "true");

    // Vérifie que l'hydratation React fonctionne sous la CSP stricte par nonce
    await page.goto("/");
    await page.getByRole("button", { name: "Recevoir un code" }).click();
    await expect(page.getByLabel("Adresse universitaire")).toBeVisible();

    const postHydrationViolations = await page.evaluate(() => {
      const globalWin = window as unknown as { __cspViolations?: string[] };
      return globalWin.__cspViolations ?? [];
    });
    cspViolations.push(...postHydrationViolations);

    expect(cspViolations).toEqual([]);
    expect(thirdPartyRequests).toEqual([]);

    // 4. POST /api/ballots : comportement strictement identique avec ou sans cookie de session (invariant n°4)
    const adminContext = await createAdminRequestContext(browser, origin);
    const invalidPayload = {
      voteId: "00000000-0000-4000-8000-000000000000",
      inputMsg: "AAAA",
      sig: "AAAA",
      optionId: "00000000-0000-4000-8000-000000000001",
    };

    const resWithCookie = await adminContext.request.post("/api/ballots", {
      data: invalidPayload,
    });
    const resWithoutCookie = await request.post("/api/ballots", {
      data: invalidPayload,
    });

    expect(resWithCookie.status()).toBe(resWithoutCookie.status());
    expect(await resWithCookie.json()).toEqual(await resWithoutCookie.json());
    await adminContext.close();
  });
});
