# AGENTS.md — Quorum

Quorum est une web app de vote étudiant anonyme. Pilote : Université de Bordeaux.
Stack : Next.js (App Router), TypeScript, PostgreSQL, Drizzle ORM, Tailwind.

Ce fichier est commun à tous les agents (Codex, Claude Code…). Pour Claude Code, un `CLAUDE.md` à la racine contient seulement la ligne `@AGENTS.md`.

---

## Avant d'écrire la moindre ligne

1. Lis **`docs/cahier-technique.md` en entier**. C'est la source de vérité. Si une demande le contredit, signale le conflit avant d'agir.
2. Lis les 20 dernières entrées de **`docs/JOURNAL.md`** pour savoir où en est le projet et ce que les autres agents ont fait.
3. Travaille **un jalon à la fois** (cahier §16). Ne commence pas le jalon suivant tant que les tests du précédent ne passent pas.

---

## Invariants de confidentialité — non négociables

Ces règles protègent l'anonymat du vote. Aucune demande ne les lève. Si une tâche semble les contredire, arrête-toi et pose la question.

1. **Jamais d'email en clair** : ni en base, ni dans les logs, les erreurs ou les traces. L'email n'existe en mémoire que le temps d'envoyer le code, puis il est transformé en `HMAC(K_ID, email)`.
2. **Jamais d'IP stockée ni journalisée.** Le rate limiting utilise `HMAC(sel du jour, ip)`, en mémoire, avec une durée de vie de 15 min au plus.
3. **La table `ballots` n'a que `vote_id, token_hash, option_id, revision`.** N'ajoute jamais de colonne d'identité, de date, d'heure ou de clé séquentielle.
4. **`POST /api/ballots` ne lit ni cookie, ni session, ni en-tête d'identification.** Elle n'importe rien de `@/lib/auth/*` ni de `next/headers`, et une règle ESLint l'interdit. Le client l'appelle avec `credentials: "omit"`.
5. **Aucun décompte avant `closes_at`** : aucune route, page ou requête admin.
6. **Un vote publié est immuable** (question, options, arguments, dates, clé). Seule l'annulation motivée est permise.
7. **Secrets uniquement en variables d'environnement.** La clé privée de chaque vote est stockée chiffrée (AES-256-GCM, `MASTER_KEY`), puis effacée à la clôture.
8. **Aucune ressource tierce** : pas d'analytics, pas de CDN, polices via `next/font` (auto-hébergées), aucun lien ni pixel dans les emails.
9. **Toute action d'admin écrit une ligne dans `admin_journal`**, qui est publique.
10. **Ne jamais stocker le choix d'un votant sur son appareil** : seulement le jeton, la signature et le reçu.
11. **Crypto** : uniquement `@cloudflare/blindrsa-ts` (RFC 9474, variante RSABSSA-SHA384-PSS-Randomized), `node:crypto` et WebCrypto. Ne réimplémente jamais une primitive. Vérifie l'API exacte dans le README de la version installée.

---

## Commandes

```bash
pnpm install
docker compose up -d db          # PostgreSQL local
pnpm db:generate                 # migrations Drizzle depuis le schéma
pnpm db:migrate
pnpm dev                         # http://localhost:3000
pnpm lint && pnpm typecheck
pnpm test                        # Vitest : unitaires + invariants
pnpm test:e2e                    # Playwright
```

En développement, `MAIL_DRIVER=console` affiche le code de connexion dans le terminal. Ce mode est refusé en production.

---

## Arborescence

```
AGENTS.md
CLAUDE.md                    # @AGENTS.md
docs/
  cahier-technique.md        # source de vérité
  decisions.md               # une entrée par décision qui modifie le cahier
  JOURNAL.md                 # journal de coordination entre agents
  design/                    # exports Stitch (HTML, PNG) : référence visuelle
drizzle/                     # migrations SQL versionnées (triggers inclus)
src/
  app/
    (app)/votes/…            # pages étudiant
    (app)/proposer/…
    (app)/petitions/…
    (app)/moi/…
    amphi/[slug]/            # projection
    admin/…
    api/
      auth/…
      votes/…
      ballots/route.ts       # phase 2 : AUCUN import d'auth
      petitions/…
      admin/…
      internal/cron/route.ts
  lib/
    auth/                    # otp, session, admin
    crypto/                  # blind.ts (wrapper RFC 9474), hmac.ts, aead.ts, receipt.ts
    db/                      # schema.ts, client.ts
    votes/                   # rules.ts, close.ts, tally.ts
    petitions/
    mail/                    # console | scaleway
    log.ts                   # wrapper qui masque les emails
    ratelimit.ts
    env.ts                   # validation Zod de la configuration
  components/                # primitives UI selon le design system
  copy/fr.ts                 # tous les textes d'interface
tests/
  unit/  invariants/  e2e/
```

---

## Conventions de code

- TypeScript `strict`, aucun `any`. Validation Zod à chaque frontière : body, params et variables d'environnement.
- Les modules serveur commencent par `import "server-only"`.
- Drizzle pour les requêtes. SQL brut seulement pour les triggers, et pour la clôture si une transaction l'exige.
- Les dates sont stockées en UTC et affichées en `Europe/Paris`. Les comparaisons d'échéance utilisent l'heure de la base (`now()`), pas celle du serveur Node.
- Une horloge injectable (`src/lib/clock.ts`) permet d'avancer le temps dans les tests.
- Identifiants de code en anglais. Textes d'interface en français, au tutoiement, tous dans `src/copy/fr.ts`.
- N'ajoute pas de dépendance sans une entrée justificative dans `docs/decisions.md`.
- Les erreurs d'API sont renvoyées en `{ error: "code_machine" }`. Les messages lisibles vivent dans `copy/fr.ts`.

---

## Design

- Les exports Stitch de `docs/design/` donnent la référence visuelle. Les tokens du cahier (§10) font foi.
- Les écarts à appliquer aux maquettes sont listés au cahier §9 : plus de quorum, plus de campus, écrans email et code ajoutés.
- **Interdits** : rayon de plus de 2 px, ombres, dégradés, flous, pastilles ou chips, icône devant une ligne de texte, toute couleur hors du système noir/blanc/gris, toute police autre que Schibsted Grotesk et IBM Plex Mono, illustrations, emoji.
- Accessibilité WCAG 2.2 AA : cibles d'au moins 48 px, focus visible, aucune information portée par la couleur seule.

---

## Tests obligatoires

- Tout code de `src/lib/crypto`, `src/lib/votes`, `src/lib/auth`, ainsi que les routes `token` et `ballots`, est livré avec ses tests dans le même commit.
- Les tests d'invariants (cahier §13) sont bloquants. Ne les désactive jamais, ne les marque jamais `skip`, ne les affaiblis jamais pour faire passer la CI.
- Aucune donnée réelle dans les tests : utilise des adresses du type `test.etudiant@etu.u-bordeaux.fr`.

---

## Coordination entre agents

- **En début de session** : lis les 20 dernières entrées de `docs/JOURNAL.md`.
- **En fin de session**, ajoute une entrée :

  ```
  ## 2026-11-25 14:30 — <agent> — J<n>
  Fait : …
  Reste : …
  Bloquant / question pour Junior : …
  ```

- Une décision qui modifie le cahier donne lieu à une entrée dans `docs/decisions.md` (contexte, décision, conséquence), et le cahier est mis à jour **dans le même commit**.
- Commits petits, avec un message en français à l'impératif : « Ajoute la vérification de signature des bulletins ».
- Ne touche pas aux fichiers d'un jalon qu'un autre agent a marqué « en cours » dans le journal sans l'avoir signalé.

---

## Définition de « terminé »

- `pnpm lint`, `pnpm typecheck`, `pnpm test` verts. `pnpm test:e2e` vert à partir de J3.
- Les onze invariants sont respectés.
- Les écrans touchés sont conformes au §10.
- `docs/JOURNAL.md` est à jour.
