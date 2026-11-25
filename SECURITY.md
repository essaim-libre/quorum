# Politique de sécurité — Quorum

## Modèle de sécurité et garanties V1

Quorum est conçu pour protéger l’anonymat du vote même en cas de fuite de la base de données :

| Garanti en V1 | Hors périmètre / limites connues en V1 |
| --- | --- |
| Aucune table ne relie une identité (`voters.id` / `emargement`) à un bulletin (`ballots`). | Un opérateur malveillant observant le trafic réseau en temps réel pourrait corréler des requêtes proches dans le temps. |
| Une fuite de la base ne révèle ni email en clair, ni IP, ni choix nominatif. | Un administrateur ayant un accès direct à la base peut lire les bulletins agrégés avant l’échéance (chiffrement des bulletins prévu hors V1). |
| Un seul jeton anonyme par étudiant et par scrutin (`emargement` purgé à la clôture). | Le dépouillement n’est pas recalculable bulletin par bulletin par un tiers. |
| Contrôle bloquant à la clôture (`bulletins ≤ jetons émis`), alerte publique `vote.integrity_alert` en cas d’anomalie. | Quiconque accède à la boîte mail universitaire d’un étudiant peut voter à sa place. |

### Les 11 invariants non négociables
1. Jamais d’email en clair en base, dans les logs ou dans les erreurs (`HMAC-SHA256(K_ID, email)` uniquement).
2. Jamais d’IP stockée ni journalisée (sel quotidien éphémère en mémoire ≤ 15 min, `TRUSTED_PROXY_HOPS`).
3. La table `ballots` ne contient que `(vote_id, token_hash, option_id, revision)` — aucune date, heure, identité ou clé séquentielle.
4. `POST /api/ballots` ne lit ni cookie, ni session, ni en-tête d’identification (règle ESLint bloquante + `credentials: "omit"`).
5. Aucun décompte partiel avant `closes_at`.
6. Un scrutin publié est immuable (triggers PostgreSQL `trg_votes_immutability` et `trg_vote_options_immutability`).
7. Secrets uniquement en variables d’environnement ; clé privée de chaque scrutin chiffrée en AES-256-GCM (`MASTER_KEY`) puis effacée à la clôture.
8. Aucune ressource tierce (polices auto-hébergées, QR code généré localement, CSP stricte par nonce cryptographique).
9. Toute action d’administration est inscrite dans `admin_journal`, qui est public (`/journal`).
10. Le choix d’un votant n’est jamais stocké sur son appareil (uniquement le jeton, la signature et le reçu).
11. Primitives cryptographiques standardisées uniquement (`@cloudflare/blindrsa-ts` RFC 9474, `node:crypto`, WebCrypto).

---

## Vérifications automatisées et durcissement

Les invariants de confidentialité, l’isolation de `POST /api/ballots`, la conformité des en-têtes HTTP/CSP par nonce, les plafonds de requêtes (`413`, rate limiting multi-couches) et l’intégrité de clôture sont vérifiés en continu par la CI :
- [`tests/invariants/anonymous-voting.test.ts`](tests/invariants/anonymous-voting.test.ts)
- [`tests/invariants/close-and-results.test.ts`](tests/invariants/close-and-results.test.ts)
- [`tests/invariants/logs-and-security.test.ts`](tests/invariants/logs-and-security.test.ts)
- [`tests/invariants/security-audit-fixes.test.ts`](tests/invariants/security-audit-fixes.test.ts)

---

## Signaler une vulnérabilité

Merci de **ne pas ouvrir d’issue publique** pour une faille exploitable.  
Contacte directement l’équipe mainteneuse via un signalement privé (GitHub Security Advisory sur `essaim-libre/quorum` ou contact administratif dédié) en précisant :
- la version ou le commit concerné,
- les étapes de reproduction,
- l’impact estimé sur l’anonymat, l’intégrité ou la disponibilité.
