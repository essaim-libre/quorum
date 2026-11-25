<div align="center">

<img src="docs/assets/hero-banner.jpg" alt="Quorum — Le vote étudiant, mathématiquement anonyme" width="100%" />

<br />
<br />

<p>
  <strong>Plateforme web mobile-first de vote étudiant anonyme, vérifiable et auditable.</strong><br />
  <sub>Projet indépendant conçu par des étudiants pour la communauté étudiante de Bordeaux · Protocole RFC 9474 (Blind RSA)</sub>
</p>

<p>
  <a href="https://github.com/essaim-libre/quorum/actions/workflows/ci.yml">
    <img src="https://img.shields.io/github/actions/workflow/status/essaim-libre/quorum/ci.yml?branch=main&style=for-the-badge&logo=githubactions&logoColor=white&label=CI&color=10B981" alt="Statut CI" />
  </a>
  <img src="https://img.shields.io/badge/Next.js-16-050507?style=for-the-badge&logo=nextdotjs&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/TypeScript-Strict-3178C6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript Strict" />
  <img src="https://img.shields.io/badge/PostgreSQL-16-4169E1?style=for-the-badge&logo=postgresql&logoColor=white" alt="PostgreSQL 16" />
  <img src="https://img.shields.io/badge/Crypto-RFC%209474%20Blind%20RSA-6366F1?style=for-the-badge&logo=letsencrypt&logoColor=white" alt="RFC 9474 Blind RSA" />
  <img src="https://img.shields.io/badge/Sécurité-Durcie%20%26%20Vérifiée-10B981?style=for-the-badge&logo=shield&logoColor=white" alt="Sécurité durcie et vérifiée" />
</p>

<p>
  <a href="#-aperçu-visuel--démo"><strong>🎬 Démo &amp; Captures</strong></a>
  &nbsp;·&nbsp;
  <a href="#-pourquoi-quorum-"><strong>⚡ Fonctionnalités</strong></a>
  &nbsp;·&nbsp;
  <a href="#-protocole-de-vote-anonyme-rfc-9474"><strong>🔐 Protocole RFC 9474</strong></a>
  &nbsp;·&nbsp;
  <a href="#️-sécurité--11-invariants"><strong>🛡️ Sécurité</strong></a>
  &nbsp;·&nbsp;
  <a href="#-démarrage-rapide"><strong>🚀 Démarrage rapide</strong></a>
  &nbsp;·&nbsp;
  <a href="#-documentation"><strong>📚 Docs</strong></a>
</p>

</div>

---

## 🎬 Aperçu visuel & démo

<!--
  🎥 POUR JOUER LA VIDÉO DE LANCEMENT DIRECTEMENT DANS CE README (SANS ALOURDIR GIT) :
  1. Ouvrez ce README en édition sur GitHub (ou un commentaire d'issue sur le dépôt).
  2. Glissez-déposez votre fichier local `video/out/quorum-launch-1080p60.mp4`.
  3. GitHub génère automatiquement une URL `https://github.com/user-attachments/assets/...`.
  4. Collez cette URL sur une ligne seule juste en dessous de ce commentaire : GitHub affichera un lecteur vidéo MP4 natif.
-->

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/preview-identity.jpg" alt="Connexion par QR code et code OTP 6 chiffres" width="100%" />
      <br />
      <strong>🔐 01 · Vérifié, jamais stocké</strong><br />
      <sub>Scan QR en amphi, adresse <code>@etu.u-bordeaux.fr</code> et code OTP à 6 chiffres. L’e-mail est immédiatement réduit en empreinte HMAC et n’est jamais stocké en clair.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/preview-blind.jpg" alt="Signature aveugle RFC 9474 sans lien d'identité" width="100%" />
      <br />
      <strong>✉️ 02 · Tamponné à l’aveugle (RFC 9474)</strong><br />
      <sub>Le téléphone masque le jeton dans une enveloppe cryptographique opaque. Le serveur émarge et signe à l’aveugle sans jamais pouvoir relier le bulletin à l’étudiant.</sub>
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="docs/assets/preview-vote.jpg" alt="Vote mobile et reçu vérifiable 7K-M4P2-9X1" width="100%" />
      <br />
      <strong>🗳️ 03 · Vérifiable, jamais monnayable</strong><br />
      <sub>Bulletin envoyé sans cookie (<code>credentials: "omit"</code>). Revote libre jusqu’à l’échéance et reçu public <code>7K-M4P2-9X1</code> sans jamais enregistrer le choix sur l’appareil.</sub>
    </td>
    <td width="50%" valign="top">
      <img src="docs/assets/preview-amphi.jpg" alt="Mode amphi en direct et résultats vérifiables" width="100%" />
      <br />
      <strong>🏛️ 04 · Mode amphi &amp; PV vérifiable</strong><br />
      <sub>Projection temps réel en amphithéâtre sans aucun résultat partiel avant clôture. À l’échéance : dépouillement public, contrôle <code>bulletins ≤ jetons</code> et procès-verbal PDF.</sub>
    </td>
  </tr>
</table>

---

## ⚡ Pourquoi Quorum ?

<table>
  <tr>
    <td width="50%" valign="top">
      <h3>🕶️ Anonymat mathématique</h3>
      Signature aveugle <strong>RSABSSA-SHA384-PSS-Randomized</strong> (<code>@cloudflare/blindrsa-ts</code>) avec une paire RSA 2048 dédiée par scrutin, chiffrée en AES-256-GCM puis <strong>effacée définitivement à la clôture</strong>.
    </td>
    <td width="50%" valign="top">
      <h3>🧾 Preuve sans coercition</h3>
      Chaque votant reçoit un code Crockford Base32 (<code>XX-XXXX-XXX</code>) vérifiable dans la liste publique post-clôture. Le reçu prouve le dépôt, <strong>jamais l’option choisie</strong> ; le revote reste libre jusqu’à la fin.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <h3>📢 Pétitions &amp; débat équilibré</h3>
      Tout étudiant peut proposer un scrutin (4 étapes + charte). À <strong>300 signatures</strong>, la proposition passe en relecture transparente avec publication automatique au bout de 48 h et sélection du contre-argument le plus soutenu.
    </td>
    <td width="50%" valign="top">
      <h3>📖 Transparence radicale</h3>
      Scrutins publiés <strong>immuables</strong> (triggers PostgreSQL), zéro résultat avant <code>closes_at</code>, journal d’administration intégralement public (<code>/journal</code>) et zéro ressource tierce (pas d’analytics, pas de CDN).
    </td>
  </tr>
</table>

---

## 🔐 Protocole de vote anonyme (RFC 9474)

> [!IMPORTANT]
> La table `ballots` ne contient strictement que **4 colonnes** (`vote_id`, `token_hash`, `option_id`, `revision`) — aucune identité, aucune date, aucune IP, aucun identifiant séquentiel. La route `POST /api/ballots` est isolée par ESLint : zéro import d’authentification, zéro lecture de cookie.

```mermaid
flowchart LR
  subgraph Client["📱 Appareil étudiant (IndexedDB · zéro choix stocké)"]
    A["1. Jeton aléatoire m"] --> B["2. Masquage Blind(m)"]
    D["4. Démasquage Finalize -> sig"] --> E["5. Dépôt sans cookie\ncredentials: omit"]
  end

  subgraph Phase1["🪪 Phase 1 · Émargement (avec session)"]
    C["3. POST /api/votes/:slug/token\n• Vérifie session\n• Émarge 1 fois\n• BlindSign(sk) à l'aveugle"]
  end

  subgraph Phase2["🗳️ Phase 2 · Urne anonyme (0 cookie · 0 auth)"]
    F["6. POST /api/ballots\n• Vérifie signature RSA-PSS\n• Écrit ballots (4 colonnes)\n• Publie le reçu XX-XXXX-XXX"]
  end

  B -->|"Enveloppe opaque"| C
  C -->|"Signature aveugle"| D
  E -.->|"Aucun lien réseau ni compte"| F

  style Client fill:#0B0C10,stroke:#6366F1,color:#F5F5F7
  style Phase1 fill:#12131A,stroke:#818CF8,color:#F5F5F7
  style Phase2 fill:#0B1612,stroke:#10B981,color:#F5F5F7
```

À l’échéance (`closes_at`), la clôture transactionnelle calcule le dépouillement, vérifie `bulletins ≤ jetons émis`, **supprime `emargement`**, **efface la clé privée RSA du scrutin**, génère le procès-verbal PDF 1.4 autonome et publie la liste triée des reçus + leur empreinte `SHA-256`.

---

## 🛡️ Sécurité & 11 invariants

Quorum est gouverné par **11 invariants non négociables**, verrouillés par des **tests bloquants en CI** (`tests/invariants/`), des **triggers PostgreSQL** et des **règles ESLint**.

> [!TIP]
> Chaque frontière applicative est durcie et couverte par des tests automatisés : rate limiting multi-couches avec `TRUSTED_PROXY_HOPS`, plafonds stricts de taille JSON (`413`), défense CSRF (`Origin` / `Sec-Fetch-Site`), contrôle d’intégrité bloquant à la clôture et verrous transactionnels PostgreSQL ([détails dans SECURITY.md](SECURITY.md)).

| Métrique de vérification | État | Détail |
|---|---|---|
| 🧪 **Tests unitaires & invariants** | ✅ **76 / 76** | 19 suites Vitest dont vecteurs officiels RFC 9474 annexe A.1 & triggers DB |
| 🌐 **Tests E2E Playwright** | ✅ **5 / 5** | Connexion, vote/revote, clôture/PV PDF, pétitions 300 signatures, amphi, CSP nonce |
| ⚡ **Test de charge local** | ✅ **30,41 s** | 500 jetons aveugles + 500 bulletins anonymes (budget max : 120 s), `0` fuite d’e-mail |
| 🔒 **En-têtes & CSP** | ✅ **Strict** | Nonce cryptographique par requête (`src/proxy.ts`), 0 `'unsafe-inline'`, 0 tiers |

<details>
<summary><strong>📜 Voir les 11 invariants de confidentialité</strong></summary>

1. **Jamais d’e-mail en clair** en base, dans les logs ou les erreurs (`HMAC-SHA256(K_ID, email)` uniquement).
2. **Jamais d’IP stockée ni journalisée** (rate limiting en mémoire avec sel quotidien renouvelé, TTL ≤ 15 min, `TRUSTED_PROXY_HOPS`).
3. **Table `ballots` à 4 colonnes exactes** : `vote_id`, `token_hash`, `option_id`, `revision`.
4. **Isolation stricte de `POST /api/ballots`** : aucun cookie, aucune session, aucun import `@/lib/auth/*` ou `next/headers` (interdit par ESLint).
5. **Zéro décompte avant `closes_at`** : aucune route, page ou requête admin.
6. **Immutabilité des scrutins publiés** garantie par triggers PostgreSQL (seule l’annulation motivée est permise).
7. **Secrets exclusivement en variables d’environnement** ; clé privée RSA par vote chiffrée AES-256-GCM (`MASTER_KEY` 32 octets exacts) et effacée à la clôture.
8. **Aucune ressource tierce** dans l’application : polices auto-hébergées via `next/font`, QR Code et PDF générés sans dépendance externe.
9. **Journal d’administration public** (`admin_journal`) pour chaque action d’administration.
10. **Aucun choix stocké sur l’appareil** du votant (uniquement jeton, signature et reçu en IndexedDB).
11. **Primitifs cryptographiques standards uniquement** : `@cloudflare/blindrsa-ts` (RFC 9474), `node:crypto` et WebCrypto.

</details>

---

## 🧰 Stack technique

| Couche | Technologies |
|---|---|
| **Framework & UI** | ![Next.js](https://img.shields.io/badge/Next.js%2016-050507?style=flat-square&logo=nextdotjs&logoColor=white) ![React](https://img.shields.io/badge/React%2019-149ECA?style=flat-square&logo=react&logoColor=white) ![Tailwind](https://img.shields.io/badge/Tailwind%20CSS%20v4-06B6D4?style=flat-square&logo=tailwindcss&logoColor=white) |
| **Langage & Validation** | ![TypeScript](https://img.shields.io/badge/TypeScript%20Strict-3178C6?style=flat-square&logo=typescript&logoColor=white) ![Zod](https://img.shields.io/badge/Zod%20v4-3E67B1?style=flat-square&logo=zod&logoColor=white) |
| **Base de données** | ![PostgreSQL](https://img.shields.io/badge/PostgreSQL%2016-4169E1?style=flat-square&logo=postgresql&logoColor=white) ![Drizzle](https://img.shields.io/badge/Drizzle%20ORM-C5F74F?style=flat-square&logo=drizzle&logoColor=black) + triggers SQL natifs |
| **Cryptographie** | `@cloudflare/blindrsa-ts` (RFC 9474) · `node:crypto` (`worker_threads`) · WebCrypto · AES-256-GCM |
| **Qualité & CI** | ![Vitest](https://img.shields.io/badge/Vitest-6E9F18?style=flat-square&logo=vitest&logoColor=white) ![Playwright](https://img.shields.io/badge/Playwright-2EAD33?style=flat-square&logo=playwright&logoColor=white) ![Docker](https://img.shields.io/badge/Docker%20Node%2024-2496ED?style=flat-square&logo=docker&logoColor=white) |

---

## 🚀 Démarrage rapide

### Prérequis
- **Node.js ≥ 24** et **pnpm 10**
- **Docker** (PostgreSQL 16 local)

### Installation & lancement

```bash
# 1. Installer les dépendances
pnpm install

# 2. Configurer l'environnement local (générer 5 clés distinctes de 32 octets en base64)
cp .env.example .env

# 3. Démarrer PostgreSQL 16 et appliquer les migrations + triggers
docker compose up -d db
pnpm db:migrate

# 4. Lancer le serveur de développement -> http://localhost:3000
pnpm dev
```

> [!NOTE]
> En développement, `MAIL_DRIVER=console` affiche le code OTP dans le terminal (et en aide locale dans l’interface) sans jamais journaliser d’adresse e-mail. Ce mode est strictement refusé en production et hors `localhost`.

<details>
<summary><strong>🛠️ Voir toutes les commandes utiles</strong></summary>

| Commande | Action |
|---|---|
| `pnpm dev` | Serveur de développement (`http://localhost:3000`) |
| `pnpm lint` | ESLint 9 + garde-fou d’isolation `POST /api/ballots` |
| `pnpm typecheck` | Vérification TypeScript `strict` (`tsc --noEmit`) |
| `pnpm test` | Suites unitaires et invariants bloquants (Vitest) |
| `pnpm test:e2e` | Parcours complets navigateur (Playwright Chromium) |
| `pnpm test:load` | Test de charge : 500 jetons aveugles + 500 bulletins anonymes |
| `pnpm build` | Build de production standalone Next.js |
| `pnpm db:generate` | Génère les migrations Drizzle depuis `src/lib/db/schema.ts` |
| `pnpm db:migrate` | Applique les migrations SQL et triggers sur PostgreSQL |

</details>

---

## 📚 Documentation

| Document | Contenu |
|---|---|
| 📘 [docs/cahier-technique.md](docs/cahier-technique.md) | Source de vérité : produit, protocole cryptographique, schéma SQL, design system, RGPD |
| 🛡️ [SECURITY.md](SECURITY.md) | Modèle de menace, garanties V1 vs limites, invariants et signalement de vulnérabilité |
| ☁️ [docs/deploiement-scaleway.md](docs/deploiement-scaleway.md) | Guide de mise en production conteneurisée (Scaleway, HTTPS, cron, logs) |
| 🧭 [docs/decisions.md](docs/decisions.md) | Journal des décisions techniques et d’architecture |
| 📝 [docs/JOURNAL.md](docs/JOURNAL.md) | Historique complet d’avancement jalon par jalon (J0 → J7) |

---

<div align="center">
  <sub>Projet indépendant conçu par des étudiants, non affilié à l’Université de Bordeaux · <strong>Quorum</strong></sub>
</div>
