"use client";

/**
 * Invariant n°10 : ne JAMAIS stocker le choix d'un votant sur son appareil.
 * Seuls le jeton (inputMsg, sig), le reçu et les métadonnées publiques du scrutin sont stockés.
 */
export interface StoredVoteToken {
  readonly key: string;
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly inputMsg: string;
  readonly sig: string;
  readonly receipt: string;
  readonly hasVoted: boolean;
  readonly votedAt?: string;
}

export interface PendingBlindRequest {
  readonly key: string;
  readonly voteId: string;
  readonly inputMsg: string;
  readonly blindedMsg: string;
  readonly inv: string;
}

const DB_NAME = "quorum-tokens";
const DB_VERSION = 1;
const TOKENS_STORE = "tokens";
const PENDING_STORE = "pending";

function tokenKey(voteId: string): string {
  return `quorum:token:${voteId}`;
}

function pendingKey(voteId: string): string {
  return `quorum:pending:${voteId}`;
}

function openTokenDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(TOKENS_STORE)) {
        db.createObjectStore(TOKENS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("indexeddb_open_failed"));
  });
}

function runTx<T>(
  storeName: string,
  mode: IDBTransactionMode,
  operation: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openTokenDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const req = operation(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () =>
          reject(req.error ?? new Error("indexeddb_op_failed"));
        tx.oncomplete = () => db.close();
        tx.onerror = () => db.close();
        tx.onabort = () => db.close();
      }),
  );
}

export async function getStoredVoteToken(
  voteId: string,
): Promise<StoredVoteToken | null> {
  const result = await runTx<StoredVoteToken | undefined>(
    TOKENS_STORE,
    "readonly",
    (store) => store.get(tokenKey(voteId)),
  );
  return result ?? null;
}

export async function saveStoredVoteToken(
  token: Omit<StoredVoteToken, "key">,
): Promise<StoredVoteToken> {
  const record: StoredVoteToken = {
    key: tokenKey(token.voteId),
    voteId: token.voteId,
    slug: token.slug,
    question: token.question,
    inputMsg: token.inputMsg,
    sig: token.sig,
    receipt: token.receipt,
    hasVoted: token.hasVoted,
    ...(token.votedAt ? { votedAt: token.votedAt } : {}),
  };
  await runTx(TOKENS_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function markVoteTokenAsVoted(
  voteId: string,
  receipt: string,
): Promise<StoredVoteToken | null> {
  const existing = await getStoredVoteToken(voteId);
  if (!existing) {
    return null;
  }
  return saveStoredVoteToken({
    voteId: existing.voteId,
    slug: existing.slug,
    question: existing.question,
    inputMsg: existing.inputMsg,
    sig: existing.sig,
    receipt,
    hasVoted: true,
    votedAt: new Date().toISOString(),
  });
}

export async function listVotedReceipts(): Promise<StoredVoteToken[]> {
  const all = await runTx<StoredVoteToken[]>(
    TOKENS_STORE,
    "readonly",
    (store) => store.getAll(),
  );
  return all
    .filter((entry) => entry.hasVoted)
    .sort((a, b) => (b.votedAt ?? "").localeCompare(a.votedAt ?? ""));
}

export async function getPendingBlindRequest(
  voteId: string,
): Promise<PendingBlindRequest | null> {
  const result = await runTx<PendingBlindRequest | undefined>(
    PENDING_STORE,
    "readonly",
    (store) => store.get(pendingKey(voteId)),
  );
  return result ?? null;
}

export async function savePendingBlindRequest(
  req: Omit<PendingBlindRequest, "key">,
): Promise<PendingBlindRequest> {
  const record: PendingBlindRequest = {
    key: pendingKey(req.voteId),
    voteId: req.voteId,
    inputMsg: req.inputMsg,
    blindedMsg: req.blindedMsg,
    inv: req.inv,
  };
  await runTx(PENDING_STORE, "readwrite", (store) => store.put(record));
  return record;
}

export async function deletePendingBlindRequest(voteId: string): Promise<void> {
  await runTx(PENDING_STORE, "readwrite", (store) =>
    store.delete(pendingKey(voteId)),
  );
}
