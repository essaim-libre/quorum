import "server-only";
import { computeVoterId } from "@/lib/crypto/hmac";
import { getEnv } from "@/lib/env";

let cachedAdminSet: Set<string> | null = null;
let cachedEnvKeyHex: string | null = null;

function getAdminVoterIdSet(): Set<string> {
  const env = getEnv();
  const keyHex = env.K_ID.toString("hex");
  if (!cachedAdminSet || cachedEnvKeyHex !== keyHex) {
    cachedAdminSet = new Set(
      env.ADMIN_EMAILS.map((email) =>
        computeVoterId(env.K_ID, email).toString("hex"),
      ),
    );
    cachedEnvKeyHex = keyHex;
  }
  return cachedAdminSet;
}

export function isAdminVoterId(voterId: Buffer): boolean {
  return getAdminVoterIdSet().has(voterId.toString("hex"));
}

export function resetAdminCacheForTest(): void {
  cachedAdminSet = null;
  cachedEnvKeyHex = null;
}
