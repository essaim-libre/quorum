"use client";

import { useEffect } from "react";
import { ensureVoteToken } from "@/lib/client/voting-client";

/**
 * §4 & §6.2 : demande le jeton aveugle dès l'ouverture de la page d'un vote ouvert,
 * afin que Phase 1 (jeton) et Phase 2 (bulletin) soient séparées dans le temps.
 */
export function TokenPrefetcher({
  voteId,
  slug,
  question,
  publicKeySpkiBase64,
  enabled,
}: {
  readonly voteId: string;
  readonly slug: string;
  readonly question: string;
  readonly publicKeySpkiBase64: string;
  readonly enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled) {
      return;
    }
    void ensureVoteToken({
      voteId,
      slug,
      question,
      publicKeySpkiBase64,
    });
  }, [enabled, publicKeySpkiBase64, question, slug, voteId]);

  return null;
}
