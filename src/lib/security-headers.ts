export interface SecurityHeader {
  readonly key: string;
  readonly value: string;
}

export function buildCspHeader(options: {
  readonly isProd: boolean;
  readonly nonce?: string;
}): string {
  const scriptSrc = options.nonce
    ? options.isProd
      ? `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'`
      : `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic' 'unsafe-eval'`
    : options.isProd
      ? "script-src 'self'"
      : "script-src 'self' 'unsafe-eval' 'unsafe-inline'";

  const directives = [
    "default-src 'self'",
    "img-src 'self' data:",
    scriptSrc,
    // 'unsafe-inline' conservé sur style-src pour les attributs style={{ width }} des barres de participation/résultats (§11)
    "style-src 'self' 'unsafe-inline'",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.isProd ? ["upgrade-insecure-requests"] : []),
  ];

  return directives.join("; ");
}

export function buildStaticSecurityHeaders(isProd: boolean): SecurityHeader[] {
  return [
    {
      key: "Content-Security-Policy",
      value: buildCspHeader({ isProd }),
    },
    { key: "Referrer-Policy", value: "no-referrer" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=()",
    },
    ...(isProd
      ? [
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains",
          },
        ]
      : []),
  ];
}
