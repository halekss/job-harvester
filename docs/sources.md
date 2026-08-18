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
- **Pagination** : via le paramètre de requête `range=<start>-<end>` (200 → réponse `206
  Partial Content` avec header `Content-Range: offres <first>-<last>/<total>`, pas dans le
  corps JSON). Gérée depuis JOB-30 : boucle par pages de 150 (plus grande taille de page
  vérifiée en direct sans erreur), jusqu'à couvrir `<total>`, avec un plafond dur de 20 pages
  (3000 offres) par requête.
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

## Tier 1 — `workday`

- **Domaine** : `{tenant}.{dc}.myworkdayjobs.com` (un domaine par entreprise cliente de Workday)
- **Route utilisée** : `POST https://{tenant}.{dc}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs`
  (liste), `GET {mêmeBase}{externalPath}` (détail par offre)
- **Authentification** : aucune — API publique utilisée par le widget de recherche intégré à
  la page carrière de l'entreprise.
- **Ciblage** : par entreprise (`tenant`/`site`/`dc`), configuré dans `config/campaigns.yaml`
  sous `targets.workday`. Pas de recherche multi-entreprises native.
- **Statut robots.txt/CGU** : non applicable — endpoint JSON public conçu pour l'intégration,
  pas de scraping de page.
- **Décision** : autorisé, Tier 1. Risque signalé : protection anti-bot Akamai pouvant limiter
  un usage soutenu depuis une seule IP — respecter un débit bas.
- **Pagination** : boucle sur `offset` (pas de 20, la taille de page native du widget) jusqu'à
  couvrir `total` (déjà présent dans la réponse de liste), plafond dur de 20 pages par
  cible (JOB-32).
- **Vérifié en direct le 2026-08-16** sur `valeo.wd3.myworkdayjobs.com`.

## Tier 1 — `smartrecruiters`

- **Domaine** : `api.smartrecruiters.com`
- **Route utilisée** : `GET /v1/companies/{company}/postings` (liste),
  `GET /v1/companies/{company}/postings/{id}` (détail)
- **Authentification** : aucune — API publique.
- **Ciblage** : par entreprise (slug), configuré dans `config/campaigns.yaml` sous
  `targets.smartrecruiters`.
- **Filtrage alternance** : aucun paramètre natif côté API — filtrage côté client sur le titre
  de l'offre avant l'appel de détail (évite d'appeler `/postings/{id}` pour chaque offre non
  pertinente).
- **Pagination** : `limit`/`offset` en query string, réponse porte `totalFound` — boucle par
  pages de 50 jusqu'à couvrir `totalFound`, plafond dur de 20 pages par entreprise (JOB-32).
- **Statut robots.txt/CGU** : non applicable — API publique dédiée à l'intégration.
- **Décision** : autorisé, Tier 1.
- **Vérifié en direct le 2026-08-16** sur l'entreprise `MAZARS` (188 offres réelles).

## Tier 2 — `jsonld-generic`

- **Domaine** : arbitraire — une ou plusieurs pages carrière complètes configurées par
  l'utilisateur, une par entreprise, sous `targets.jsonldGeneric` (`config/campaigns.yaml`). Pas
  de domaine fixe, contrairement aux connecteurs Tier 0/1.
- **Route utilisée** : `GET <url cible>` — récupération de la page HTML publique, sans API
  dédiée. Le connecteur extrait le JSON-LD `schema.org/JobPosting` embarqué dans un
  `<script type="application/ld+json">` de la page (`packages/connectors/src/lib/jsonld.ts`,
  parsing via `cheerio`).
- **Authentification** : aucune — accès public, comme un navigateur anonyme.
- **Ciblage** : par URL de page carrière complète (pas de recherche/filtre côté source ; le
  filtrage alternance se fait après coup côté `normalize.ts`, sur le texte titre/description).
- **Pagination** : aucune — une page cible = un ou plusieurs `JobPosting` extraits de cette même
  page (`@graph`/tableau JSON-LD aplati).
- **Rendu** : fetch statique en premier lieu ; si aucun JSON-LD n'est trouvé (page qui rend son
  contenu côté client), repli sur un navigateur headless réel (Playwright,
  `packages/connectors/src/lib/headless.ts`) — dernier recours coûteux, jamais le premier essai.
- **Statut robots.txt/CGU** : applicable, et vérifié **dynamiquement par URL cible au moment du
  run** (pas une décision figée par domaine comme pour Tier 0/1, puisque le domaine dépend de la
  configuration de chaque campagne) — `packages/connectors/src/lib/robots.ts` télécharge et
  parse le `robots.txt` de l'origine de chaque URL cible (`robots-parser`, résultat mis en cache
  en mémoire par origine pour la durée du run) avant tout fetch ; une URL refusée est ignorée
  (log `console.warn`) sans bloquer les autres cibles. Absence de `robots.txt` (404) ou fichier
  vide = autorisé par défaut.
- **Décision** : autorisé au cas par cas, Tier 2 — chaque URL cible doit passer la vérification
  `robots.txt` en direct avant d'être collectée ; aucune cible réelle configurée à ce stade
  (ticket JOB-7 livré sur fixtures/tests offline uniquement).

## Tier 2 — `sitemap-crawler`

- **Domaine** : arbitraire — un ou plusieurs sitemaps XML (ou domaines racine, résolus en
  `{racine}/sitemap.xml`) configurés sous `targets.sitemapCrawler`.
- **Route utilisée** : `GET <sitemap.xml>` puis `GET <url candidate>` pour chaque URL du sitemap
  dont le chemin matche `/jobs/`, `/careers/`, `/offre` ou `/recrutement` (insensible à la
  casse) ; extraction du JSON-LD `JobPosting` de chaque page candidate, comme `jsonld-generic`
  (réutilise `lib/jsonld.ts` et `normalize.ts` de `jsonld-generic` directement, sans duplication).
- **Authentification** : aucune — accès public.
- **Ciblage** : par sitemap (ou domaine racine), pas par entreprise nommée individuellement page
  par page — le crawl découvre lui-même les pages d'offres pertinentes.
- **Pagination** : aucune côté source ; le nombre de pages visitées est borné par le contenu du
  sitemap et le filtre de motif de chemin.
- **Politesse inter-requêtes** : une requête par domaine espacée d'au moins 1 seconde
  (`packages/connectors/src/lib/domain-politeness.ts`, `waitForDomain`) en plus du fetch statique
  → repli navigateur headless (Playwright) en dernier recours si aucun JSON-LD n'est trouvé,
  identique à `jsonld-generic`.
- **Statut robots.txt/CGU** : applicable, et vérifié **dynamiquement par URL cible au moment du
  run** (pas une décision figée par domaine) — le `robots.txt` de l'origine est vérifié une
  première fois pour le sitemap lui-même, puis à nouveau pour chaque page candidate avant de la
  visiter ; une URL refusée est ignorée (log `console.warn`) sans interrompre le crawl du reste
  du sitemap.
- **Décision** : autorisé au cas par cas, Tier 2 — mêmes garde-fous que `jsonld-generic` ; aucune
  cible réelle configurée à ce stade (ticket JOB-7 livré sur fixtures/tests offline uniquement).
