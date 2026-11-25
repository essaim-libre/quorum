import "server-only";
import { getEnv } from "@/lib/env";

export const PRIVATE_NO_STORE_HEADERS = {
  "Cache-Control": "private, no-store",
} as const;

export const PUBLIC_NO_STORE_HEADERS = {
  "Cache-Control": "no-store",
} as const;

/**
 * Défense CSRF en profondeur sur les routes de mutation authentifiées par cookie (SEC-15) :
 * - Refuse les requêtes navigateur cross-site via `Sec-Fetch-Site`.
 * - Si l'en-tête `Origin` est présent, vérifie qu'il correspond à l'origine configurée (`APP_URL`)
 *   ou à l'en-tête `Host` de la requête (pour dev/test local multi-port).
 */
export function isTrustedSameOriginRequest(request: Request): boolean {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (
    fetchSite &&
    fetchSite !== "same-origin" &&
    fetchSite !== "none"
  ) {
    return false;
  }

  const originHeader = request.headers.get("origin")?.trim();
  if (!originHeader) {
    return true;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(originHeader).origin;
  } catch {
    return false;
  }

  try {
    const configuredOrigin = new URL(getEnv().APP_URL).origin;
    if (requestOrigin === configuredOrigin) {
      return true;
    }
  } catch {
    // Fallback ci-dessous via l'URL de la requête
  }

  try {
    const reqUrlOrigin = new URL(request.url).origin;
    if (requestOrigin === reqUrlOrigin) {
      return true;
    }
  } catch {
    // ignore
  }

  const hostHeader = request.headers.get("host")?.trim();
  if (hostHeader) {
    if (
      requestOrigin === `https://${hostHeader}` ||
      requestOrigin === `http://${hostHeader}`
    ) {
      return true;
    }
  }

  return false;
}
