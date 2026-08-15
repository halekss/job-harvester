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

## Tier 0 — `francetravail` (non couvert par ce sous-projet)

À documenter lors du sous-projet suivant. Note de dédup : France Travail alimente déjà
partiellement LBA (offres relayées avec `partner_label = "France Travail"`), donc la
déduplication exacte/floue de `packages/core` doit fusionner les doublons entre les deux
connecteurs une fois `francetravail` ajouté.
