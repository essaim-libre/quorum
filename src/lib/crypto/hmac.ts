import "server-only";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export function hmacSha256(key: Buffer, ...parts: ReadonlyArray<string | Buffer>): Buffer {
  const mac = createHmac("sha256", key);
  for (const part of parts) {
    mac.update(part);
  }
  return mac.digest();
}

export function sha256(...parts: ReadonlyArray<string | Buffer>): Buffer {
  const hash = createHash("sha256");
  for (const part of parts) {
    hash.update(part);
  }
  return hash.digest();
}

export function constantTimeEqual(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }
  return timingSafeEqual(a, b);
}

export function computeVoterId(kId: Buffer, normalizedEmail: string): Buffer {
  return hmacSha256(kId, normalizedEmail);
}

export function computeOtpHash(
  kOtp: Buffer,
  otpId: string,
  code: string,
): Buffer {
  return hmacSha256(kOtp, otpId, code);
}
