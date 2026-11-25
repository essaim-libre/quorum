import "server-only";

export const MAX_SMALL_JSON_BYTES = 4 * 1024; // 4 Ko : auth, token, ballots
export const MAX_STANDARD_JSON_BYTES = 16 * 1024; // 16 Ko : pétitions, admin

export type ReadJsonBodyResult =
  | { readonly ok: true; readonly data: unknown }
  | {
      readonly ok: false;
      readonly status: 400 | 413;
      readonly error: "invalid_request" | "payload_too_large";
    };

/**
 * Lit un corps JSON avec plafond strict en octets (SEC-03).
 * Rejette immédiatement en 413 via Content-Length ou pendant la lecture en flux
 * (empêche les attaques par épuisement mémoire avec des payloads de plusieurs Mo).
 */
export async function readJsonBodyWithLimit(
  request: Request,
  options?: {
    readonly maxBytes?: number;
    readonly allowEmpty?: boolean;
    readonly emptyFallback?: unknown;
  },
): Promise<ReadJsonBodyResult> {
  const maxBytes = options?.maxBytes ?? MAX_STANDARD_JSON_BYTES;
  const allowEmpty = options?.allowEmpty ?? false;

  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader !== null) {
    const parsedLength = Number(contentLengthHeader);
    if (Number.isFinite(parsedLength) && parsedLength > maxBytes) {
      return { ok: false, status: 413, error: "payload_too_large" };
    }
  }

  let rawText: string;
  if (request.body) {
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          break;
        }
        if (value) {
          totalBytes += value.byteLength;
          if (totalBytes > maxBytes) {
            await reader.cancel().catch(() => {});
            return { ok: false, status: 413, error: "payload_too_large" };
          }
          chunks.push(value);
        }
      }
    } catch {
      return { ok: false, status: 400, error: "invalid_request" };
    }

    const merged = new Uint8Array(totalBytes);
    let offset = 0;
    for (const chunk of chunks) {
      merged.set(chunk, offset);
      offset += chunk.byteLength;
    }
    rawText = new TextDecoder("utf-8", { fatal: false }).decode(merged);
  } else {
    try {
      rawText = await request.text();
    } catch {
      return { ok: false, status: 400, error: "invalid_request" };
    }
    if (Buffer.byteLength(rawText, "utf8") > maxBytes) {
      return { ok: false, status: 413, error: "payload_too_large" };
    }
  }

  if (rawText.trim().length === 0) {
    if (allowEmpty) {
      return { ok: true, data: options?.emptyFallback ?? {} };
    }
    return { ok: false, status: 400, error: "invalid_request" };
  }

  try {
    return { ok: true, data: JSON.parse(rawText) as unknown };
  } catch {
    return { ok: false, status: 400, error: "invalid_request" };
  }
}
