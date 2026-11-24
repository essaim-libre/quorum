# Quorum — Cahier technique V1

Version 1.0 · 24 novembre 2026 · Pilote : Université de Bordeaux

Quorum est une web app de vote étudiant. Les étudiants s'y connectent avec leur adresse `@etu.u-bordeaux.fr` et y votent de façon anonyme, puis vérifiable, sur des questions de campus (blocages, manifestations, examens). Ce document est la source de vérité de la V1. Toute décision qui le modifie est consignée dans `docs/decisions.md`, et le cahier est mis à jour dans le même commit.

---

## 0. Décisions

| Sujet | Choix V1 | Raison |
| --- | --- | --- |
| Format | Web app (PWA) ouverte par QR code, sans store | Zéro installation, utilisable en sortie d'AG |
| Stack | Next.js (App Router) + TypeScript + PostgreSQL + Drizzle ORM + Tailwind | Un seul langage. La librairie de signatures aveugles existe en TS. Les exports Stitch sont en Tailwind |
| Connexion | Code à 6 chiffres envoyé par email, domaine `etu.u-bordeaux.fr` uniquement | Ne dépend pas du CAS de l'université |
| Identité stockée | `HMAC-SHA256(K_ID, email normalisé)` uniquement | Pas d'email en clair. Une fuite de base ne permet pas de retrouver les gens sans la clé |
| Anonymat | Signatures aveugles RSA (RFC 9474, RSABSSA-SHA384-PSS-Randomized), une clé par vote | Le lien entre identité et bulletin n'existe nulle part, y compris pour l'opérateur |
| Lanceurs de votes | L'admin, et les étudiants par pétition | Démarrage rapide, et chacun peut porter une question |
| Validité | Pas de quorum. Chaque vote a une échéance fixée à la publication | Le résultat à l'échéance fait foi, quelle que soit la participation, et la participation est affichée en premier |
| Périmètre | Toute l'université | L'email ne permet pas de connaître le campus ni la composante |
| Revote | Autorisé jusqu'à l'échéance, seul le dernier bulletin compte | Protège contre la pression de groupe |
| Résultats | Invisibles jusqu'à l'échéance | Pas d'effet de meute |
| Vérification | Reçu individuel. Liste publique des reçus (sans les choix) à la clôture | Chacun vérifie que son vote est compté, sans pouvoir prouver son choix à un tiers |
| Langue | Français. L'anglais arrive en V2 | Pilote |
| Hébergement | Scaleway, région fr-par (conteneur, PostgreSQL managé, Transactional Email) | Un seul prestataire, données dans l'UE |

---

## 1. Périmètre de la V1

**Dans la V1**
- Connexion par code email
- Liste des votes (ouverts, à venir, clos), page d'une question, bulletin, confirmation « A voté », résultats
- Revote jusqu'à l'échéance, reçus
- Pétitions : dépôt, signatures, arguments « Contre », relecture, publication
- Création de votes par l'admin
- Mode amphi (projection)
- Journal public des actions d'administration
- Page « Comment ça marche »
- Procès-verbal PDF à la clôture

**Hors V1** (voir §18) : votes par campus ou composante, anglais, notifications push, chiffrement des bulletins jusqu'à la clôture, vérifiabilité universelle du dépouillement, multi-universités.

---

## 2. Règles de vote

### 2.1 Échéances (à la place du quorum)

- Les dates `opens_at` et `closes_at` sont fixées à la publication, affichées dans « Règles du vote », et ne peuvent plus être modifiées ensuite.
- Durée : **24 h minimum**, **72 h par défaut**, **14 jours maximum**.
- L'ouverture peut être immédiate ou programmée. Un vote programmé apparaît dans « Bientôt ».
- Il n'y a pas de quorum. À l'échéance, le résultat est publié quelle que soit la participation.
- Participation affichée = bulletins déposés / `ELECTORATE_SIZE`. Cette valeur vaut 56 000 par défaut, chiffre communiqué par l'université, et doit être mise à jour chaque année.

### 2.2 Options et calcul du résultat

- 2 à 4 options, plus « Vote blanc » ajouté automatiquement en dernière position.
- Choix unique.
- Suffrages exprimés = bulletins hors blancs. Pourcentages calculés sur les exprimés. Les blancs sont affichés à part, en nombre.
- Gagnant : l'option qui a le plus de voix. En cas d'égalité, on affiche « Égalité entre X et Y ».
- Si aucun suffrage n'est exprimé, on affiche « Aucun suffrage exprimé ».

### 2.3 Revote

- Tant que le vote est ouvert, un bulletin déposé avec un jeton déjà utilisé remplace le précédent (`revision + 1`).
- Maximum 20 révisions par jeton.
- Le choix précédent n'est jamais affiché ni stocké sur l'appareil. Le bulletin se rouvre sans présélection.

### 2.4 Annulation

- Seul un admin peut annuler un vote, avant son échéance, avec un motif public écrit dans le journal.
- Les bulletins d'un vote annulé sont supprimés, et aucun résultat n'est publié.

### 2.5 Statut du résultat

Chaque vote affiche un statut : « Consultatif », avec un texte libre sur les engagements pris (par exemple « Le bureau de l'AG s'engage à suivre le résultat »). Le statut est renseigné à la création et immuable ensuite.

---

## 3. Pétitions

### 3.1 Cycle de vie

```
collecting ──(seuil atteint)──▶ in_review ──(approve)──▶ approved ──▶ vote publié
     │                              │
     │(échéance de collecte)        ├──(request_changes)──▶ changes_requested ──(l'auteur accepte)──▶ in_review
     ▼                              │
  expired                           ├──(reject, motif public)──▶ rejected
                                    └──(48 h sans décision)──▶ approved automatiquement
```

### 3.2 Dépôt

- Tout étudiant connecté peut déposer une pétition. Une seule pétition active à la fois, et 3 au maximum par mois.
- Champs :
  - question (≤ 140 caractères)
  - options (2 à 4, ≤ 80 caractères chacune)
  - argument « Pour » (≤ 600 caractères) et signature libre (« Comité de mobilisation Victoire », « Anonyme »…)
  - durée de vote souhaitée (24 h à 14 jours, 72 h par défaut)
  - origine facultative
- Option « C'est une décision d'AG » : date, lieu, nombre de présents, résultat du vote à main levée. Ces informations sont affichées comme origine.
- L'auteur signe automatiquement.

### 3.3 Collecte

- Seuil : `PETITION_THRESHOLD`, 300 signatures par défaut.
- Délai : 7 jours, au-delà la pétition passe en `expired`.
- Une signature par étudiant et par pétition, stockée sous la forme `HMAC(K_SIG, voter_id ‖ petition_id)`. Personne ne voit la liste des signataires, pas même l'auteur.
- **Arguments « Contre »** : pendant la collecte, tout étudiant peut déposer un texte « Contre » (≤ 600 caractères, avec signature libre). Chaque étudiant peut soutenir un seul texte « Contre » par pétition. Au passage en relecture, le texte le plus soutenu est retenu. En cas d'égalité, c'est le plus ancien. Si aucun texte n'a été déposé, la page du vote affiche : « Aucun argument contre n'a été déposé pendant la collecte. »

### 3.4 Relecture

- Délai de relecture : 48 h. Sans décision dans ce délai, la pétition est publiée automatiquement telle quelle. L'admin ne peut pas enterrer une pétition.
- L'admin dispose de trois décisions, toutes écrites dans le journal public :
  - **approve** : fixe `opens_at` (au plus tard 24 h après la décision). `closes_at` = `opens_at` + durée demandée.
  - **request_changes** : uniquement pour non-conformité à la charte de formulation (§3.5), avec la reformulation proposée. L'auteur accepte ou refuse. S'il refuse, l'admin peut rejeter avec le motif « formulation non conforme à la charte ».
  - **reject** : motif choisi dans une liste fermée : hors du champ de l'université, contenu illégal ou injurieux, doublon d'un vote ouvert ou à venir, formulation non conforme à la charte.
- L'admin peut ajouter un bloc « Ce que ça change concrètement » (faits sourcés uniquement). Cet ajout est journalisé.

### 3.5 Charte de formulation

Une question est conforme si :
1. Elle pose une seule question.
2. Elle ne contient ni adjectif de valeur ni sous-entendu (« pour sauver… », « face à la casse… »).
3. Elle nomme une action concrète, son périmètre et ses dates quand il y en a (« Bloquer le campus Peixotto du 30 nov. au 4 déc. ? »).
4. Ses options sont mutuellement exclusives.

L'interface affiche la charte sous le champ « Question », avec un contre-exemple barré et un exemple conforme.

---

## 4. Architecture

```
Téléphone (PWA)                                 Serveur Next.js                         PostgreSQL
 1. email ────────────────────────────────────▶ POST /api/auth/code    ─ HMAC ─────────▶ otp_codes
 2. code  ────────────────────────────────────▶ POST /api/auth/verify  ────────────────▶ voters, sessions
 3. Blind(m) + cookie de session ─────────────▶ POST /api/votes/:id/token ─ BlindSign ─▶ emargement
 4. Finalize → (m, sig) gardés dans IndexedDB
 5. (m, sig, option) SANS cookie ─────────────▶ POST /api/ballots ─ Verify ────────────▶ ballots
 6. à l'échéance : clôture idempotente ───────▶ dépouillement → results, reçus publics, émargement supprimé
```

- Phase 1 (étapes 3–4) : le serveur sait **qui** demande un jeton, mais il ne voit jamais le jeton.
- Phase 2 (étape 5) : le serveur voit un jeton valide et un choix, mais ne sait pas **à qui** il appartient.
- Le jeton est demandé dès l'ouverture de la page d'un vote ouvert, et le bulletin part à la confirmation. Les deux requêtes sont donc séparées dans le temps.

---

## 5. Authentification

### 5.1 Demande de code — `POST /api/auth/code`

1. Normaliser l'email : `trim`, minuscules.
2. Le refuser s'il ne correspond pas à `^[a-z0-9][a-z0-9._-]*@etu\.u-bordeaux\.fr$`. Le `+` est refusé, sinon les sous-adresses permettraient de créer plusieurs identités.
3. Calculer `voter_id = HMAC-SHA256(K_ID, email)`.
4. Limites : 3 demandes par 15 min et 10 par jour pour un même `voter_id`. Côté IP, 300 demandes par 15 min. Cette limite est volontairement haute, parce qu'un amphi entier sort souvent derrière une seule IP (NAT eduroam).
5. Générer un code à 6 chiffres (`crypto.randomInt`). Stocker `code_hash = HMAC(K_OTP, otp_id ‖ code)`, avec expiration à 10 min et compteur d'essais à 0.
6. Envoyer l'email, en texte brut, sans lien ni pixel : « Ton code Quorum : 123456. Il expire dans 10 minutes. Si tu n'as rien demandé, ignore ce message. »
7. Effacer l'email de la mémoire : il ne doit apparaître dans aucun log ni aucune erreur.
8. Réponse identique dans tous les cas de domaine valide : « Si l'adresse est valide, un code vient d'être envoyé. »

### 5.2 Vérification — `POST /api/auth/verify`

1. Normaliser l'email, puis calculer `voter_id`.
2. Chercher le dernier code non consommé et non expiré pour ce `voter_id`. 5 essais au maximum, après quoi le code est invalidé.
3. Comparer à temps constant (`timingSafeEqual`).
4. Créer `voters` si absent. Créer une session : jeton aléatoire de 32 octets dans le cookie, `SHA-256(jeton)` en base, durée 30 jours.
5. Cookie `__Host-quorum_session` : `HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`.
6. Admin : `is_admin = true` si `voter_id` figure parmi les HMAC des adresses de `ADMIN_EMAILS`, calculés au démarrage.

### 5.3 Déconnexion — `POST /api/auth/logout`

Supprime la session et le cookie. Les jetons de vote restent sur l'appareil.

---

## 6. Protocole de vote anonyme

Bibliothèque : `@cloudflare/blindrsa-ts`, variante **RSABSSA-SHA384-PSS-Randomized**, conforme à la RFC 9474. Vérifier l'API exacte dans le README de la version installée. Les noms ci-dessous suivent la RFC : `prepare`, `blind`, `blindSign`, `finalize`, `verify`.

### 6.1 Clé par vote

- Générée à la publication : RSA 2048 bits, exposant 65537.
- Clé publique en SPKI dans `votes.public_key_spki`. Empreinte `SHA-256(SPKI)` affichée sur la page du vote et dans le procès-verbal.
- Clé privée en PKCS8, chiffrée en AES-256-GCM avec `MASTER_KEY`, dans `votes.private_key_enc` (format : nonce de 12 octets ‖ ciphertext ‖ tag).
- Après la clôture, la clé privée est effacée (`private_key_enc = null`).

### 6.2 Phase 1 — obtenir un jeton

Côté client, à l'ouverture de la page d'un vote ouvert, si aucun jeton n'est stocké pour ce vote :

```
msg        = UTF-8("quorum/v1/" + vote_id + "/") ‖ 32 octets aléatoires
input_msg  = prepare(msg)                      // ajoute 32 octets aléatoires en préfixe
{blinded_msg, inv} = blind(pk_vote, input_msg)
POST /api/votes/:id/token   { blindedMsg: base64url }   (avec cookie de session)
```

Côté serveur, dans une transaction :
1. Session valide. Vote publié, avec `opens_at ≤ now() < closes_at` (heure de la base).
2. `voter_tag = HMAC(K_EMARG, voter_id ‖ vote_id)`.
3. Si une ligne `emargement(vote_id, voter_tag)` existe :
   - même `SHA-256(blinded_msg)` : renvoyer le `blind_sig` stocké (nouvel essai idempotent après une coupure réseau) ;
   - sinon : `409 token_already_issued`.
4. Sinon : `blind_sig = blindSign(sk_vote, blinded_msg)`, insérer `(vote_id, voter_tag, blinded_hash, blind_sig)`, renvoyer `{ blindSig }`.

Côté client :

```
sig = finalize(pk_vote, input_msg, blind_sig, inv)
IndexedDB["quorum:token:" + vote_id] = { inputMsg, sig, receipt }
```

Si l'appareil perd son jeton, l'étudiant ne peut plus voter sur ce vote : une seconde émission permettrait de voter deux fois. L'interface l'indique sur la page « Comment ça marche ».

### 6.3 Phase 2 — déposer un bulletin

Côté client, à la confirmation : attendre un délai aléatoire de 0,5 à 3 s, puis

```
fetch("/api/ballots", { method: "POST", credentials: "omit",
  body: { voteId, inputMsg: base64url, sig: base64url, optionId } })
```

Côté serveur, dans une transaction :
1. Ne lire **aucun** cookie ni en-tête d'identification (invariant n° 4).
2. Vote publié, avec `opens_at ≤ now() < closes_at`. Sinon `409 vote_closed`.
3. Vérifier que `input_msg[32:]` commence par `quorum/v1/{voteId}/`. Sinon `400`.
4. `verify(pk_vote, sig, input_msg)`. Sinon `400 invalid_signature`.
5. `optionId` appartient bien au vote. Sinon `400`.
6. `token_hash = SHA-256(input_msg)`.
7. Upsert dans `ballots(vote_id, token_hash)` : en cas d'insertion, `revision = 1` ; en cas de mise à jour, `option_id` remplacé et `revision + 1` (refuser au-delà de 20).
8. Répondre `{ receipt }`.

### 6.4 Reçu

```
receipt_raw = SHA-256("quorum-receipt" ‖ input_msg)
receipt     = Crockford base32 des 45 premiers bits → 9 caractères, format XX-XXXX-XXX
```

Le client stocke le reçu avec le jeton. Il ne stocke jamais le choix.

### 6.5 Clôture

La clôture est idempotente. Elle se déclenche à la première lecture d'un vote dont `closes_at` est passée, et par une tâche planifiée toutes les 5 minutes. Dans une transaction, avec verrou sur la ligne du vote :
1. Si des lignes `results` existent déjà pour ce vote, ne rien faire.
2. Insérer dans `results` le décompte des bulletins par option.
3. `votes.tokens_issued = count(emargement)`.
4. Supprimer l'émargement du vote (`DELETE FROM emargement WHERE vote_id = …`).
5. `votes.private_key_enc = null`.

Hors transaction, exécuter ensuite `VACUUM emargement`.

### 6.6 Publication après clôture

- Résultats (§2.2), participation, `tokens_issued`, nombre de bulletins.
- Liste triée des reçus (sans les choix) et `SHA-256` de cette liste, reportée dans le procès-verbal.
- Contrôle public : nombre de bulletins ≤ `tokens_issued`.

### 6.7 Ce que le protocole garantit, et ce qu'il ne garantit pas

| Garanti | Non garanti en V1 |
| --- | --- |
| Aucune table ne relie une identité à un bulletin | Un opérateur malveillant qui observe le trafic en direct pourrait rapprocher les requêtes dans le temps |
| Une fuite de la base ne révèle aucun choix nominatif | L'admin qui a accès à la base peut lire les bulletins avant l'échéance (pas de chiffrement jusqu'à la clôture) |
| Un jeton par étudiant et par vote | Le dépouillement n'est pas recalculable par un tiers (les choix ne sont pas publiés bulletin par bulletin) |
| Bourrage visible : bulletins ≤ jetons émis | Quelqu'un qui accède à la boîte mail d'un autre peut voter à sa place |

---

## 7. Modèle de données

PostgreSQL 16 ou plus. Le schéma est traduit en Drizzle dans `src/lib/db/schema.ts`. Les triggers et contraintes restent en SQL dans les migrations.

```sql
create extension if not exists pgcrypto;

-- Identités pseudonymes
create table voters (
  id          bytea primary key,                 -- HMAC-SHA256(K_ID, email normalisé)
  created_on  date not null default current_date
);

create table otp_codes (
  id          uuid primary key default gen_random_uuid(),
  voter_id    bytea not null,                    -- même HMAC que voters.id (le voter peut ne pas exister encore)
  code_hash   bytea not null,                    -- HMAC(K_OTP, id ‖ code)
  expires_at  timestamptz not null,
  attempts    smallint not null default 0,
  consumed    boolean not null default false
);
create index on otp_codes (voter_id);

create table sessions (
  token_hash  bytea primary key,                 -- SHA-256 du jeton de session
  voter_id    bytea not null references voters(id) on delete cascade,
  is_admin    boolean not null default false,
  expires_at  timestamptz not null
);

-- Votes
create type vote_origin as enum ('admin', 'petition');
create type vote_state  as enum ('draft', 'published', 'cancelled');

create table votes (
  id                      uuid primary key default gen_random_uuid(),
  slug                    text unique not null,
  question                text not null check (char_length(question) <= 140),
  origin                  vote_origin not null,
  origin_detail           text,                  -- « AG du 26 nov., amphi A, 412 présents »
  petition_id             uuid,
  status_note             text not null,         -- statut du résultat (§2.5)
  argument_pour           text not null check (char_length(argument_pour) <= 600),
  argument_pour_author    text not null,
  argument_contre         text check (char_length(argument_contre) <= 600),
  argument_contre_author  text,
  facts                   text,                  -- « Ce que ça change concrètement »
  state                   vote_state not null default 'draft',
  opens_at                timestamptz,
  closes_at               timestamptz,
  public_key_spki         bytea,
  private_key_enc         bytea,
  key_fingerprint         text,
  tokens_issued           integer,
  cancel_reason           text,
  check (closes_at - opens_at between interval '24 hours' and interval '14 days')
);

create table vote_options (
  id        uuid primary key default gen_random_uuid(),
  vote_id   uuid not null references votes(id) on delete cascade,
  label     text not null check (char_length(label) <= 80),
  position  smallint not null,
  is_blank  boolean not null default false,
  unique (vote_id, position)
);

-- Phase 1 : registre d'émargement, supprimé à la clôture
create table emargement (
  vote_id       uuid not null references votes(id),
  voter_tag     bytea not null,                  -- HMAC(K_EMARG, voter_id ‖ vote_id)
  blinded_hash  bytea not null,                  -- SHA-256(blinded_msg)
  blind_sig     bytea not null,
  primary key (vote_id, voter_tag)
);

-- Phase 2 : urne. Aucune colonne d'identité, aucune colonne de temps, aucune clé séquentielle.
create table ballots (
  vote_id     uuid not null references votes(id),
  token_hash  bytea not null,                    -- SHA-256(input_msg)
  option_id   uuid not null references vote_options(id),
  revision    smallint not null default 1 check (revision between 1 and 20),
  primary key (vote_id, token_hash)
);

create table results (
  vote_id    uuid not null references votes(id),
  option_id  uuid not null references vote_options(id),
  count      integer not null,
  primary key (vote_id, option_id)
);

-- Reçus publics (sans lien avec option_id ni identité, publiés triés après clôture)
create table vote_receipts (
  vote_id    uuid not null references votes(id),
  receipt    text not null,
  primary key (vote_id, receipt)
);

-- Pétitions
create type petition_state as enum
  ('collecting', 'in_review', 'changes_requested', 'approved', 'rejected', 'expired');

create table petitions (
  id                    uuid primary key default gen_random_uuid(),
  slug                  text unique not null,
  author_tag            bytea not null,          -- HMAC(K_SIG, voter_id ‖ 'author')
  question              text not null check (char_length(question) <= 140),
  options               jsonb not null,          -- 2 à 4 libellés
  argument_pour         text not null check (char_length(argument_pour) <= 600),
  argument_pour_author  text not null,
  is_ag_decision        boolean not null default false,
  origin_detail         text,
  requested_duration    interval not null default interval '72 hours'
                        check (requested_duration between interval '24 hours' and interval '14 days'),
  state                 petition_state not null default 'collecting',
  collect_until         timestamptz not null,
  threshold             integer not null,
  signatures_count      integer not null default 0,
  review_deadline       timestamptz,
  proposed_rewording    text,
  decision_reason       text,
  vote_id               uuid references votes(id),
  created_on            date not null default current_date
);

create table petition_signatures (
  petition_id  uuid not null references petitions(id) on delete cascade,
  signer_tag   bytea not null,                   -- HMAC(K_SIG, voter_id ‖ petition_id)
  primary key (petition_id, signer_tag)
);

create table contre_proposals (
  id            uuid primary key default gen_random_uuid(),
  petition_id   uuid not null references petitions(id) on delete cascade,
  text          text not null check (char_length(text) <= 600),
  author_label  text not null,
  author_tag    bytea not null,                  -- HMAC(K_SIG, voter_id ‖ petition_id ‖ 'contre')
  supports      integer not null default 0,
  created_at    timestamptz not null default now()
);

create table contre_supports (
  petition_id    uuid not null references petitions(id) on delete cascade,
  supporter_tag  bytea not null,                 -- un soutien par étudiant et par pétition
  proposal_id    uuid not null references contre_proposals(id) on delete cascade,
  primary key (petition_id, supporter_tag)
);

-- Journal public des actions d'administration
create table admin_journal (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  action       text not null,                    -- vote.publish, vote.cancel, petition.approve…
  target_type  text not null,
  target_id    uuid not null,
  reason       text
);
```

**Triggers à écrire dans la migration :**
- `votes` : si `OLD.state = 'published'`, interdire toute modification de `question`, `origin*`, `status_note`, `argument_*`, `facts`, `opens_at`, `closes_at`, `public_key_spki`, `key_fingerprint`. Seules exceptions : `state → 'cancelled'` (avec `cancel_reason` non nul et `now() < closes_at`), l'écriture unique de `tokens_issued`, et `private_key_enc → null`.
- `vote_options` : interdire insertion, modification et suppression si le vote est publié.
- `ballots` : refuser toute insertion ou modification si `now() ≥ closes_at` ou si le vote n'est pas publié (double sécurité derrière l'API).

**Purges (tâche quotidienne) :**
- `otp_codes` expirés depuis plus de 24 h ;
- sessions expirées ;
- `petition_signatures`, `contre_supports` et `author_tag` 30 jours après la fin de la pétition ;
- `voters` sans session à la fin de l'année universitaire (31 août).

---

## 8. API

Toutes les entrées sont validées par Zod. Les erreurs sont renvoyées en `{ error: "code_machine" }`, avec les messages lisibles dans `src/copy/fr.ts`.

| Méthode | Route | Accès | Rôle |
| --- | --- | --- | --- |
| POST | `/api/auth/code` | public | Envoie un code |
| POST | `/api/auth/verify` | public | Vérifie le code, crée la session |
| POST | `/api/auth/logout` | session | Supprime la session |
| GET | `/api/votes?view=open\|upcoming\|closed` | public | Liste des votes publiés |
| GET | `/api/votes/:slug` | public | Question, règles, arguments, clé publique, empreinte, participation ; résultats si clos |
| GET | `/api/votes/:slug/participation` | public | `{ ballots, rate }`, cache 15 s |
| POST | `/api/votes/:slug/token` | session | Phase 1 (§6.2) |
| POST | `/api/ballots` | **aucun** | Phase 2 (§6.3), sans cookie |
| GET | `/api/votes/:slug/receipts` | public, après clôture | Reçus triés, empreinte de la liste, `tokens_issued` |
| GET | `/api/votes/:slug/pv.pdf` | public, après clôture | Procès-verbal |
| GET | `/api/petitions?view=collecting\|in_review` | public | Liste |
| GET | `/api/petitions/:slug` | public | Détail, nombre de signatures, textes « Contre » |
| POST | `/api/petitions` | session | Dépôt |
| POST | `/api/petitions/:slug/sign` | session | Signer |
| POST | `/api/petitions/:slug/contre` | session | Déposer un texte « Contre » |
| POST | `/api/contre/:id/support` | session | Soutenir un texte « Contre » (remplace le soutien précédent) |
| POST | `/api/petitions/:slug/accept-rewording` | session, auteur | Accepter la reformulation |
| POST | `/api/admin/votes` | admin | Créer un brouillon |
| PATCH | `/api/admin/votes/:id` | admin | Modifier un brouillon |
| POST | `/api/admin/votes/:id/publish` | admin | Génère la clé, fige les dates, journal |
| POST | `/api/admin/votes/:id/cancel` | admin | Annulation motivée, journal |
| POST | `/api/admin/petitions/:id/review` | admin | `approve`, `request_changes` ou `reject`, journal |
| GET | `/api/journal` | public | Journal d'administration |

Aucune route ne renvoie de décompte avant `closes_at`. Il n'existe pas non plus de route admin de résultats partiels.

---

## 9. Pages et écarts avec les maquettes Stitch

| Route | Écran Stitch | Écarts à appliquer |
| --- | --- | --- |
| `/` | 01 Connexion | Le bouton devient « Recevoir un code ». Ajouter deux écrans absents des maquettes : **saisie de l'email** et **saisie du code** (6 cases, renvoi possible après 60 s) |
| `/votes` | 02 Votes | Retirer le filtre « Mon campus / Ma composante » et les mentions de campus. Retirer le repère de quorum : ligne de participation simple + « Ferme dans 1 j 4 h » |
| `/votes/[slug]` | 03 Question | « Règles du vote » : Qui vote (« Étudiants de l'université »), Ouverture, Échéance, Résultat (« Majorité des suffrages exprimés, blancs comptés à part, sans quorum »), Statut. Ajouter l'empreinte de la clé en petit, en mono |
| `/votes/[slug]/bulletin` | 04 Bulletin + 05 Confirmation | Aucun |
| `/votes/[slug]/a-vote` | 06 A voté | Retirer « quorum à … » |
| `/votes/[slug]/resultats` | 07 Résultats | Remplacer « Quorum atteint » par « Échéance : jeudi 3 déc., 18:00 ». Ajouter « Bulletins : 4 018 · Jetons émis : 4 102 » et le lien « Liste des reçus ». Retirer « Par composante » |
| `/proposer` | 08 Proposer | Étapes : Question · Options · Arguments · Durée. Ajouter la case « C'est une décision d'AG » et ses champs |
| `/petitions/[slug]` | 09 Signatures | Seuil 300, délai de collecte, bouton « Signer », section « Arguments contre » (déposer, soutenir) |
| `/petitions` | — | Liste des pétitions en collecte, dans l'onglet Proposer |
| `/moi` | 10 Moi | Retirer Campus et Composante. Ajouter « Mes reçus » (lus depuis IndexedDB) et « Se déconnecter » |
| `/amphi/[slug]` | 11 Mode amphi | Retirer le repère de quorum. Ajouter le compte à rebours jusqu'à l'échéance. Rafraîchissement toutes les 10 s |
| `/comment-ca-marche` | — | À créer : l'analogie du ticket tamponné sans être lu, ce qui est stocké et ce qui ne l'est pas, perte de l'appareil, lien vers le journal |
| `/journal` | — | À créer : tableau date · action · objet · motif |
| `/admin/*` | — | À créer, sans soin graphique particulier : brouillons, publication, annulation, file de relecture |

---

## 10. Design system

Les exports Stitch rangés dans `docs/design/` sont la référence visuelle. Les tokens ci-dessous font foi en cas d'écart.

**Couleurs** (aucune couleur d'accent)

| Token | Clair | Sombre |
| --- | --- | --- |
| `bg` | `#FFFFFF` | `#0A0A0A` |
| `ink` | `#0A0A0A` | `#F2F2F2` |
| `ink-2` (secondaire) | `#5C5C5C` | `#8F8F8F` |
| `rule` (filets) | `#D9D9D9` | `#2A2A2A` |
| `surface` (rare) | `#F2F2F2` | `#161616` |
| `blank` (vote blanc) | `#949494` | `#6B6B6B` |
| `error` (erreurs système seulement) | `#B3261E` | `#F2B8B5` |

État sélectionné : inversion (fond `ink`, texte `bg`). Focus : contour de 2 px couleur `ink`, avec un décalage de 2 px.

**Typographie** (chargée via `next/font/google`, auto-hébergée)
- Schibsted Grotesk 400, 500 et 700 : tout le texte. Chiffres tabulaires partout (`font-variant-numeric: tabular-nums`).
- IBM Plex Mono 400 : heures, reçus, empreintes, compteurs.
- Échelle : 72/72 (chiffres clés), 56/60 (« A voté. »), 40/44 (question en détail), 28/32, 22/28 (question en liste), 17/24 (texte), 14/20 (méta), 12/16 (mono). Interlettrage −2 % au-delà de 28 px.

**Grille et formes**
- Mobile : 4 colonnes, marges de 20 px, gouttières de 16 px, ligne de base de 4 px. Largeur de lecture maximale de 720 px sur ordinateur.
- Rayon 0 partout, 2 px au maximum sur les boutons et les champs.
- Aucune ombre, aucun dégradé, aucun flou.
- Pas de cartes : le contenu est posé sur la page, séparé par des filets de 1 px. Chaque section s'ouvre par un filet noir de 1 px.

**Composants**
- Bouton principal : 52 px de haut, fond `ink`, libellé aligné à gauche, sans icône.
- Action secondaire : lien souligné.
- Statut : carré de 8 px (plein = Ouvert, contour = Bientôt, absent = Clos) suivi du mot. Jamais de pastille.
- Participation : trait de 2 px sur piste `rule`, chiffres alignés à droite.
- Barres de résultat : 24 px de haut, extrémités carrées, toutes en `ink`, le blanc en `blank`.
- Navigation basse : texte seul (« Votes », « Proposer », « Moi »). L'actif est en gras, avec un filet de 2 px au-dessus.
- Icônes : uniquement fonctionnelles (retour, fermer, valider, copier), trait de 1,5 px, jamais devant une ligne de texte.

**Ton** : tutoiement, vocabulaire neutre (« blocage », jamais « prise d'otage »), chiffres toujours accompagnés de leur base (« 4 018 votants sur 56 000 inscrits »).

**Accessibilité** : WCAG 2.2 AA. Cibles d'au moins 48 px. Aucune information portée par la couleur seule. Barres lisibles au lecteur d'écran (« Contre, 57 %, 2 104 voix »). Zoom à 200 % sans perte.

---

## 11. Sécurité et confidentialité

**Invariants** (répétés dans `AGENTS.md`, testés au §13)
1. Aucun email en clair en base, dans les logs ou dans les erreurs.
2. Aucune IP stockée ni journalisée.
3. `ballots` ne contient ni identité, ni temps, ni clé séquentielle.
4. `POST /api/ballots` ne lit ni cookie ni session. Garde-fou ESLint : `no-restricted-imports` interdit `@/lib/auth/*` et `next/headers` dans `src/app/api/ballots/**`.
5. Aucun décompte avant `closes_at`.
6. Un vote publié est immuable (triggers §7).
7. Secrets uniquement en variables d'environnement. Clés privées de vote chiffrées.
8. Aucun script, police ou ressource tiers. Aucun pixel dans les emails.
9. Toute action d'admin est journalisée publiquement.
10. Le choix n'est jamais stocké sur l'appareil.

**Journalisation applicative**
- Passer par un wrapper `log()` qui masque toute chaîne ressemblant à un email (`/[^\s@]+@[^\s@]+/`) et n'accepte que des objets typés.
- Pas de corps de requête dans les logs.

**Rate limiting**
- En mémoire (`lru-cache`, instance unique en V1). Clé IP = `HMAC(sel du jour, ip)`, durée de vie ≤ 15 min, jamais persistée.
- `/api/auth/code` : voir §5.1.
- `/api/votes/:slug/token` : 10 par minute et par session.
- `/api/ballots` : 600 par minute et par IP (amphi derrière NAT).

**En-têtes HTTP**
- `Content-Security-Policy: default-src 'self'; img-src 'self' data:; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'`. Retirer `'unsafe-inline'` si la configuration Next le permet avec des nonces.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains`
- `Referrer-Policy: no-referrer`
- `X-Content-Type-Options: nosniff`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## 12. Configuration

`.env.example` (jamais de valeur réelle dans le dépôt) :

```
APP_URL=http://localhost:3000
DATABASE_URL=postgres://quorum:quorum@localhost:5432/quorum

# Clés HMAC : 32 octets aléatoires en base64, toutes différentes
K_ID=
K_EMARG=
K_SIG=
K_OTP=
# AES-256-GCM, 32 octets en base64 : chiffre les clés privées des votes
MASTER_KEY=

ALLOWED_EMAIL_DOMAIN=etu.u-bordeaux.fr
ADMIN_EMAILS=                       # liste séparée par des virgules
ELECTORATE_SIZE=56000               # chiffre communiqué par l'université, à mettre à jour chaque année
PETITION_THRESHOLD=300
PETITION_COLLECT_DAYS=7

MAIL_DRIVER=console                 # console (dev) | scaleway (prod)
MAIL_FROM=Quorum <code@exemple.fr>
SCW_SECRET_KEY=
SCW_PROJECT_ID=
SCW_REGION=fr-par

CRON_SECRET=                        # secret partagé pour /api/internal/cron (32 car. min. en prod)
```

Au démarrage, valider la configuration avec Zod : refuser le démarrage si une clé manque ou fait moins de 32 octets, et refuser `MAIL_DRIVER=console` quand `NODE_ENV=production`.

**Rotation** : changer `K_ID` rend tous les comptes nouveaux, ce qui n'est acceptable qu'entre deux années universitaires. Changer `MASTER_KEY` impose de rechiffrer les clés des votes ouverts.

---

## 13. Tests

**Unitaires (Vitest)**
- Vecteurs de test de la RFC 9474 (annexe A.1) passés à travers le wrapper `src/lib/crypto/blind.ts`.
- Flux complet de jeton : `prepare` → `blind` → `blindSign` → `finalize` → `verify`.
- Un jeton du vote A est refusé sur le vote B.
- Une signature altérée est refusée.
- Une seconde demande de jeton avec un `blinded_msg` différent renvoie `409`. La même demande rejouée renvoie la même signature.
- Revote : le choix est remplacé, `revision` s'incrémente, 21ᵉ révision refusée.
- Bulletin après échéance : refusé par l'API et par le trigger.
- Dépouillement : pourcentages sur les exprimés, blancs à part, égalité, aucun exprimé.
- Format du reçu.
- Normalisation de l'email : `+` refusé, mauvais domaine refusé, casse ignorée.
- OTP : expiration, 5 essais, comparaison à temps constant.
- Pétitions : seuil, expiration, soutien « Contre » unique et remplaçable, publication automatique après 48 h.

**Tests d'invariants** (bloquants en CI)
- Les colonnes de `ballots` sont exactement `{vote_id, token_hash, option_id, revision}`.
- `POST /api/ballots` appelé avec un cookie de session valide se comporte exactement comme sans cookie.
- La règle ESLint de l'invariant 4 est active.
- `GET /api/votes/:slug` d'un vote ouvert ne contient aucun champ de décompte.
- Modifier un vote publié échoue (trigger).
- Après la clôture : `emargement` vide pour ce vote, `private_key_enc` nul.
- Aucune entrée de log produite pendant la suite de tests ne contient de `@`.

**De bout en bout (Playwright)**
- Connexion (code lu via `MAIL_DRIVER=console` capturé), vote, revote, « A voté », reçu visible dans « Moi ».
- Avance de l'horloge (horloge injectable côté serveur en test), puis résultats et liste des reçus.
- Pétition : dépôt, 300 signatures simulées, relecture, publication.
- Mode amphi : le compteur monte, aucun résultat avant l'échéance.

---

## 14. Hébergement et déploiement

- **Application** : Next.js en mode `output: "standalone"`, image Docker, Scaleway Serverless Containers (fr-par). Garder au moins une instance active (`min-scale = 1`) pour éviter le démarrage à froid en sortie d'AG, et une seule instance au maximum en V1 (le rate limiting est en mémoire).
- **Base** : Scaleway Managed Database for PostgreSQL, sauvegardes quotidiennes chiffrées, accès réseau privé.
- **Email** : Scaleway Transactional Email, sur un domaine dédié avec SPF, DKIM et DMARC (`p=quarantine`).
- **Tâches planifiées** : clôture des votes toutes les 5 min, publication automatique des pétitions non relues, purges quotidiennes. Toutes passent par une route interne protégée par un secret (`/api/internal/cron`), appelée par un cron Scaleway.
- **Développement local** : `docker compose` (PostgreSQL), `pnpm dev`, `MAIL_DRIVER=console`.
- **CI** : lint, typecheck, tests unitaires et d'invariants, puis Playwright sur base éphémère.

---

## 15. RGPD

| Donnée | Nature | Conservation |
| --- | --- | --- |
| Email | Transitoire en mémoire. Transmis au prestataire d'email pour l'envoi du code | Selon la politique du prestataire (à minimiser) |
| `voters.id` | Pseudonyme | Jusqu'au 31 août de l'année universitaire |
| Sessions | Pseudonyme | 30 jours |
| Émargement | Pseudonyme (participation à un vote) | Supprimé à la clôture |
| Bulletins | Anonymes, sans lien avec une identité | Conservés pour le procès-verbal |
| Signatures, soutiens, auteur de pétition | Pseudonymes | 30 jours après la fin de la pétition |
| Textes « Pour » et « Contre » | Publiés avec une signature libre choisie par l'auteur | Durée de vie du vote |

- Une page « Données personnelles » indique le responsable de traitement, les finalités, les durées et les droits, avec un contact.
- Les questions portent sur des sujets qui peuvent révéler des opinions politiques. C'est pourquoi aucune donnée ne relie une identité à un choix (§6).
- Avant le lancement public, lire la recommandation CNIL de 2026 sur le vote par correspondance électronique (délibération n° 2026-045) et documenter le niveau de risque retenu dans `docs/decisions.md`.

---

## 16. Jalons

Chaque jalon est terminé quand lint, typecheck et tests sont verts et que `docs/JOURNAL.md` est à jour.

- [x] **J0 — Socle** : dépôt, Next.js, Tailwind, tokens du §10, polices, Drizzle, migrations §7 avec triggers, `docker compose`, validation de la configuration, CI.
- [x] **J1 — Connexion** : §5 complet, écrans email et code, sessions, rate limiting, `MAIL_DRIVER=console`.
- [x] **J2 — Votes en lecture et administration** : création, brouillon, publication avec génération de clé, annulation, journal public. Pages Votes et Question.
- [x] **J3 — Vote anonyme** : §6.1 à §6.4, wrapper crypto avec vecteurs RFC, IndexedDB, Bulletin, Confirmation, A voté, Mes reçus. Tests d'invariants.
- [x] **J4 — Clôture et résultats** : §6.5 et §6.6, page Résultats, liste des reçus, procès-verbal PDF, cron.
- [x] **J5 — Pétitions** : §3 complet, Proposer, Signatures, « Contre », relecture, publication automatique.
- [ ] **J6 — Mode amphi, « Comment ça marche », journal, page données personnelles.**
- [ ] **J7 — Durcissement** : en-têtes, CSP, revue des logs, Playwright complet, test de charge (500 jetons et 500 bulletins en 2 minutes), déploiement Scaleway.

---

## 17. Points ouverts

- [ ] Un étudiant a-t-il plusieurs alias sur `etu.u-bordeaux.fr` (par exemple `prenom.nom` et un identifiant court) ? Si oui, n'accepter qu'un seul format.
- [ ] Les boîtes `etu` acceptent-elles nos emails sans les classer en indésirables ? À tester avec plusieurs adresses avant J7.
- [ ] Une boîte `etu` reste-t-elle active après le départ de l'étudiant ? Si oui, des non-inscrits peuvent voter.
- [ ] Les journaux de Scaleway (Serverless Containers, Cockpit) enregistrent-ils les IP ? Si oui, les désactiver ou réduire leur rétention au minimum.
- [ ] Quelle structure porte le projet et sera responsable de traitement (une association loi 1901 par exemple), et sous quel nom de domaine ?

---

## 18. Hors V1

- **Votes par campus ou composante** : nécessitent les attributs d'inscription, via le CAS de l'université.
- **Interface en anglais.**
- **Chiffrement des bulletins jusqu'à l'échéance**, pour que même l'admin ne puisse pas lire de résultats partiels.
- **Dépouillement vérifiable par tous** sans permettre de prouver son vote. Référence à étudier : Belenios (Inria).
- **Notifications push** à l'ouverture et à la clôture des votes.
- **Plusieurs universités**, avec un domaine email et un électorat par établissement.
