import "server-only";
import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";

/**
 * Pool de Worker Threads exécutant uniquement `@cloudflare/blindrsa-ts`
 * (RSABSSA-SHA384-PSS-Randomized, RFC 9474) hors de la boucle d'événements
 * principale Next.js.
 *
 * - Aucune primitive cryptographique n'est réimplémentée (invariant n°11).
 * - Les octets PKCS8 déchiffrés sont remis à zéro immédiatement après signature.
 * - Permet d'absorber une sortie d'amphi (>500 jetons en <2 min) sans bloquer
 *   ni `/api/ballots`, ni `/api/health`, ni `/amphi/[slug]`.
 */

const WORKER_SCRIPT = `
const { parentPort } = require("node:worker_threads");
const { webcrypto } = require("node:crypto");

let suitePromise = null;
function getSuite() {
  if (!suitePromise) {
    suitePromise = import("@cloudflare/blindrsa-ts").then(({ RSABSSA }) =>
      RSABSSA.SHA384.PSS.Randomized(),
    );
  }
  return suitePromise;
}

parentPort.on("message", async (job) => {
  const pkcs8 = new Uint8Array(job.pkcs8);
  const blindedMsg = new Uint8Array(job.blindedMsg);
  try {
    const suite = await getSuite();
    const privateKey = await webcrypto.subtle.importKey(
      "pkcs8",
      pkcs8,
      { name: "RSA-PSS", hash: "SHA-384" },
      true,
      ["sign"],
    );
    const blindSig = await suite.blindSign(privateKey, blindedMsg);
    parentPort.postMessage({ id: job.id, ok: true, blindSig });
  } catch (err) {
    parentPort.postMessage({
      id: job.id,
      ok: false,
      error: err instanceof Error ? err.message : "blind_sign_worker_error",
    });
  } finally {
    pkcs8.fill(0);
  }
});
`;

interface PendingJob {
  readonly id: number;
  readonly pkcs8: Uint8Array;
  readonly blindedMsg: Uint8Array;
  readonly resolve: (sig: Uint8Array) => void;
  readonly reject: (err: Error) => void;
}

interface WorkerSlot {
  readonly worker: Worker;
  busyJob: PendingJob | null;
}

const MAX_WORKERS = Math.max(2, Math.min(8, availableParallelism()));

let nextJobId = 1;
const slots: WorkerSlot[] = [];
const queue: PendingJob[] = [];

function dispatchNext(): void {
  if (queue.length === 0) {
    return;
  }

  let freeSlot = slots.find((s) => s.busyJob === null);
  if (!freeSlot && slots.length < MAX_WORKERS) {
    freeSlot = spawnSlot();
  }
  if (!freeSlot) {
    return;
  }

  const job = queue.shift();
  if (!job) {
    return;
  }

  freeSlot.busyJob = job;
  freeSlot.worker.ref();

  const pkcs8Copy = new Uint8Array(job.pkcs8.byteLength);
  pkcs8Copy.set(job.pkcs8);
  job.pkcs8.fill(0);

  const blindedCopy = new Uint8Array(job.blindedMsg.byteLength);
  blindedCopy.set(job.blindedMsg);

  freeSlot.worker.postMessage(
    { id: job.id, pkcs8: pkcs8Copy, blindedMsg: blindedCopy },
    [pkcs8Copy.buffer, blindedCopy.buffer],
  );
}

function spawnSlot(): WorkerSlot {
  const worker = new Worker(WORKER_SCRIPT, { eval: true });
  worker.unref();

  const slot: WorkerSlot = { worker, busyJob: null };
  slots.push(slot);

  worker.on(
    "message",
    (msg: {
      readonly id: number;
      readonly ok: boolean;
      readonly blindSig?: Uint8Array;
      readonly error?: string;
    }) => {
      const current = slot.busyJob;
      slot.busyJob = null;
      worker.unref();

      if (current) {
        if (msg.ok && msg.blindSig) {
          current.resolve(new Uint8Array(msg.blindSig));
        } else {
          current.reject(new Error(msg.error ?? "blind_sign_failed"));
        }
      }
      dispatchNext();
    },
  );

  worker.on("error", (err: Error) => {
    const current = slot.busyJob;
    slot.busyJob = null;
    const idx = slots.indexOf(slot);
    if (idx !== -1) {
      slots.splice(idx, 1);
    }
    if (current) {
      current.reject(err);
    }
    dispatchNext();
  });

  worker.on("exit", () => {
    const current = slot.busyJob;
    slot.busyJob = null;
    const idx = slots.indexOf(slot);
    if (idx !== -1) {
      slots.splice(idx, 1);
    }
    if (current) {
      current.reject(new Error("blind_sign_worker_exited"));
    }
  });

  return slot;
}

export function blindSignInWorkerPool(
  pkcs8Der: Uint8Array,
  blindedMsg: Uint8Array,
): Promise<Uint8Array> {
  // Copie dédiée qui sera remise à zéro dès le transfert au worker
  const pkcs8Copy = new Uint8Array(pkcs8Der.byteLength);
  pkcs8Copy.set(pkcs8Der);

  return new Promise<Uint8Array>((resolve, reject) => {
    queue.push({
      id: nextJobId++,
      pkcs8: pkcs8Copy,
      blindedMsg,
      resolve,
      reject,
    });
    dispatchNext();
  });
}

export async function closeBlindSignPool(): Promise<void> {
  const active = slots.splice(0, slots.length);
  await Promise.all(active.map((s) => s.worker.terminate()));
}
