# Suivi de durcissement sécurité — Quorum V1

Source : revue de sécurité interne du code et des routes API (25 novembre 2026) + vérifications défensives complémentaires.

---

## P1 — Critique

### SEC-01 — Contournement du rate limiting via `X-Forwarded-For` + plafond global
- **Gravité** : P1 (Critique)
- **Statut** : `CORRIGÉ`
- **Constats** : `extractClientIp` lisait le premier maillon de `X-Forwarded-For` (falsifiable par le client). La rotation de `X-Forwarded-For` contournait les limites de `/api/ballots` (DoS CPU/DB) et `/api/auth/code` (mail bombing Scaleway).
- **Correctif** :
  - Ajouter `TRUSTED_PROXY_HOPS` dans `src/lib/env.ts` et `.env.example` (`0` par défaut en local/direct, `1` derrière Scaleway Serverless Containers).
  - Quand `TRUSTED_PROXY_HOPS === 0`, ignorer totalement `X-Forwarded-For` / `X-Real-IP` (seau fixe non contournable). Quand `> 0`, lire `chain[chain.length - hops]` depuis la droite (IP ajoutée par le proxy de confiance).
  - Ajouter des plafonds globaux indépendants des en-têtes : mail-bombing (`/api/auth/code` : 600/15 min global), `/api/ballots` (2 000/min global + 1 200/min par scrutin).

### SEC-02 — DoS de connexion OTP (un code plus récent invalidait le précédent)
- **Gravité** : P1 (Critique)
- **Statut** : `CORRIGÉ`
- **Constats** : `verifyOtpCode` ne vérifiait que le dernier code non consommé (`ORDER BY expires_at DESC LIMIT 1`). Un attaquant envoyant des demandes de code pour l’adresse d’un étudiant invalidait immédiatement le code que la victime venait de recevoir.
- **Correctif** :
  - Vérifier tous les codes OTP actifs (non consommés, non expirés, `< 5` essais, 10 derniers max) en temps constant (`timingSafeEqual`).
  - Consommer les codes actifs uniquement après une connexion réussie.
  - Découpler le droit de vérifier un code déjà reçu du quota d’envoi d’email.

---

## P2 — Élevé

### SEC-03 — Limite stricte de taille du corps JSON (`413 payload_too_large`)
- **Gravité** : P2 (Élevé)
- **Statut** : `CORRIGÉ`
- **Constats** : toutes les routes `POST`/`PATCH` faisaient `await request.json()` sans limite (un corps de 20 Mo était lu et parsé en ~0,7 s).
- **Correctif** : créer `src/lib/http/body.ts` (`readJsonBodyWithLimit`, vérifiant `Content-Length` + lecture en flux bornée en octets, retour `413 payload_too_large`) et l’appliquer sur toutes les routes `POST`/`PATCH` (`4 Ko` auth/token/ballots, `16 Ko` pétitions/admin).

### SEC-04 — Rate limiting sur `POST /api/auth/verify`
- **Gravité** : P2 (Élevé)
- **Statut** : `CORRIGÉ`
- **Constats** : aucun rate limit dédié sur `/api/auth/verify`.
- **Correctif** : ajouter `checkAuthVerifyRateLimit` (15 essais/15 min par `voterId`, 100/15 min par IP de confiance, 2 000/15 min global) et renvoyer `429 rate_limited` + `Retry-After`.

### SEC-05 — Contrôle d’intégrité bloquant à la clôture (`ballots <= tokens_issued`)
- **Gravité** : P2 (Élevé)
- **Statut** : `CORRIGÉ`
- **Constats** : `closeVoteIfDue` écrivait `results` même si `totalBallots > tokensIssued` (anomalie grave de bourrage / fuite de clé).
- **Correctif** : vérifier `totalBallots <= tokensIssued` avant toute insertion dans `results`. Si dépassé : effacer `private_key_enc`, consigner un incident public `vote.integrity_alert` dans `admin_journal`, journaliser une erreur critique et refuser de publier les résultats (`integrity_violation`).

### SEC-06 — Jeton revotable (`20` révisions) / achat de voix
- **Gravité** : P2 (Structurel / décision de conception)
- **Statut** : `DOCUMENTÉ (§2.3 maintenu)`
- **Note** : le revote jusqu’à l’échéance (20 révisions) est une exigence explicite du cahier technique §2.3 pour protéger contre la pression de groupe en AG. Le compromis vis-à-vis de la vente volontaire de jeton est documenté dans `docs/decisions.md`.

---

## P3 — Moyen

### SEC-07 — Plafond sur les propositions « Contre » + rate limit + attribution claire
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : plafonner à **2 propositions par étudiant et par pétition** et **50 propositions max par pétition** (avec `pg_advisory_xact_lock`), ajouter un rate limit de mutations pétitions (20/15 min par session), et afficher explicitement « Proposition étudiante » devant la signature libre.

### SEC-08 — Recalcul dynamique de `isAdmin` à chaque requête + TTL admin réduit (24 h)
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : recalculer `isAdminVoterId(row.voterId)` à chaque appel `findActiveSession` (un retrait de `ADMIN_EMAILS` prend effet immédiatement) et ramener la durée de session admin à **24 h** (étudiants conservés à 30 jours, §5.2).

### SEC-09 — Race condition « 1 pétition active / 3 par mois »
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : verrou transactionnel `pg_advisory_xact_lock` par `author_tag` dans `createPetition` + migration SQL `drizzle/0003_petitions_active_unique.sql` ajoutant un index unique partiel sur `petitions(author_tag)` pour `state IN ('collecting', 'in_review', 'changes_requested')`.

### SEC-10 — Variantes d’adresse email (`a..b@`, point en fin de partie locale)
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : durcir la regex de `src/lib/auth/email.ts` pour interdire les points consécutifs (`..`) et les caractères `.` / `-` / `_` en fin de partie locale, et rappeler le test MTA/alias DSI dans `docs/cahier-technique.md` §17.

### SEC-11 — Erreur `500` sur deux demandes de jeton simultanées (collision PK `23505`)
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : dans `src/lib/votes/token.ts`, intercepter la violation d’unicité PostgreSQL (`23505`), relire `emargement(vote_id, voter_tag)` et renvoyer `200` (rejeu idempotent si même `blinded_hash`) ou `409 token_already_issued` (jamais `500`).

### SEC-12 — En-têtes `Cache-Control: private, no-store` sur les API authentifiées et sensibles
- **Gravité** : P3 (Moyen)
- **Statut** : `CORRIGÉ`
- **Correctif** : ajouter `Cache-Control: private, no-store` sur toutes les routes `/api/admin/**`, `/api/auth/**`, `/api/votes/[slug]/token`, `/api/petitions/**` (mutations), `/api/contre/**` et `Cache-Control: no-store` sur `/api/ballots`, `/api/votes`, `/api/votes/[slug]`, `/api/journal` (en conservant `public, max-age=15, s-maxage=15` uniquement sur `/api/votes/[slug]/participation`, §8).

---

## P4 — Faible & durcissement défensif complémentaire

### SEC-13 — Runtime Node 24 dans `Dockerfile` et CI
- **Statut** : `CORRIGÉ` — passage de `node:22-alpine` / Node 22 à `node:24-alpine` / Node 24 pour correspondre à `engines` de `@cloudflare/blindrsa-ts`.

### SEC-14 — Garde-fou `MAIL_DRIVER=console` / `devCode` sur URL non-localhost
- **Statut** : `CORRIGÉ` — refuser `MAIL_DRIVER=console` au démarrage si `APP_URL` n’est pas `localhost` / `127.0.0.1`, et ne jamais renvoyer `devCode` hors `NODE_ENV === "development"` + `localhost`.

### SEC-15 — Défense CSRF en profondeur (`Origin` / `Sec-Fetch-Site`)
- **Statut** : `CORRIGÉ` — créer `src/lib/http/csrf.ts` (`verifySameOrigin`) appliqué sur toutes les mutations `POST`/`PATCH` authentifiées par cookie (excluant `POST /api/ballots`, sans cookie).

### SEC-16 — Bornage des listes et déplacement de `VACUUM emargement` hors GET public
- **Statut** : `CORRIGÉ` — borner les requêtes de liste (`limit = 200`), et exécuter `VACUUM emargement` uniquement depuis le cron authentifié (`POST /api/internal/cron`), pas lors d’un `GET /votes/[slug]/resultats` public (`skipVacuum: true`).

### SEC-17 — Durcissement complémentaire `/api/internal/cron`
- **Statut** : `CORRIGÉ` — ajouter un rate limit (`30/15 min` par IP de confiance) et `Cache-Control: no-store` sur `POST /api/internal/cron` en plus de la comparaison temps constant de `CRON_SECRET`.
