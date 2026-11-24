import "server-only";
import { generateKeyPairSync } from "node:crypto";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/crypto/aead";
import { sha256 } from "@/lib/crypto/hmac";

export interface GeneratedVoteKeyPair {
  readonly publicKeySpki: Buffer;
  readonly privateKeyEnc: Buffer;
  readonly keyFingerprint: string;
}

/**
 * Génère la paire RSA 2048 bits (e = 65537) d'un vote à sa publication (§6.1).
 * La clé privée PKCS8 DER est immédiatement chiffrée en AES-256-GCM avec MASTER_KEY.
 */
export function generateVoteKeyPair(masterKey: Buffer): GeneratedVoteKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicExponent: 0x10001,
    publicKeyEncoding: {
      type: "spki",
      format: "der",
    },
    privateKeyEncoding: {
      type: "pkcs8",
      format: "der",
    },
  });

  const publicKeySpki = Buffer.from(publicKey);
  const privateKeyPkcs8 = Buffer.from(privateKey);
  const privateKeyEnc = encryptPrivateKey(privateKeyPkcs8, masterKey);
  // Efface la copie en clair en mémoire dès que possible
  privateKeyPkcs8.fill(0);

  const keyFingerprint = sha256(publicKeySpki).toString("hex");

  return {
    publicKeySpki,
    privateKeyEnc,
    keyFingerprint,
  };
}

export function decryptVotePrivateKeyPkcs8(
  privateKeyEnc: Buffer,
  masterKey: Buffer,
): Buffer {
  return decryptPrivateKey(privateKeyEnc, masterKey);
}
