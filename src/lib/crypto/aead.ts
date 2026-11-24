import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const TAG_LENGTH = 16;

function assertMasterKey(masterKey: Buffer): void {
  if (masterKey.length !== 32) {
    throw new Error("MASTER_KEY doit faire exactement 32 octets pour AES-256-GCM.");
  }
}

/**
 * Chiffre une clé privée de vote selon le cahier §6.1 :
 * format binaire = nonce (12 octets) ‖ ciphertext ‖ tag (16 octets).
 */
export function encryptPrivateKey(plaintext: Buffer, masterKey: Buffer): Buffer {
  assertMasterKey(masterKey);
  const nonce = randomBytes(NONCE_LENGTH);
  const cipher = createCipheriv(ALGORITHM, masterKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([nonce, ciphertext, tag]);
}

export function decryptPrivateKey(blob: Buffer, masterKey: Buffer): Buffer {
  assertMasterKey(masterKey);
  if (blob.length < NONCE_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Format de clé privée chiffrée invalide.");
  }
  const nonce = blob.subarray(0, NONCE_LENGTH);
  const tag = blob.subarray(blob.length - TAG_LENGTH);
  const ciphertext = blob.subarray(NONCE_LENGTH, blob.length - TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, masterKey, nonce, {
    authTagLength: TAG_LENGTH,
  });
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}
