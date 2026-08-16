# Sources

Statut légal évalué avant écriture de chaque connecteur. `robots.txt`/CGU ne s'appliquent
qu'aux connecteurs Tier 2 (accès par navigateur/DOM) ; les sources Tier 0/1 listées ici sont
consommées via API officielle avec authentification, donc hors périmètre `robots.txt`.

## Tier 0 — `labonnealternance`

- **Domaine** : `api.apprentissage.beta.gouv.fr` (API Apprentissage / La Bonne Alternance)
- **Route utilisée** : `GET /api/job/v1/search`
- **Authentification** : header `Authorization: Bearer <LBA_API_KEY>` (clé API à générer sur
  l'espace développeurs `https://api.apprentissage.beta.gouv.fr`)
- **Paramètres de requête pertinents** : `latitude` (-90..90), `longitude` (-180..180),
  `radius` (0..200, défaut 30), `romes` (codes ROME séparés par virgule), `target_diploma_level`,
  `rncp`, `opco`, `departements[]`, `partners_to_exclude[]`. `job-harvester` n'utilise en v1 que
  `latitude`/`longitude`/`radius`/`romes`.
- **Réponse** : `{ jobs: JobOfferRead[], recruiters: JobRecruiter[], warnings: {message, code}[] }`.
  Champ clé pour la traçabilité d'agrégation : `identifier.partner_label` — vaut
  `"offres_emploi_lba"` pour une offre collectée directement par LBA (pas d'agrégateur tiers),
  `"recruteurs_lba"` pour une entreprise à fort potentiel de recrutement (pas une offre
  publiée), ou le nom du partenaire d'origine (ex. `"France Travail"`) sinon.
- **Statut robots.txt/CGU** : non applicable — accès par API officielle authentifiée, pas de
  scraping.
- **Décision** : autorisé, Tier 0, connecteur prioritaire (couvre le plus de domaines en sortie
  à lui seul via ses partenaires fédérés).
- **Repère technique** : schéma de route et modèle de réponse vérifiés depuis le dépôt public
  `github.com/mission-apprentissage/api-apprentissage` (`sdk/src/routes/jobs/job.routes.openapi.ts`,
  `sdk/src/models/job/job.model.openapi.ts`).

## Tier 0 — `francetravail`

- **Domaine** : `api.francetravail.io` (recherche), `entreprise.francetravail.fr` (auth)
- **Route utilisée** : `GET https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search`
- **Authentification** : OAuth2 *client credentials* à deux valeurs — `FRANCE_TRAVAIL_CLIENT_ID` +
  `FRANCE_TRAVAIL_CLIENT_SECRET`, token obtenu via
  `POST https://entreprise.francetravail.fr/connexion/oauth2/access_token?realm=/partenaire`
  (`grant_type=client_credentials`, `scope=api_offresdemploiv2 o2dsoffre`), token Bearer valable
  environ 25 minutes, mis en cache par le connecteur.
- **Paramètres de requête utilisés** : `codeROME` (codes séparés par virgule), `departement`
  (extrait heuristiquement du label de localisation de la campagne, l'API n'acceptant pas de
  lat/lng directement contrairement à LBA).
- **Pagination** : via le header HTTP `Content-Range: offres <first>-<last>/<total>` (pas dans
  le corps JSON). Non gérée dans ce sous-projet — un seul appel de recherche par requête,
  comme pour `labonnealternance`.
- **Réponse** : `{ resultats: [...], filtresPossibles: [...] }`. Champ clé pour la traçabilité
  d'agrégation : `origineOffre.origine` (`"1"` = offre France Travail directe, `"2"` = offre
  relayée par un partenaire listé dans `origineOffre.partenaires[]`, avec son `nom` et son URL
  de candidature directe).
- **Point d'attention PII** : l'API expose un objet `contact` (nom/téléphone/email de contact
  recruteur selon la documentation générale, vide sur l'échantillon capturé) — délibérément
  absent du schéma Zod de ce connecteur, jamais stocké.
- **Statut robots.txt/CGU** : non applicable — accès par API officielle authentifiée.
- **Décision** : autorisé, Tier 0. Cette source alimente déjà partiellement La Bonne
  Alternance (offres relayées avec `partner_label: "France Travail"` côté LBA) — dédup
  inter-connecteurs gérée par le moteur de dédup flou de `packages/core`, pas par
  correspondance exacte d'URL (les deux sources utilisent des paramètres de tracking
  différents sur l'URL de candidature).
- **Vérifié en direct le 2026-08-16** : authentification, endpoint de recherche et forme de la
  réponse tous confirmés par un appel réel (pas seulement documenté) — voir
  `docs/superpowers/specs/2026-08-16-francetravail-connector-design.md`.
