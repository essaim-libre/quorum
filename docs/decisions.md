# Décisions techniques — Quorum

Ce fichier consigne toute décision qui précise ou modifie `docs/cahier-technique.md`, ainsi que la justification de chaque dépendance ajoutée au projet (règle `AGENTS.md`).

---

## 2026-11-24 — Socle J0 : dépendances initiales

**Contexte**
Mise en place du jalon J0 (socle Next.js App Router, TypeScript strict, Tailwind CSS, Drizzle ORM + PostgreSQL, validation Zod, ESLint, Vitest).

**Décision**
Ajout des dépendances suivantes :
- Runtime :
  - `next`, `react`, `react-dom` : framework web prévu au cahier (§0).
  - `drizzle-orm`, `pg` : ORM et pilote PostgreSQL natif (§0, §7), permettant les transactions et `VACUUM`.
  - `zod` : validation aux frontières API et configuration (§8, §12).
  - `server-only` : garde-fou de compilation empêchant l'import accidentel de modules serveur côté client (`AGENTS.md`).
- Développement et qualité :
  - `typescript`, `@types/node`, `@types/react`, `@types/react-dom`, `@types/pg` : typage strict sans `any`.
  - `tailwindcss`, `@tailwindcss/postcss`, `postcss` : feuille de style utilitaire et tokens CSS du §10.
  - `eslint`, `eslint-config-next` : lint Next.js/TypeScript et garde-fou `no-restricted-imports` de l'invariant n°4 (§11).
  - `drizzle-kit` : génération et application des migrations SQL versionnées (§7).
  - `vitest` : exécution des tests unitaires et des tests d'invariants (§13).
  - `tsx` : exécution TypeScript des scripts de migration en ligne de commande.

**Conséquence**
Aucune dépendance tierce côté client hors React/Next.js. Aucune ressource chargée depuis un CDN externe (invariant n°8).

---

## 2026-11-24 — Variable d'environnement `CRON_SECRET`

**Contexte**
Le cahier (§14) précise que `/api/internal/cron` est protégée par un secret partagé, sans nommer la variable dans l'extrait `.env.example` du §12.

**Décision**
Ajout de la variable `CRON_SECRET` dans `.env.example` et dans `src/lib/env.ts` (optionnelle en développement, obligatoire et d'au moins 32 caractères lorsque `NODE_ENV=production`).

**Conséquence**
Cohérence entre `.env.example`, la validation Zod au démarrage et le futur endpoint `/api/internal/cron` (J4).

---

## 2026-11-24 — Jalon J1 : ajout de `lru-cache`

**Contexte**
Le cahier (§11) prévoit un rate limiting en mémoire basé sur `lru-cache` pour l'instance unique en V1, avec clés IP dérivées par `HMAC(sel du jour, ip)` et durée de vie maximale de 15 minutes.

**Décision**
Ajout de la dépendance runtime `lru-cache`.

**Conséquence**
Permet un rate limiting borné en mémoire (sans fuite de mémoire ni persistance d'IP) sur `/api/auth/code`, `/api/votes/:slug/token` et `/api/ballots`.

---

## 2026-11-24 — Aide de test local en mode `MAIL_DRIVER=console`

**Contexte**
En développement local, sans serveur SMTP configuré, le code OTP est affiché uniquement sur la sortie standard du serveur Next.js (`MAIL_DRIVER=console`), qui n'est pas toujours visible lorsqu'on teste depuis le navigateur.

**Décision**
Lorsque `NODE_ENV === "development"` **et** `MAIL_DRIVER === "console"`, `POST /api/auth/code` inclut le champ `devCode` dans la réponse JSON et l'écran de saisie du code l'affiche dans un encart monochrome « Mode dev local ». En `test` et en `production` (où `MAIL_DRIVER=console` est de toute façon interdit au démarrage), `devCode` n'est jamais renvoyé.

**Conséquence**
Test complet du flux d'authentification en local sans serveur de messagerie, sans impact sur la sécurité en production ni sur l'invariant n°1 (aucun email n'est jamais exposé ni journalisé).

---

## 2026-11-24 — Jalon J3 : ajout de `@cloudflare/blindrsa-ts`

**Contexte**
Le cahier (§6) et `AGENTS.md` (invariant n°11) imposent `@cloudflare/blindrsa-ts` (RFC 9474, variante `RSABSSA-SHA384-PSS-Randomized`) pour les signatures aveugles.

**Décision**
Ajout de la dépendance runtime `@cloudflare/blindrsa-ts` (v0.4.6).

**Conséquence**
Primitives RFC 9474 standardisées, utilisables côté client (WebCrypto) et côté serveur (Node WebCrypto), sans réimplémentation cryptographique.

---

## 2026-11-24 — Jalon J3 : ajout de `@playwright/test`

**Contexte**
`AGENTS.md` et le cahier (§13, §14) exigent une suite de tests de bout en bout Playwright (`pnpm test:e2e`) verte à partir du jalon J3.

**Décision**
Ajout de `@playwright/test` en dépendance de développement et ajout du script `test:e2e`.

**Conséquence**
Vérification de bout en bout du parcours étudiant réel dans un navigateur (IndexedDB, `credentials: "omit"` sur `/api/ballots`, vote, revote, « A voté », « Mes reçus »).

---

## 2026-11-24 — Jalon J4 : table `vote_receipts` pour la liste publique des reçus

**Contexte**
La table `ballots` ne stocke que `(vote_id, token_hash, option_id, revision)` avec `token_hash = SHA-256(input_msg)` (invariant n°3). Le reçu public défini au §6.4 vaut `Crockford32(SHA-256("quorum-receipt" ‖ input_msg)[0..45b])`, qui ne peut pas être recalculé après coup à partir de `token_hash` sans conserver `input_msg` ni exposer de lien vers `option_id`.

**Décision**
Ajout d'une table dédiée `vote_receipts(vote_id uuid, receipt text, primary key (vote_id, receipt))`, alimentée de manière idempotente lors de `POST /api/ballots`, protégée par un trigger identique à celui de `ballots` (vote publié et ouvert), purgée en cas d'annulation, et publiée triée uniquement après `closes_at`.

**Conséquence**
- La formule exacte du §6.4 et la structure stricte à 4 colonnes de `ballots` (invariant n°3) sont intégralement préservées.
- Aucune ligne en base ne relie un reçu public à un choix (`option_id`) ni à une identité, ni à un horodatage.
- `docs/cahier-technique.md` (§7) est mis à jour dans le même commit.

---

## 2026-11-25 — Jalon J7 : CSP par nonce (`src/proxy.ts`), pool `worker_threads` pour `blindSign` et sonde `/api/health`

**Contexte**
1. Le cahier (§11) demande une CSP stricte sans `'unsafe-inline'` sur `script-src` si Next.js le permet avec des nonces.
2. En charge (500 étudiants en sortie d'AG, §16), la signature aveugle `RSABSSA.SHA384.PSS.Randomized().blindSign` de `@cloudflare/blindrsa-ts` (SJCL en JS pur) prend ~182 ms par jeton sur un seul thread, ce qui saturerait la boucle d'événements principale (~91 s pour 500 signatures) et risquerait de dépasser le budget de 2 minutes.
3. Le déploiement Scaleway Serverless Containers (§14) nécessite une sonde HTTP de disponibilité (`HEALTHCHECK`).

**Décision**
1. Ajout de `src/proxy.ts` (convention Next.js 16) générant un nonce cryptographique par requête HTML (`script-src 'self' 'nonce-<...>' 'strict-dynamic'`), en excluant `/api/*` du matcher afin que `POST /api/ballots` reste totalement isolée (invariant n°4). Les routes API conservent les en-têtes statiques stricts de `next.config.ts`.
2. Exécution de `@cloudflare/blindrsa-ts` `blindSign` dans un pool borné de `node:worker_threads` (`src/lib/crypto/blind-sign-pool.ts`), sans réimplémenter aucune primitive cryptographique (invariant n°11) et avec remise à zéro immédiate des octets PKCS8 après chaque signature.
3. Ajout de la route publique `GET /api/health` vérifiant la connectivité PostgreSQL (`SELECT 1`, `Cache-Control: no-store`), synchronisée au §8 du cahier technique.

**Conséquence**
- Zéro violation CSP et zéro `'unsafe-inline'` sur `script-src` vérifiés sous Chromium.
- Le test de charge (`pnpm test:load`) exécute 500 jetons aveugles + 500 bulletins anonymes en ~30,4 s (budget max : 120 s) sans bloquer la boucle principale Next.js.
- Zéro dépendance supplémentaire ajoutée.

---

## 2026-11-25 — Correctifs post-audit offensif (SEC-01 à SEC-17)

**Contexte**
Un audit offensif interne (~2 000 requêtes sur dev/prod + PostgreSQL local) a confirmé la solidité du cœur cryptographique (RFC 9474), de l’anonymat (`ballots`), des permissions admin et de la CSP par nonce, tout en identifiant des failles périmétriques : contournement du rate limiting par rotation `X-Forwarded-For`, DoS OTP par invalidation du code précédent, absence de plafond de taille de corps (`413`), absence de rate limit sur `/api/auth/verify`, clôture non bloquante en cas de bourrage, propositions « Contre » illimitées, `isAdmin` figé 30 j en session, race conditions sur pétitions et jetons, et runtime Node 22 vs `engines >= 24` de `@cloudflare/blindrsa-ts`.

**Décision**
1. **IP de confiance et plafonds globaux (SEC-01, SEC-04, SEC-17)** : ajout de `TRUSTED_PROXY_HOPS` (`0` en local/direct, `1` derrière Scaleway). Sans proxy de confiance (`0`), `X-Forwarded-For` et `X-Real-IP` sont ignorés ; avec proxy (`> 0`), lecture depuis la droite (`chain[chain.length - hops]`). Plafonds globaux indépendants des en-têtes sur `/api/auth/code` (600/15 min), `/api/auth/verify` (15/15 min par votant, 100/15 min par IP, 2 000/15 min global), `/api/ballots` (2 000/min global, 1 200/min par scrutin) et `/api/internal/cron` (30/15 min).
2. **Cycle OTP résilient au DoS (SEC-02)** : `verifyOtpCode` accepte tout code actif (non consommé, non expiré, < 5 essais) en comparaison temps constant, afin qu’un attaquant ne puisse pas invalider le code reçu par un étudiant.
3. **Plafond de taille JSON `413` (SEC-03)** : helper `readJsonBodyWithLimit` (4 Ko auth/token/ballots, 16 Ko pétitions/admin) contrôlant `Content-Length` et la lecture en flux.
4. **Clôture bloquante en cas d’anomalie d’intégrité (SEC-05)** : si `totalBallots > tokensIssued`, la clé privée est effacée, un incident public `vote.integrity_alert` est consigné dans `admin_journal`, et les résultats ne sont pas publiés.
5. **Pétitions, sessions admin et concurrences (SEC-07 à SEC-12)** : plafond « Contre » à 2 par étudiant et 50 par pétition + mention « Proposition étudiante » ; recalcul dynamique de `isAdmin` à chaque requête et TTL admin ramené à 24 h ; verrou transactionnel `pg_advisory_xact_lock` + index unique partiel (`drizzle/0003_petitions_active_unique.sql`) ; rejet des points consécutifs (`..`) dans les emails ; interception `23505` sur `emargement` (retour `200`/`409` sans `500`) ; en-têtes `Cache-Control: private, no-store` / `no-store`.
6. **Durcissement complémentaire (SEC-13 à SEC-16)** : passage à Node 24 (`Dockerfile` + CI), refus de `MAIL_DRIVER=console` hors `localhost`, vérification `Origin`/`Sec-Fetch-Site` sur les mutations authentifiées par cookie, bornage des listes (`limit 200`) et `VACUUM emargement` réservé au cron.
7. **Revote (SEC-06)** : le revote jusqu’à 20 révisions (§2.3) est maintenu tel que défini au cahier technique pour protéger contre la pression de groupe en AG ; le compromis face à la cession volontaire du jeton est assumé et documenté.

**Conséquence**
Surface d’attaque DoS, mail-bombing, spam et race conditions verrouillée sans aucune dépendance supplémentaire et sans compromettre les 11 invariants de confidentialité.
