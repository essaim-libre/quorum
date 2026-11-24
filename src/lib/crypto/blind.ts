import { type BlindRSA, RSABSSA } from "@cloudflare/blindrsa-ts";

export interface BlindTokenOutput {
  readonly blindedMsg: Uint8Array;
  readonly inv: Uint8Array;
}

const PREPARE_PREFIX_LENGTH = 32;
const TOKEN_RANDOM_BYTES = 32;
const RSA_KEY_ALGORITHM = {
  name: "RSA-PSS",
  hash: "SHA-384",
} as const;

const textEncoder = new TextEncoder();

export function getBlindSuite(): BlindRSA {
  return RSABSSA.SHA384.PSS.Randomized();
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

export async function importVotePublicKey(
  spkiDer: Uint8Array,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "spki",
    toArrayBuffer(spkiDer),
    RSA_KEY_ALGORITHM,
    true,
    ["verify"],
  );
}

export async function importVotePrivateKey(
  pkcs8Der: Uint8Array,
): Promise<CryptoKey> {
  return globalThis.crypto.subtle.importKey(
    "pkcs8",
    toArrayBuffer(pkcs8Der),
    RSA_KEY_ALGORITHM,
    true,
    ["sign"],
  );
}

export function buildVoteTokenPrefix(voteId: string): Uint8Array {
  return textEncoder.encode(`quorum/v1/${voteId}/`);
}

/**
 * Construit le message de jeton du cahier §6.2 :
 * msg = UTF-8("quorum/v1/" + vote_id + "/") ‖ 32 octets aléatoires
 */
export function buildVoteTokenMessage(voteId: string): Uint8Array {
  const prefix = buildVoteTokenPrefix(voteId);
  const randomPart = new Uint8Array(TOKEN_RANDOM_BYTES);
  globalThis.crypto.getRandomValues(randomPart);

  const msg = new Uint8Array(prefix.length + randomPart.length);
  msg.set(prefix, 0);
  msg.set(randomPart, prefix.length);
  return msg;
}

/**
 * Vérifie que input_msg[32:] commence exactement par "quorum/v1/{voteId}/" (§6.3).
 */
export function hasValidVoteTokenPrefix(
  inputMsg: Uint8Array,
  voteId: string,
): boolean {
  const prefix = buildVoteTokenPrefix(voteId);
  const expectedLen =
    PREPARE_PREFIX_LENGTH + prefix.length + TOKEN_RANDOM_BYTES;
  if (inputMsg.length !== expectedLen) {
    return false;
  }
  for (let i = 0; i < prefix.length; i += 1) {
    if (inputMsg[PREPARE_PREFIX_LENGTH + i] !== prefix[i]) {
      return false;
    }
  }
  return true;
}

export function prepareToken(msg: Uint8Array): Uint8Array {
  return getBlindSuite().prepare(msg);
}

export async function blindToken(
  publicKey: CryptoKey,
  inputMsg: Uint8Array,
): Promise<BlindTokenOutput> {
  return getBlindSuite().blind(publicKey, inputMsg);
}

export async function blindSignToken(
  privateKey: CryptoKey,
  blindedMsg: Uint8Array,
): Promise<Uint8Array> {
  return getBlindSuite().blindSign(privateKey, blindedMsg);
}

export async function finalizeToken(
  publicKey: CryptoKey,
  inputMsg: Uint8Array,
  blindSig: Uint8Array,
  inv: Uint8Array,
): Promise<Uint8Array> {
  return getBlindSuite().finalize(publicKey, inputMsg, blindSig, inv);
}

export async function verifyToken(
  publicKey: CryptoKey,
  sig: Uint8Array,
  inputMsg: Uint8Array,
): Promise<boolean> {
  try {
    return await getBlindSuite().verify(publicKey, sig, inputMsg);
  } catch {
    return false;
  }
}
