import { type NextRequest, NextResponse } from "next/server";
import { buildCspHeader } from "@/lib/security-headers";

function generateCspNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i] ?? 0);
  }
  return btoa(binary);
}

/**
 * Génère un nonce cryptographique par requête HTML pour appliquer une CSP stricte
 * sans 'unsafe-inline' sur script-src (§11).
 * Les routes /api/* (dont POST /api/ballots, invariant n°4) sont exclues du matcher.
 */
export function proxy(request: NextRequest): NextResponse {
  const nonce = generateCspNonce();
  const isProd = process.env.NODE_ENV === "production";
  const cspHeaderValue = buildCspHeader({ isProd, nonce });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", cspHeaderValue);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });
  response.headers.set("Content-Security-Policy", cspHeaderValue);

  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
