# Journal de coordination — Quorum

Format des entrées (cf. `AGENTS.md`) :

```
## AAAA-MM-JJ HH:MM — <agent> — J<n>
Fait : …
Reste : …
Bloquant / question pour Junior : …
```

---

## 2026-11-24 22:15 — Antigravity — J0
Fait :
- Initialisé le dépôt Git (`main`), déplacé le cahier technique dans `docs/cahier-technique.md`, créé `CLAUDE.md`, `docs/decisions.md`, `docs/JOURNAL.md`, `docs/design/README.md`, `.gitignore`, `.env.example`.
- Mis en place Next.js 16 (App Router, `output: "standalone"`, en-têtes de sécurité §11), TypeScript strict (`no-explicit-any`), Tailwind CSS v4, tokens noir/blanc/gris (clair/sombre) et échelle typographique du §10, polices auto-hébergées `Schibsted Grotesk` et `IBM Plex Mono` via `next/font/google`, et `src/copy/fr.ts`.
- Implémenté `src/lib/env.ts` (validation Zod des clés ≥ 32 octets et distinctes, refus de `MAIL_DRIVER=console` en production), `src/lib/clock.ts` (horloge injectable) et `src/lib/log.ts` (journalisation structurée masquant tout email).
- Configuré ESLint 9 (`eslint.config.mjs`) avec le garde-fou `no-restricted-imports` de l'invariant n°4 sur `src/app/api/ballots/**`.
- Traduit le schéma §7 en Drizzle (`src/lib/db/schema.ts`, `client.ts`, `migrate.ts`), généré les migrations SQL versionnées (`drizzle/0000_initial_schema.sql` et `drizzle/0001_triggers_and_pgcrypto.sql` avec les 3 triggers d'immutabilité/urne et `pgcrypto`), ajouté `docker-compose.yml` (PostgreSQL 16) et la CI GitHub Actions (`.github/workflows/ci.yml`).
- Ajouté les tests unitaires et d'invariants de J0 (`env`, `log`, `clock`, structure stricte de `ballots`, règle ESLint invariant n°4, cohérence des migrations/triggers). `pnpm lint`, `pnpm typecheck`, `pnpm test` et `pnpm build` verts.
Reste :
- Exécuter `docker compose up -d db && pnpm db:migrate` dès que Docker Desktop est démarré localement, puis passer à **J1 — Connexion** (§5 complet, écrans email et code, sessions, rate limiting, `MAIL_DRIVER=console`).
- Optionnel : exporter les maquettes HTML/PNG de Google Stitch dans `docs/design/` avant les écrans de J1/J2.
Bloquant / question pour Junior :
- Docker Desktop n'était pas démarré sur le poste lors de la vérification locale (`dockerDesktopLinuxEngine` indisponible), donc les migrations n'ont pas encore été jouées contre un PostgreSQL local (elles sont prêtes et vérifiées par la CI).

## 2026-11-24 22:35 — Antigravity — J1
Fait :
- Démarré PostgreSQL 16 via `docker compose up -d db`, appliqué les migrations Drizzle (`0000_initial_schema` et `0001_triggers_and_pgcrypto`) et validé en base les 3 triggers d'immutabilité/urne ainsi que la structure stricte de `ballots` (`tests/invariants/db-triggers.test.ts`).
- Exporté l'écran Stitch `01-connexion.html` dans `docs/design/` et appliqué tous les écarts §9/§10.
- Implémenté le §5 complet :
  - `src/lib/crypto/hmac.ts` (`HMAC-SHA256`, `SHA-256`, `timingSafeEqual`).
  - `src/lib/auth/email.ts` (normalisation, domaine `etu.u-bordeaux.fr`, refus du `+`).
  - `src/lib/ratelimit.ts` (`lru-cache`, sel IP quotidien en mémoire, 3/15 min et 10/jour par `voter_id`, 300/15 min par IP).
  - `src/lib/mail/` (drivers `console` sans email dans les logs et `scaleway` texte brut sans lien ni pixel).
  - `src/lib/auth/otp.ts`, `session.ts`, `admin.ts` (code 6 chiffres `randomInt`, TTL 10 min, 5 essais max, comparaison à temps constant, session 30 j en `SHA-256`, cookie `__Host-quorum_session` `HttpOnly; Secure; SameSite=Lax; Path=/`, détection `ADMIN_EMAILS`).
  - Routes `POST /api/auth/code`, `POST /api/auth/verify`, `POST /api/auth/logout`.
- Créé les écrans conformes §9/§10 : `/` (accueil « Recevoir un code », saisie email, saisie code à 6 cases avec collage et renvoi après 60 s), `/votes`, `/moi` (avec déconnexion), `/comment-ca-marche` et navigation basse texte seul.
- Livré les tests J1 (`email-and-ratelimit.test.ts`, `auth-otp.test.ts`, `db-triggers.test.ts`). `pnpm lint`, `pnpm typecheck`, `pnpm test` (8 fichiers / 30 tests) et `pnpm build` verts.
Reste :
- **J2 — Votes en lecture et administration** : création, brouillon, publication avec génération de clé RSA 2048 chiffrée AES-256-GCM, annulation motivée, journal public, pages Votes et Question.
Bloquant / question pour Junior :
- Aucun.

## 2026-11-24 22:57 — Antigravity — J2
Fait :
- Ajouté le chiffrement AES-256-GCM des clés privées (`src/lib/crypto/aead.ts`, format `nonce(12) ‖ ciphertext ‖ tag(16)`) et la génération des paires RSA 2048 (`e = 65537`) par vote avec empreinte `SHA-256(SPKI)` (`src/lib/crypto/vote-keys.ts`).
- Implémenté les règles de vote §2 (`src/lib/votes/rules.ts`, ajout automatique de « Vote blanc », durée 24 h–14 j, slugs, statut via `now()` PostgreSQL), le formatage `Europe/Paris` (`src/lib/dates.ts`), le journal public (`src/lib/journal.ts`) et le service complet (`src/lib/votes/service.ts`).
- Créé les routes API §8 : `GET /api/votes`, `GET /api/votes/:slug` (sans aucun décompte avant clôture, invariant n°5), `GET /api/votes/:slug/participation` (cache 15 s), `GET /api/journal`, et l'administration (`GET/POST /api/admin/votes`, `PATCH /api/admin/votes/:id`, `POST /api/admin/votes/:id/publish`, `POST /api/admin/votes/:id/cancel` avec suppression des bulletins et journalisation publique).
- Construit les pages conformes §9/§10 : `/votes` (Ouverts · Bientôt · Clos, carré 8 px, barre 2 px sans quorum, sans filtre campus), `/votes/[slug]` (arguments Pour/Contre inversés, faits concrets, règles du vote et empreinte de clé en mono), `/admin` (création/édition brouillon, publication, annulation motivée) et `/journal`.
- Livré les tests J2 (`aead-and-vote-keys.test.ts`, `vote-rules.test.ts`, `votes-lifecycle.test.ts`). `pnpm lint`, `pnpm typecheck`, `pnpm test` (11 fichiers / 41 tests) et `pnpm build` verts.
Reste :
- **J3 — Vote anonyme** : §6.1 à §6.4 (`@cloudflare/blindrsa-ts` + vecteurs RFC 9474, `POST /api/votes/:slug/token`, `POST /api/ballots` sans cookie ni auth, IndexedDB, Bulletin, Confirmation, A voté, Mes reçus, tests d'invariants et Playwright E2E).
Bloquant / question pour Junior :
- Aucun.

## 2026-11-24 23:17 — Antigravity — J3
Fait :
- Ajouté l'affichage local du code OTP (`devCode`) uniquement lorsque `NODE_ENV === "development"` et `MAIL_DRIVER === "console"`, pour permettre les tests locaux dans le navigateur sans serveur SMTP (documenté dans `docs/decisions.md`, strictement inactif en production et en test).
- Implémenté le protocole de vote anonyme §6.1 à §6.4 :
  - `src/lib/crypto/blind.ts` : wrapper `@cloudflare/blindrsa-ts` (`RSABSSA-SHA384-PSS-Randomized`, RFC 9474) + construction/vérification du préfixe `quorum/v1/{voteId}/`.
  - `src/lib/crypto/base64url.ts` : encodage/décodage base64url isomorphe navigateur/Node sans dépendre du polyfill `Buffer`.
  - `src/lib/crypto/receipt.ts` : calcul du reçu Crockford Base32 des 45 premiers bits de `SHA-256("quorum-receipt" ‖ input_msg)` au format `XX-XXXX-XXX`.
  - Phase 1 : `src/lib/votes/token.ts` et `POST /api/votes/[slug]/token` (session obligatoire, rate limit 10/min, `emargement` transactionnel avec rejeu idempotent et `409 token_already_issued` sur demande différente).
  - Phase 2 : `src/lib/votes/ballot.ts` et `POST /api/ballots` (invariant n°4 respecté et vérifié par ESLint + tests : aucun cookie, aucune session, aucun import auth/`next/headers`, rate limit 600/min/IP, revote jusqu'à 20 révisions).
- Créé le stockage client IndexedDB `src/lib/client/token-store.ts` (invariant n°10 : aucun choix stocké) et `src/lib/client/voting-client.ts` (délai aléatoire 0,5 à 3 s + `credentials: "omit"`).
- Construit les écrans §9/§10 : préchargement du jeton dès l'ouverture de `/votes/[slug]` (`TokenPrefetcher`), `/votes/[slug]/bulletin` (choix sans présélection + confirmation), `/votes/[slug]/a-vote` (« A voté. » + reçu copiable, sans quorum), et « Mes reçus » dans `/moi` (`MyReceiptsList`).
- Livré les tests unitaires avec le vecteur officiel RFC 9474 annexe A.1 (`tests/unit/blind-crypto.test.ts`), les tests d'invariants (`tests/invariants/anonymous-voting.test.ts`) et le test Playwright E2E complet (`tests/e2e/voting-flow.spec.ts`).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (13 fichiers / 47 tests), `pnpm test:e2e` (Chromium) et `pnpm build` verts.
Reste :
- **J4 — Clôture et résultats** : §6.5 et §6.6, clôture idempotente (`results`, `tokens_issued`, suppression `emargement`, effacement `private_key_enc`, `VACUUM`), dépouillement (`tally.ts`), page Résultats, liste des reçus (`/api/votes/:slug/receipts`), procès-verbal PDF (`/api/votes/:slug/pv.pdf`) et cron (`/api/internal/cron`).
Bloquant / question pour Junior :
- Aucun.

## 2026-11-24 23:30 — Antigravity — J4
Fait :
- Ajouté la table `vote_receipts(vote_id, receipt)` (`drizzle/0002_vote_receipts.sql` + trigger `trg_vote_receipts_guard`), documentée dans `docs/decisions.md` et synchronisée dans `docs/cahier-technique.md` §7, afin de publier la liste triée des reçus sans modifier `ballots` (invariant n°3) ni relier un reçu à un `option_id`.
- Implémenté le dépouillement pur §2.2 (`src/lib/votes/tally.ts` : pourcentages sur les suffrages exprimés, blancs à part, gagnant/égalité/aucun exprimé, contrôle `bulletins ≤ tokens_issued`, empreinte `SHA-256` de la liste triée des reçus).
- Implémenté la clôture idempotente §6.5 (`src/lib/votes/close.ts` : verrou `FOR UPDATE`, insertion `results`, `tokens_issued = count(emargement)`, suppression de `emargement`, `private_key_enc = null`, puis `VACUUM emargement` hors transaction) et les purges quotidiennes (`otp_codes` > 24 h, sessions expirées).
- Implémenté le générateur de procès-verbal PDF 1.4 autonome (`src/lib/votes/pv-pdf.ts`, zéro dépendance externe).
- Créé les routes API §8 et §14 : `GET /api/votes/[slug]/receipts`, `GET /api/votes/[slug]/pv.pdf`, `POST /api/internal/cron` (protégé par `CRON_SECRET` en comparaison temps constant), et enrichi `GET /api/votes/[slug]` (résultats inclus uniquement si clos, invariant n°5).
- Construit les pages conformes §9/§10 : `/votes/[slug]/resultats` (barres 24 px, blanc en `blank`, « Échéance : … », « Bulletins : … · Jetons émis : … », empreintes, PV PDF, sans quorum ni composante) et `/votes/[slug]/recus` (`ReceiptsDirectory` avec recherche client et vérification automatique du reçu IndexedDB).
- Livré les tests J4 (`tests/unit/tally-and-pv.test.ts`, `tests/invariants/close-and-results.test.ts`, `tests/e2e/results-and-receipts.spec.ts` + helper `admin-session.ts`).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (15 fichiers / 54 tests), `pnpm test:e2e` (2 tests E2E Chromium) et `pnpm build` verts.
Reste :
- **J5 — Pétitions** : §3 complet, Proposer, Signatures, « Contre », relecture, publication automatique après 48 h.
Bloquant / question pour Junior :
- Aucun.

## 2026-11-24 23:41 — Antigravity — J5
Fait :
- Implémenté le cycle de vie complet des pétitions §3 (`src/lib/petitions/rules.ts` et `src/lib/petitions/service.ts`) :
  - Dépôt limité à 1 pétition active et 3 par mois par auteur (`HMAC(K_SIG, voter_id ‖ "author")`), signature automatique de l'auteur, option décision d'AG (date, lieu, présents, résultat).
  - Signatures pseudonymes uniques (`HMAC(K_SIG, voter_id ‖ petition_id)`), passage automatique en `in_review` avec échéance 48 h au seuil (`PETITION_THRESHOLD`).
  - Arguments « Contre » (≤ 600 car.) et soutien unique remplaçable par pétition, sélection du plus soutenu (plus ancien en cas d'égalité) lors de la publication du vote.
  - Relecture admin (`approve` avec ouverture ≤ 24 h et faits sourcés optionnels, `request_changes` avec acceptation/refus par l'auteur uniquement, `reject` sur liste fermée de 4 motifs), toutes journalisées publiquement dans `admin_journal` (invariant n°9).
  - Expiration automatique après `collect_until`, publication automatique après 48 h sans décision (`petition.auto_approve`), et purge RGPD 30 jours branchées dans `POST /api/internal/cron`.
- Créé les 7 routes API pétitions §8 (`GET/POST /api/petitions`, `GET /api/petitions/[slug]`, `POST /api/petitions/[slug]/sign`, `POST /api/petitions/[slug]/contre`, `POST /api/contre/[id]/support`, `POST /api/petitions/[slug]/accept-rewording`, `POST /api/admin/petitions/[id]/review`).
- Construit les écrans §9/§10 : `/proposer` (4 étapes Question · Options · Arguments · Durée, charte §3.5 avec contre-exemple barré et exemple conforme, case décision d'AG), `/petitions` (En collecte · En relecture), `/petitions/[slug]` (09 Signatures + arguments Contre + acceptation de reformulation), et la file de relecture dans `/admin` (`AdminPetitionQueue`).
- Livré les tests J5 (`tests/unit/petitions.test.ts` et `tests/e2e/petitions-flow.spec.ts` avec 300 signatures simulées).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (16 fichiers / 57 tests), `pnpm test:e2e` (3 tests E2E Chromium) et `pnpm build` verts.
Reste :
- **J6 — Mode amphi, « Comment ça marche », journal, page données personnelles.**
Bloquant / question pour Junior :
- Aucun.

## 2026-11-24 23:43 — Antigravity — Bilan de fin de session (J0 à J5 terminés)
Fait :
- Jalons terminés et commités sur `main` :
  - **J0 — Socle** (`6addb97`) : Next.js 16 (App Router, `output: "standalone"`), TypeScript strict, Tailwind v4 + tokens noir/blanc/gris §10, polices auto-hébergées `Schibsted Grotesk` & `IBM Plex Mono`, Drizzle ORM + PostgreSQL 16 (`docker-compose.yml`), migrations SQL avec triggers d'immutabilité/urne, `env.ts` (Zod), `log.ts` (masquage emails), `clock.ts`, règle ESLint invariant n°4, CI GitHub Actions.
  - **J1 — Connexion** (`fe9bcea`) : OTP 6 chiffres (`randomInt`, TTL 10 min, 5 essais, `timingSafeEqual`), normalisation email `@etu.u-bordeaux.fr` (sans `+`), sessions 30 j (`__Host-quorum_session`), rate limiting `lru-cache` (sel IP quotidien), `MAIL_DRIVER=console|scaleway`, écrans accueil / email / code 6 cases (renvoi 60 s) et déconnexion.
  - **J2 — Votes en lecture et administration** (`aec932c`) : clés RSA 2048 par vote chiffrées AES-256-GCM (`MASTER_KEY`), règles §2 (`Vote blanc` auto, 24 h–14 j), création/édition brouillons, publication immuable, annulation motivée, journal public (`admin_journal`), pages `/votes`, `/votes/[slug]`, `/admin`, `/journal`.
  - **J3 — Vote anonyme** (`b205366`) : `@cloudflare/blindrsa-ts` (RFC 9474, `RSABSSA-SHA384-PSS-Randomized`) vérifié sur le vecteur officiel annexe A.1, reçu Crockford Base32 `XX-XXXX-XXX`, Phase 1 (`POST /api/votes/[slug]/token`, idempotence), Phase 2 (`POST /api/ballots`, sans cookie ni import auth, revote jusqu'à 20 révisions), IndexedDB sans stockage du choix (invariant n°10), écrans Bulletin / Confirmation / A voté / Mes reçus, aide locale `devCode` en `development` + `MAIL_DRIVER=console`.
  - **J4 — Clôture et résultats** (`777b407`) : table `vote_receipts` + trigger, dépouillement pur §2.2, clôture idempotente (`results`, `tokens_issued`, suppression `emargement`, `private_key_enc = null`, `VACUUM emargement`), procès-verbal PDF 1.4 autonome (`/api/votes/[slug]/pv.pdf`), `/api/votes/[slug]/receipts`, `/api/internal/cron`, pages `/votes/[slug]/resultats` et `/votes/[slug]/recus`.
  - **J5 — Pétitions** (`0415d8b`) : dépôt (1 active, 3/mois, option décision d'AG, charte §3.5), signatures pseudonymes, arguments « Contre » + soutien unique remplaçable, file de relecture admin (`approve`, `request_changes`, `reject`), acceptation de reformulation par l'auteur, expiration et publication automatique après 48 h branchées au cron, écrans `/proposer`, `/petitions`, `/petitions/[slug]` et file de relecture `/admin`.
- État de vérification : `pnpm lint`, `pnpm typecheck`, `pnpm test` (16 fichiers / 57 tests), `pnpm test:e2e` (3 tests E2E Chromium) et `pnpm build` tous verts.
Reste pour la prochaine session :
- **J6** : Mode amphi (`/amphi/[slug]` avec QR code local, compte à rebours, rafraîchissement 10 s, zéro résultat avant clôture), page `/comment-ca-marche` complète (ticket tamponné, perte d'appareil, lien journal), enrichissement `/journal`, page `/donnees-personnelles` (§15 RGPD).
- **J7** : Durcissement (en-têtes/CSP, revue des logs, Playwright complet, test de charge 500 jetons + 500 bulletins en 2 min, Dockerfile et préparation déploiement Scaleway).
Bloquant / question pour Junior :
- Pour reprendre demain : démarrer Docker Desktop puis `docker compose up -d db` et `pnpm dev`.

## 2026-11-25 11:48 — Antigravity — J6
Fait :
- Implémenté un générateur QR Code ISO/IEC 18004 autonome (`src/lib/qr.ts`, mode UTF-8, niveau M, versions 1–10, zéro dépendance externe / invariant n°8) avec ses tests unitaires (`tests/unit/qr.test.ts` vérifiant les vecteurs BCH ISO 18004 annexes C/D, motifs de repérage, synchronisation et SVG).
- Construit le **Mode amphi** (`/amphi/[slug]`, `src/components/AmphiDisplay.tsx`) conforme §9/§10 : compteur géant `tabular-nums`, compte à rebours synchronisé sur l'heure de la base, rafraîchissement automatique toutes les 10 s sur `/api/votes/[slug]/participation`, QR code SVG monochrome local (fond blanc fixe pour la lisibilité même en mode sombre), aucun repère de quorum, aucun résultat partiel avant `closes_at` (invariant n°5), liens ajoutés depuis `/votes/[slug]` et `/admin`.
- Complété la page **« Comment ça marche »** (`/comment-ca-marche`) selon §6.2, §6.7 et §9 : analogie du ticket tamponné sans être lu en 4 étapes, ce qui est stocké / jamais stocké / public à la clôture, perte de l'appareil ou vidage du navigateur, tableau « Garanti / Non garanti en V1 », liens vers `/journal` et `/donnees-personnelles`.
- Enrichi le **journal public** (`src/lib/journal.ts`, `GET /api/journal`, `/journal`) : résolution des intitulés et liens publics des scrutins publiés et pétitions (sans divulguer les questions des brouillons non publiés, vérifié dans `tests/invariants/votes-lifecycle.test.ts`) et filtres `Toutes · Scrutins · Pétitions`.
- Créé la page **« Données personnelles »** (`/donnees-personnelles`) conforme §15 RGPD (responsable, finalités et données sensibles, tableau des 7 catégories/natures/durées de conservation, hébergement UE sans traceurs, droits RGPD/CNIL, contact), reliée depuis `/`, `/moi`, `/comment-ca-marche` et `/journal`.
- Ajouté le test Playwright E2E J6 (`tests/e2e/amphi-and-info-pages.spec.ts` : montée automatique du compteur en mode amphi sans résultat avant l'échéance + vérification des 3 pages d'information).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (17 fichiers / 62 tests), `pnpm test:e2e` (4 tests E2E Chromium) et `pnpm build` tous verts.
Reste :
- **J7 — Durcissement** : en-têtes/CSP, revue des logs, Playwright complet, test de charge (500 jetons et 500 bulletins en 2 minutes), Dockerfile et préparation déploiement Scaleway.
Bloquant / question pour Junior :
- Aucun.

## 2026-11-25 12:25 — Antigravity — J7
Fait :
- Mis en place une **CSP stricte par nonce cryptographique par requête** via `src/proxy.ts` (convention Next.js 16) + `src/lib/security-headers.ts` + `connection()` dans `src/app/layout.tsx` : zéro `'unsafe-inline'` sur `script-src`, exclusion explicite de `/api/*` du matcher (préservant l'isolation totale de `POST /api/ballots`, invariant n°4), conservation de `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, `Permissions-Policy` et `HSTS` en production.
- Réalisé la **revue complète des logs** et ajouté la suite d'invariants bloquants `tests/invariants/logs-and-security.test.ts` : zéro `console.*` dans `src/`, lecture IP strictement cantonnée à `src/lib/ratelimit.ts`, zéro ressource tierce dans l'UI (invariant n°8), vérification des en-têtes §11 et vérification en exécution réelle qu'aucune ligne de log produite lors des flux auth/admin/erreur ne contient `@` ni d'adresse IP.
- Ajouté la sonde de disponibilité `GET /api/health` (`src/app/api/health/route.ts`, `Cache-Control: no-store`, vérification PostgreSQL `SELECT 1`).
- Isolé l'appel `@cloudflare/blindrsa-ts` `blindSign` dans un pool borné de `node:worker_threads` (`src/lib/crypto/blind-sign-pool.ts`, zéro primitive réimplémentée, remise à zéro PKCS8) et livré le **test de charge reproductible** `scripts/load-test.ts` (`pnpm test:load`) : **500 jetons aveugles (29,31 s, 17,1/s) + 500 bulletins anonymes (1,10 s, 454,5/s) = 30,41 s au total** (budget max : 120 s), 1 003 lignes de log vérifiées avec `0` `@`.
- Ajouté la 5ᵉ suite Playwright E2E `tests/e2e/hardening-and-csp.spec.ts` (en-têtes §11, nonces uniques, zéro violation CSP sous hydratation, zéro requête tierce, `/api/health`, comportement identique de `POST /api/ballots` avec/sans cookie) et branché Playwright E2E dans la CI GitHub Actions (`.github/workflows/ci.yml`).
- Préparé le **déploiement Scaleway** (§14) : `Dockerfile` multi-stage Node 22 Alpine standalone (utilisateur non-root `nextjs`, `HEALTHCHECK` sur `/api/health`), `.dockerignore` et guide opérationnel `docs/deploiement-scaleway.md`.
- Mis à jour `docs/decisions.md` et `docs/cahier-technique.md` (§8 et §16 : **J0 à J7 tous cochés**).
- Vérifications finales : `pnpm lint`, `pnpm typecheck`, `pnpm test` (18 fichiers / 66 tests), `pnpm test:load` (30,41 s < 120 s), `pnpm test:e2e` (5 suites Chromium) et `pnpm build` tous verts.
Reste :
- Points organisationnels hors code avant mise en ligne (§15, §17) : vérification des alias `@etu.u-bordeaux.fr`, test de délivrabilité email sur boîtes étudiantes, désactivation/minimisation des logs IP côté plateforme Scaleway, structure porteuse (association loi 1901) et documentation du niveau de risque CNIL (délibération n° 2026-045) dans `docs/decisions.md`.
Bloquant / question pour Junior :
- Aucun bloquant technique : tous les jalons V1 (J0 à J7) sont terminés et verts.

## 2026-11-25 13:10 — Antigravity — Finition UX/UI (post-J7)
Fait :
- Mis en place un socle CSS de mouvement natif (`src/app/globals.css`, zéro dépendance, zéro flou/ombre/dégradé, respect strict de `prefers-reduced-motion: reduce` et `safe-area-inset-bottom`).
- Créé l'en-tête fixe contextuel `StickyHeader` (`src/components/StickyHeader.tsx`, fond opaque, `IntersectionObserver` sur le `<h1>`, filet `rule → ink`, titre condensé sur une ligne et action rapide « Voter » / « Résultats » au défilement sur `/votes/[slug]`), déployé sur l'ensemble des pages principales, de détail et d'information, et ajouté `src/app/(app)/loading.tsx` (squelette monochrome minimaliste).
- Ajouté les micro-interactions sur les parcours clés : transitions d'étapes et secousse discrète OTP (`LoginFlow`), filet de progression `01/02 → 02/02`, navigation clavier WAI-ARIA `radiogroup` et barre indéterminée d'envoi anonyme (`BallotFlow`), apparition chorégraphiée et bouton « Copié » inversé (`VotedReceiptView`), navigation clavier `tablist` (`ArgumentsTabs`), progression continue 4 étapes (`ProposePetitionFlow`), barres de résultats animées en `scaleX` échelonnées (`/votes/[slug]/resultats`) et présence live en projection (`ParticipationBar`, `VoteStatusIndicator`, `AmphiDisplay`).
- Ajouté la vérification E2E du passage `data-condensed="false" → "true"` au scroll dans `tests/e2e/hardening-and-csp.spec.ts`.
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (18 fichiers / 66 tests), `pnpm build` et `pnpm test:e2e` (5 suites Chromium) tous verts.
Reste :
- Points organisationnels hors code avant mise en ligne (§15, §17).
Bloquant / question pour Junior :
- Aucun.

## 2026-11-25 18:15 — Antigravity — Durcissement sécurité et résilience (SEC-01 à SEC-17)
Fait :
- Créé le suivi des 17 mesures de durcissement dans `docs/security-audit-tickets.md` et consigné les décisions dans `docs/decisions.md` + `docs/cahier-technique.md` (§12) + `docs/deploiement-scaleway.md`.
- **P1 — SEC-01 (XFF / rate limiting global)** : ajouté `TRUSTED_PROXY_HOPS` (`0` par défaut en local/direct -> ignore `X-Forwarded-For` / `X-Real-IP` ; `> 0` -> lit depuis la droite `chain[chain.length - hops]`) et plafonds globaux indépendants des en-têtes (`/api/auth/code` 600/15 min, `/api/ballots` 2 000/min global + 1 200/min par scrutin).
- **P1 — SEC-02 (DoS OTP)** : `verifyOtpCode` accepte désormais tout code actif (non consommé, non expiré, < 5 essais) en temps constant pour qu'un attaquant ne puisse plus invalider le code reçu par un étudiant.
- **P2 — SEC-03 (limite 413)** : créé `src/lib/http/body.ts` (`readJsonBodyWithLimit`, contrôle `Content-Length` + flux borné en octets -> `413 payload_too_large`, 4 Ko auth/token/ballots, 16 Ko pétitions/admin) appliqué sur toutes les routes `POST`/`PATCH`.
- **P2 — SEC-04 (rate limit `/api/auth/verify`)** : ajouté `checkAuthVerifyRateLimit` (15/15 min par votant, 100/15 min par IP de confiance, 2 000/15 min global).
- **P2 — SEC-05 (clôture bloquante)** : `closeVoteIfDue` refuse d'écrire `results` si `totalBallots > tokensIssued`, efface `private_key_enc` et publie `vote.integrity_alert` dans `admin_journal`.
- **P3 — SEC-07 à SEC-12** : plafond « Contre » (2/étudiant/pétition, 50/pétition + `pg_advisory_xact_lock` + mention « Proposition étudiante » + rate limit 20/15 min) ; recalcul dynamique de `isAdmin` à chaque requête + TTL session admin ramené à 24 h ; verrou `pg_advisory_xact_lock` + migration `drizzle/0003_petitions_active_unique.sql` (index unique partiel) ; rejet `..` et bordures dans `email.ts` ; interception `23505` sur `emargement` (retour `200`/`409` sans `500`) ; en-têtes `Cache-Control: private, no-store` / `no-store`.
- **P4 — SEC-13 à SEC-17** : passage à Node 24 (`Dockerfile` + CI), refus `MAIL_DRIVER=console` hors `localhost`, défense CSRF `Origin`/`Sec-Fetch-Site` (`src/lib/http/csrf.ts`), bornage des listes (`limit 200`), `VACUUM emargement` réservé au cron et rate limit sur `/api/internal/cron`.
- Ajouté les tests de non-régression sécurité dans `tests/invariants/security-audit-fixes.test.ts` et enrichi `tests/e2e/hardening-and-csp.spec.ts` (413, Cache-Control, CSRF cross-origin).
- `pnpm lint`, `pnpm typecheck`, `pnpm test` (19 fichiers / 76 tests), `pnpm build` et `pnpm test:e2e` (5 suites Chromium) tous verts.
Reste :
- Points organisationnels hors code avant mise en ligne (§15, §17).
Bloquant / question pour Junior :
- Aucun.

## 2026-11-25 23:30 — Antigravity — Bilan de fin de session (V1 complète, durcie et publiée)
Fait :
- **J6 — Mode amphi & pages d’information** (`661975d`) : générateur QR autonome ISO 18004 (`src/lib/qr.ts`), `/amphi/[slug]` temps réel sans décompte partiel, `/comment-ca-marche`, `/journal` enrichi, `/donnees-personnelles` RGPD §15.
- **J7 — Durcissement & déploiement** (`929a587`) : CSP stricte par nonce cryptographique (`src/proxy.ts`), revue complète des logs et invariants bloquants (`tests/invariants/logs-and-security.test.ts`), `/api/health`, pool `worker_threads` pour `blindSign`, test de charge 500 jetons + 500 bulletins en `30,41 s` (< 120 s), `Dockerfile` Node 24, guide `docs/deploiement-scaleway.md`, CI GitHub Actions avec Playwright.
- **Finition UX/UI** (`4206d17`) : socle CSS de mouvement natif (`prefers-reduced-motion`), `StickyHeader`, `loading.tsx`, micro-interactions WAI-ARIA sur l’ensemble des parcours.
- **Durcissement sécurité et résilience `SEC-01` à `SEC-17`** (`f3106ad`, `20ab034`, `9921b3f`) : `TRUSTED_PROXY_HOPS` + plafonds globaux, résilience OTP, limite JSON `413`, rate limit `/api/auth/verify`, clôture bloquante (`integrity_violation` affiché sur `/resultats` et `/recus`), bornage « Contre », recalcul dynamique `isAdmin` + TTL 24 h, verrous transactionnels PostgreSQL + index unique pétition active, défense CSRF `Origin`/`Sec-Fetch-Site`, validation exacte `MASTER_KEY` 32 octets, passage Node 24.
- **Documentation publique & positionnement indépendant** (`9921b3f`) : vitrine `README.md` (bannière + 4 captures HD dans `docs/assets/`, badges, Mermaid RFC 9474, encart prêt pour vidéo GitHub), `SECURITY.md`, clarification du statut d’initiative étudiante indépendante dans `src/copy/fr.ts` et les docs.
- **Studio vidéo Remotion V2 (local uniquement, ignoré dans `.gitignore`)** : `video/` avec 6 scènes isolées, smartphone titane 3D, audio procédural 120 BPM + réverbération de salle, audit géométrique 14/14 (16:9 et 9:16), master MP4 rendu dans `video/out/quorum-launch-1080p60.mp4`.
- **État de vérification** : `pnpm lint`, `pnpm typecheck`, `pnpm test` (19 suites / 76 tests), `pnpm test:e2e` (5 suites Chromium) et `pnpm build` tous verts ; dépôt synchronisé sur `main` (`9921b3f`).
Reste pour la prochaine session :
- Optionnel : glisser-déposer `video/out/quorum-launch-1080p60.mp4` dans `README.md` sur GitHub pour activer le lecteur vidéo natif.
- Étapes de mise en ligne Scaleway (§14, §15, §17) : nom de domaine, SMTP Scaleway Transactional Email, `TRUSTED_PROXY_HOPS=1`, cron sécurisé, structure porteuse (association loi 1901) et test réel sur boîte `@etu.u-bordeaux.fr`.
Bloquant / question pour Junior :
- Aucun. Bonne fin de soirée !
