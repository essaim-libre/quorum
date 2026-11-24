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
