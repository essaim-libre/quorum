const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
const RECEIPT_PREFIX = new TextEncoder().encode("quorum-receipt");

/**
 * Encode les 45 premiers bits d'un condensat SHA-256 en 9 caractères Crockford Base32,
 * au format XX-XXXX-XXX (cahier §6.4).
 */
export function formatCrockford45Bits(digest: Uint8Array): string {
  if (digest.length < 6) {
    throw new Error("Condensat trop court pour calculer un reçu.");
  }

  // Assemble les 6 premiers octets (48 bits) puis garde les 45 bits de poids fort.
  let value = BigInt(0);
  for (let i = 0; i < 6; i += 1) {
    value = (value << BigInt(8)) | BigInt(digest[i] ?? 0);
  }
  const top45 = value >> BigInt(3);

  let chars = "";
  for (let shift = 40; shift >= 0; shift -= 5) {
    const idx = Number((top45 >> BigInt(shift)) & BigInt(0x1f));
    chars += CROCKFORD_ALPHABET[idx] ?? "0";
  }

  return `${chars.slice(0, 2)}-${chars.slice(2, 6)}-${chars.slice(6, 9)}`;
}

/**
 * receipt_raw = SHA-256("quorum-receipt" ‖ input_msg)
 * receipt     = Crockford base32 des 45 premiers bits → XX-XXXX-XXX (§6.4)
 */
export async function computeReceipt(inputMsg: Uint8Array): Promise<string> {
  const combined = new Uint8Array(RECEIPT_PREFIX.length + inputMsg.length);
  combined.set(RECEIPT_PREFIX, 0);
  combined.set(inputMsg, RECEIPT_PREFIX.length);

  const hashBuffer = await globalThis.crypto.subtle.digest(
    "SHA-256",
    combined.buffer,
  );
  return formatCrockford45Bits(new Uint8Array(hashBuffer));
}
