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

## Tier 1 — `welcometothejungle`

- **Domaine réellement interrogé** : `{appId}-dsn.algolia.net` (Algolia, tiers), **pas**
  `welcometothejungle.com`. Index `wk_cms_jobs_production`.
- **Route utilisée** : `POST https://{appId}-dsn.algolia.net/1/indexes/wk_cms_jobs_production/query`
  avec en-têtes `x-algolia-application-id`, `x-algolia-api-key`, corps
  `{"params": "query=...&hitsPerPage=...&page=...&aroundLatLng=lat,lng&aroundRadius=mètres"}`.
- **Authentification** : clé Algolia « search-only » publique (`WTTJ_ALGOLIA_APP_ID` /
  `WTTJ_ALGOLIA_API_KEY`), du type que n'importe quel visiteur du site charge déjà dans son
  navigateur pour effectuer une recherche — pas un secret privé côté WTTJ, mais un identifiant
  que ce connecteur doit fournir lui-même (voir "Conflit robots.txt" ci-dessous pour pourquoi il
  n'est pas extrait automatiquement à l'exécution).
- **⚠️ Conflit robots.txt / décision assumée** : `welcometothejungle.com/robots.txt` (vérifié en
  direct) contient `disallow: */jobs?query=*` et `Disallow: /*?` — la plateforme interdit
  explicitement le crawl de ses propres URLs de recherche (`/fr/jobs?query=...`). Ce connecteur
  ne fetch **jamais** ces URLs interdites : il interroge directement `{appId}-dsn.algolia.net`,
  le service tiers qui alimente cette recherche, domaine sur lequel `welcometothejungle.com`
  n'a techniquement aucune autorité `robots.txt` (chaque domaine ne régit que lui-même). **Ceci
  reproduit néanmoins la même fonctionnalité que l'interface de recherche interdite au crawl.**
  Décision assumée avec l'utilisateur du dépôt : implémenter quand même, pour un usage
  strictement personnel (veille alternance individuelle, pas de redistribution, pas de volume
  significatif — un connecteur personnel n'est pas le scraping massif que ce `Disallow` vise
  probablement à empêcher), documentée ici en toute transparence plutôt que passée sous silence.
  Si cette lecture devait changer (usage partagé, volume élevé, CGU explicites contre l'accès
  Algolia direct), ce connecteur devrait être désactivé.
- **Détail supplémentaire vérifié en direct** : la page `welcometothejungle.com/fr/jobs` a en
  réalité migré vers une expérience de recherche gated par compte (« matching ») — taper une
  recherche dans son propre champ de recherche déclenche uniquement un compteur
  (`GET api.welcometothejungle.com/api/v3/search/jobs/count`, public) puis redirige vers un mur
  d'inscription pour voir la liste ; l'API `api.welcometothejungle.com/api/v3/search/jobs` (liste
  complète, non `/count`) renvoie `403 Forbidden` sans session authentifiée. La recherche Algolia
  documentée ici reste néanmoins accessible et fonctionnelle en direct (vérifiée avec de vraies
  clés capturées et une vraie requête retournant des offres réelles) — elle alimente d'autres
  parties du site (ex. les carrousels d'entreprises en page d'accueil) et n'a, à ce jour, pas été
  fermée malgré le changement d'UX de la recherche principale.
- **Découverte des clés** : app-id et clé publique capturés en direct via interception réseau
  d'un navigateur réel sur une page autorisée par `robots.txt` (`/fr/jobs`, sans query string) ;
  la recherche statique du HTML/JS ne les expose pas (chargées dynamiquement). Ce connecteur ne
  répète pas cette capture à l'exécution : il attend `WTTJ_ALGOLIA_APP_ID`/`WTTJ_ALGOLIA_API_KEY`
  en variables d'environnement (voir `.env.example`), à renseigner manuellement si elles changent
  un jour (rotation de clé côté WTTJ) — capture reproductible depuis les devtools réseau
  (onglet Réseau, filtrer `algolia.net`, en-têtes de la requête `POST .../query`).
- **Gestion de l'absence de clé** : `supports()` retourne `false` sans configuration —
  connecteur inactif, pas d'erreur qui casse une campagne ; `fetch()` lève une erreur explicite
  seulement s'il est appelé malgré tout.
- **Ciblage** : aucun — connecteur « large » comme `labonnealternance`/`francetravail`, recherche
  directe via `query.keywords` (texte libre) et `query.location` (`aroundLatLng`/`aroundRadius`,
  vérifié en direct avec un centre Lille/30 km, résultats cohérents).
- **Pagination** : `page`/`hitsPerPage` (défaut 50), boucle jusqu'à couvrir `nbPages`, plafond dur
  de 10 pages (500 offres) par requête.
- **Point d'attention PII** : whitelist Zod stricte (`types.ts`) — aucun champ de contact
  recruteur n'existe dans les hits de cet index (vérifié en direct sur plusieurs offres réelles).
- **Vérifié en direct le 2026-08-18** : app-id (`CSEKHVMS53`), clé publique, endpoint, format de
  requête/réponse et URL canonique de détail (`/fr/companies/{organisation}/jobs/{offre}`) tous
  confirmés par de vraies requêtes retournant de vraies offres (ex. Younited, Ironhack France,
  Thales) — voir `fixtures/welcometothejungle/algolia-result.json`.

## Tier 1 — `talentsoft`

- **Domaine** : `{domaine cible}` (un par entreprise, ex. `recrutement.mgen.fr`), configuré sous
  `targets.talentsoft` (`config/campaigns.yaml`).
- **Détection de plateforme** : avant tout appel du flux d'offres, la page racine du domaine
  cible est chargée et vérifiée pour les marqueurs `__VIEWSTATE`, `.aspx` ou la chaîne
  `talentsoft` (insensible à la casse). Un domaine qui ne les porte pas est ignoré proprement
  (`console.warn`), sans jamais appeler un handler RSS qui n'existerait pas dessus — garde-fou
  contre un faux positif comme `recrutement.vnf.fr` (relevé dans le ticket d'origine : même
  convention d'URL `recrutement.{organisme}.fr` mais tourne en réalité sur WordPress).
- **Route utilisée** : `GET https://{domaine}/handlers/offerRss.ashx?LCID=1036` — flux RSS
  officiel exposé par la plateforme Talentsoft elle-même (handler générique du produit, pas
  spécifique à un client), paramètres optionnels `Rss_Contract`/`Rss_JobFamily` pour filtrer
  (non utilisés en v1).
- **Pourquoi pas `jsonld-generic`** : aucun JSON-LD `schema.org/JobPosting` n'a été trouvé sur
  l'instance Talentsoft vérifiée (`recrutement.mgen.fr`) — `jsonld-generic` ne peut donc rien en
  extraire. Le flux RSS officiel, lui, est disponible sans dépendre du rendu HTML de la page.
- **Format** : RSS 2.0 standard — chaque `<item>` porte `<link>` (URL de détail avec paramètre
  `idOffre=NNNN`), plusieurs `<category>` (filière/métier, type de contrat, adresse en texte
  libre), `<title>` (préfixé d'une référence interne type `"2026-5515 - "`, retirée à la
  normalisation), `<description>` (HTML échappé en entités XML). Parsé par extraction regex
  simple (`client.ts`) — pas de dépendance à une lib XML pour ce format.
- **Extraction de la localisation** : la catégorie qui porte l'adresse est repérée par un motif
  virgule + code postal à 5 chiffres (ex. `"59 bis boulevard Jean Jaurès, 74500 EVIAN-LES-BAINS,
  france"`) ; les autres catégories (filière, type de contrat) n'ont jamais ce motif.
- **Nom d'entreprise** : absent du flux RSS — dérivé heuristiquement du domaine cible
  (best-effort, documenté comme tel dans `normalize.ts`, pas une source autoritaire).
- **Authentification** : aucune — flux RSS public, comme n'importe quel lecteur de flux.
- **Statut robots.txt** : vérifié dynamiquement par domaine cible (`isAllowedByRobots()`), à la
  fois pour la page racine (détection de plateforme) et pour le handler RSS — même garde-fou que
  `jsonld-generic`, bien que Tier 1. `recrutement.mgen.fr` n'a pas de `robots.txt` (200, corps
  vide) au moment de la vérification — autorisé par défaut, comme documenté pour les autres
  connecteurs de ce dépôt.
- **Décision** : autorisé, Tier 1. Aucune cible réelle configurée dans `config/campaigns.yaml` à
  ce stade — MGEN (mutuelle de santé) a servi uniquement à vérifier/construire la fixture, sans
  rapport avec les campagnes data/dev web existantes.
- **Vérifié en direct le 2026-08-18** sur `recrutement.mgen.fr` : marqueurs de détection de
  plateforme, `robots.txt` vide, et flux RSS réel (20 offres, dont une en alternance) tous
  confirmés par de vraies requêtes — voir `fixtures/talentsoft/offer-rss.xml` (extrait tronqué à
  3 offres représentatives de la réponse réelle).

## Tier 1 — `digitalrecruiters`

- **Domaine** : `joinus.{entreprise}.fr` (un sous-domaine par entreprise cliente), configuré sous
  `targets.digitalRecruiters` (`config/campaigns.yaml`).
- **Écart avec l'hypothèse initiale du ticket** : le ticket d'origine envisageait de parser le
  bloc `window.__NUXT__` embarqué dans le HTML public de `/fr/annonces`. Vérifié en direct sur
  `joinus.decathlon.fr` (Decathlon est bien client DigitalRecruiters) : ce bloc SSR ne porte que
  la configuration de page (thème, i18n, réglages du site carrière) — le store Pinia qu'il
  initialise est **vide** (`jobAds:{jobAds:[],count:void 0,...}`). La liste d'offres est en
  réalité chargée après coup côté client via un appel XHR séparé vers une route JSON publique,
  capturée en direct via interception réseau d'un navigateur réel. Cette route JSON est utilisée
  directement par ce connecteur — plus simple et plus robuste qu'un parsing HTML/JS dont la
  structure de rendu peut changer à chaque build Nuxt.
- **Route utilisée** : `POST https://api.digitalrecruiters.com/public/v1/careers-site/job-ads
  ?domainName={domaine}&limit=50&page={n}&locale=fr_FR`, corps
  `{"filters":{},"coordinates":{"lat":0,"lng":0}}`.
- **Authentification** : aucune — route publique (`/public/v1/...`), utilisée par le site carrière
  lui-même pour tout visiteur anonyme. Distincte de `api.digitalrecruiters.com/careers/v1/...`
  (mentionnée dans le ticket d'origine), qui elle est gated (`403` sans session) et n'est pas
  utilisée par ce connecteur.
- **Réponse** : `{count, items: [{job_ad_id, title, contract, location, job, url, ...}], filters}`.
  Un seul appel suffit à obtenir tous les champs nécessaires à la normalisation (titre, contrat,
  ville, URL) — pas de requête de détail par offre.
- **Extraction de la localisation** : le champ `url` (slug) se termine systématiquement par
  `-{code postal 5 chiffres}-{ville}` (ex. `...-33300-bordeaux`), exploité pour en extraire un
  code postal sans requête supplémentaire ; `location` (ville en texte libre, ex. `"Bordeaux"`)
  sert de libellé lisible.
- **URL de détail** : `https://{domaine}/fr/annonce/{url}` (singulier `annonce`, vérifié en
  direct — un lien réel du DOM de la page de listing pointe vers ce chemin exact).
- **Nom d'entreprise** : absent de la réponse (seules des divisions internes DigitalRecruiters
  "brand", ex. `"DECATHLON Retail Omnichannel"`, sont exposées, pas le nom de l'entreprise
  elle-même) — dérivé heuristiquement du sous-domaine cible, comme pour `talentsoft`.
- **Description** : absente de cet endpoint de liste — laissée vide plutôt qu'inventée ;
  `canonicalUrl` renvoie vers la page réelle pour le texte complet.
- **Pagination** : `limit`/`page`, boucle jusqu'à une page incomplète, plafond dur de 20 pages
  (1000 offres) par cible.
- **Statut robots.txt/CGU** : non applicable — API publique dédiée à l'intégration (même
  catégorie que `smartrecruiters`/`workday`), pas de scraping HTML. Vérifié par ailleurs que
  `joinus.decathlon.fr/robots.txt` autorise explicitement tout crawl (`Allow: /`,
  `Crawl-delay: 10`).
- **Décision** : autorisé, Tier 1. Aucune cible réelle configurée dans `config/campaigns.yaml` à
  ce stade — Decathlon n'est pas pertinent pour les campagnes data/dev web existantes ; a servi
  uniquement à vérifier/construire la fixture.
- **Vérifié en direct le 2026-08-18** sur `joinus.decathlon.fr` : endpoint, authentification,
  format de réponse (1474 offres réelles au moment du test, dont des alternances) et URL de
  détail tous confirmés par de vraies requêtes — voir `fixtures/digitalrecruiters/job-ads.json`.
