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
