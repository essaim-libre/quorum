import {
  createPrivateKey,
  createPublicKey,
  randomBytes,
  sign,
  verify,
} from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptPrivateKey, encryptPrivateKey } from "@/lib/crypto/aead";
import { sha256 } from "@/lib/crypto/hmac";
import {
  decryptVotePrivateKeyPkcs8,
  generateVoteKeyPair,
} from "@/lib/crypto/vote-keys";

describe("chiffrement AEAD AES-256-GCM (src/lib/crypto/aead.ts)", () => {
  it("chiffre et déchiffre au format nonce(12) || ciphertext || tag(16)", () => {
    const masterKey = randomBytes(32);
    const plaintext = Buffer.from("cle-privee-test-quorum");

    const enc1 = encryptPrivateKey(plaintext, masterKey);
    const enc2 = encryptPrivateKey(plaintext, masterKey);

    expect(enc1.length).toBe(12 + plaintext.length + 16);
    expect(enc1.equals(enc2)).toBe(false);
    expect(decryptPrivateKey(enc1, masterKey).equals(plaintext)).toBe(true);
  });

  it("refuse un blob altéré ou une mauvaise clé maître", () => {
    const masterKey = randomBytes(32);
    const wrongKey = randomBytes(32);
    const enc = encryptPrivateKey(Buffer.from("secret-pkcs8"), masterKey);

    expect(() => decryptPrivateKey(enc, wrongKey)).toThrow();

    const tampered = Buffer.from(enc);
    const middleIndex = 15;
    tampered[middleIndex] = (tampered[middleIndex] ?? 0) ^ 0xff;
    expect(() => decryptPrivateKey(tampered, masterKey)).toThrow();
  });

  it("refuse une MASTER_KEY qui ne fait pas 32 octets", () => {
    expect(() =>
      encryptPrivateKey(Buffer.from("x"), randomBytes(16)),
    ).toThrow();
  });
});

describe("génération de clé RSA 2048 par vote (§6.1)", () => {
  it("génère une paire RSA 2048 (e=65537) avec empreinte SHA-256 et clé privée chiffrée", () => {
    const masterKey = randomBytes(32);
    const generated = generateVoteKeyPair(masterKey);

    expect(generated.keyFingerprint).toBe(
      sha256(generated.publicKeySpki).toString("hex"),
    );
    expect(generated.keyFingerprint).toMatch(/^[0-9a-f]{64}$/);

    const publicKey = createPublicKey({
      key: generated.publicKeySpki,
      format: "der",
      type: "spki",
    });
    expect(publicKey.asymmetricKeyType).toBe("rsa");
    expect(publicKey.asymmetricKeyDetails?.modulusLength).toBe(2048);

    const pkcs8 = decryptVotePrivateKeyPkcs8(generated.privateKeyEnc, masterKey);
    const privateKey = createPrivateKey({
      key: pkcs8,
      format: "der",
      type: "pkcs8",
    });

    const payload = Buffer.from("quorum-keypair-check");
    const signature = sign("sha256", payload, privateKey);
    expect(verify("sha256", payload, publicKey, signature)).toBe(true);
  });
});
