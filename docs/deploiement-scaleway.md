# Déploiement Scaleway (fr-par) — Quorum V1

Ce guide applique la section §14 du cahier technique (`docs/cahier-technique.md`) sur un seul prestataire européen (Scaleway, région `fr-par`).

---

## 1. Prérequis et secrets (§12)

Générer **5 clés distinctes de 32 octets** en base64 ainsi qu’un `CRON_SECRET` d’au moins 32 caractères :

```bash
for name in K_ID K_EMARG K_SIG K_OTP MASTER_KEY; do
  echo "$name=$(openssl rand -base64 32)"
done
echo "CRON_SECRET=$(openssl rand -hex 32)"
```

Vérifications obligatoires avant déploiement :
- `NODE_ENV=production`
- `MAIL_DRIVER=scaleway` (`console` est refusé au démarrage en production)
- `APP_URL=https://<domaine-officiel>`
- `ELECTORATE_SIZE=56000` (à actualiser à chaque rentrée universitaire)
- `ADMIN_EMAILS=<liste-virgules@etu.u-bordeaux.fr>`

---

## 2. Base PostgreSQL managée

1. Créer une instance **Scaleway Managed Database for PostgreSQL 16** dans `fr-par` sur un **Private Network**.
2. Activer les **sauvegardes quotidiennes chiffrées**.
3. Appliquer les migrations versionnées (incluant `pgcrypto` et les 3 triggers §7) depuis une machine reliée au réseau privé :

```bash
DATABASE_URL="postgres://..." pnpm db:migrate
```

---

## 3. Email transactionnel (Scaleway TEM)

1. Configurer un domaine dédié dans **Scaleway Transactional Email (`fr-par`)**.
2. Publier les enregistrements DNS **SPF**, **DKIM** et **DMARC (`p=quarantine`)**.
3. Tester la délivrabilité sur plusieurs boîtes `@etu.u-bordeaux.fr` avant ouverture (§17).
4. Renseigner `MAIL_FROM`, `SCW_SECRET_KEY`, `SCW_PROJECT_ID` et `SCW_REGION=fr-par`.

---

## 4. Construction et déploiement du conteneur

Construire et pousser l’image vers Scaleway Container Registry :

```bash
docker build -t rg.fr-par.scw.cloud/<namespace>/quorum:v1 .
docker push rg.fr-par.scw.cloud/<namespace>/quorum:v1
```

Paramètres **Scaleway Serverless Containers (`fr-par`)** :
- **Port** : `3000`
- **Scaling** : `min-scale = 1` (évite le démarrage à froid en sortie d’AG) et **`max-scale = 1`** (le rate limiting `lru-cache` est en mémoire en V1)
- **Réseau** : rattaché au même Private Network que PostgreSQL
- **Healthcheck** : `GET /api/health` (retourne `200 { "ok": true }` si PostgreSQL répond)
- **Variables secrètes** : injectées uniquement via les secrets du conteneur (jamais dans l’image ni dans Git, invariant n°7)

---

## 5. Tâche planifiée (clôture, pétitions 48 h et purges)

Configurer un **Scaleway Serverless Job / Cron** toutes les 5 minutes (`*/5 * * * *`) :

```bash
curl -fsS -X POST "https://<domaine-officiel>/api/internal/cron" \
  -H "Authorization: Bearer ${CRON_SECRET}"
```

Cette route idempotente exécute :
1. Clôture des votes échus (dépouillement, `tokens_issued`, suppression de `emargement`, effacement de `private_key_enc`, `VACUUM emargement`).
2. Expiration des pétitions dépassées et publication automatique après 48 h sans décision.
3. Purges RGPD (OTP expirés > 24 h, sessions expirées, pseudonymes de pétitions > 30 jours).

---

## 6. Confidentialité et conformité avant lancement (§15, §17)

- **Journaux d’accès / IP** : vérifier dans **Scaleway Cockpit / Serverless Containers** si les adresses IP clients sont journalisées par la plateforme ; désactiver la collecte ou réduire la rétention au minimum technique.
- **CNIL** : consigner dans `docs/decisions.md` le niveau de risque retenu au regard de la délibération CNIL n° 2026-045 avant toute ouverture publique.
- **Page Données personnelles** : mettre à jour la structure porteuse (association loi 1901) et l’adresse de contact définitive dans `src/copy/fr.ts`.
