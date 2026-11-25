function escapeRegExp(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * Regex stricte pour la partie locale (SEC-10) :
 * - interdit le `+` (sous-adresses),
 * - interdit les points consécutifs (`..`),
 * - interdit les `.`, `-` ou `_` en début ou en fin de partie locale.
 */
export function buildAllowedEmailRegex(allowedDomain: string): RegExp {
  const domain = allowedDomain.trim().toLowerCase();
  return new RegExp(
    `^(?:[a-z0-9]|[a-z0-9](?:[a-z0-9_-]|\\.(?!\\.))*[a-z0-9])@${escapeRegExp(domain)}$`,
  );
}

export function isValidStudentEmail(
  raw: string,
  allowedDomain = "etu.u-bordeaux.fr",
): boolean {
  const normalized = normalizeEmail(raw);
  if (normalized.length > 254) {
    return false;
  }
  return buildAllowedEmailRegex(allowedDomain).test(normalized);
}

export function parseAndNormalizeStudentEmail(
  raw: string,
  allowedDomain = "etu.u-bordeaux.fr",
): string | null {
  const normalized = normalizeEmail(raw);
  if (!isValidStudentEmail(normalized, allowedDomain)) {
    return null;
  }
  return normalized;
}
