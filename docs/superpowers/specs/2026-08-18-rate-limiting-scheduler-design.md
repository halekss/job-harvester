# job-harvester — Sous-projet 4 : rate limiting par domaine + scheduler cron

Date : 2026-08-18
Statut : approuvé, prêt pour plan d'implémentation

## Contexte

Suite des sous-projets 1-3 (LBA, France Travail, Workday/SmartRecruiters). Le sous-projet 2
(`docs/superpowers/specs/2026-08-16-francetravail-connector-design.md`) avait explicitement
laissé hors périmètre "le reste de la Phase 3 du cahier des charges (token bucket configurable,
backoff exponentiel avec jitter, planification cron)". Ce sous-projet couvre ce reliquat, tracké
sous le ticket Linear [JOB-5](https://linear.app/job-harvester/issue/JOB-5) (dont la partie
"connecteur France Travail + généralisation orchestrateur" est déjà livrée — vérifié dans le
code : `packages/api/src/routes/harvest.ts` boucle déjà sur tous les connecteurs supportant la
campagne, et la dédup inter-connecteurs fonctionne déjà génériquement via `isFuzzyDuplicate`/
`mergeOffers`) et [JOB-12](https://linear.app/job-harvester/issue/JOB-12) (`DomainRateLimiter`
clé par `connector.id` au lieu du domaine HTTP réel), qui se recoupent directement.

C'est le premier des trois sous-projets issus de la décomposition de JOB-5 + JOB-31 + JOB-7
(ordre validé avec l'utilisateur : rate limiting/scheduler d'abord, car c'est de l'infra dont
profitent les connecteurs suivants, puis JOB-7 — Tier 2 générique + robots.txt, où une vraie
politesse HTTP compte particulièrement en crawlant des sites tiers non contrôlés — puis JOB-31 —
trois connecteurs ad hoc indépendants).

## Constat technique clé (vérifié en lisant le code, pas supposé)

`DomainRateLimiter.wait(connector.id)` (`packages/harvester/src/rate-limit/domain-rate-limiter.ts`)
n'est actuellement appelé qu'**une fois par itération de localisation**, dans la boucle externe de
`runCampaign` (`packages/harvester/src/orchestrator.ts`), *avant* même que le générateur
`connector.fetch()` démarre — jamais avant chaque requête HTTP individuelle qu'il émet en
interne. Or plusieurs connecteurs font plusieurs requêtes séquentielles par appel à `fetch()` :
Workday (liste puis N détails par offre), SmartRecruiters (idem), France Travail (pagination).
Le rate limiting actuel ne protège donc quasiment aucune requête réelle — juste l'espacement
entre deux itérations de la boucle externe.

Chaque `client.ts` de connecteur reçoit déjà un `fetchImpl: typeof fetch` via
`ConnectorContext` (`packages/core/src/schemas/connector.ts`) et l'utilise pour **tous** ses
appels HTTP internes (`options.fetchImpl ?? fetch`, vérifié dans les 4 connecteurs). C'est le
point d'interception naturel.

## Périmètre validé avec l'utilisateur

**Inclus** :
- Rate limiting par domaine HTTP réel (corrige JOB-12), avec token bucket (valeurs par défaut
  fixes, pas de configuration par domaine — pas de besoin réel identifié pour 2 campagnes/4
  connecteurs actuellement) et retry avec backoff exponentiel + jitter sur `429`/`5xx`.
- Scheduler cron lisant le champ `schedule` des campagnes (déjà présent dans
  `config/campaigns.yaml`, actuellement ignoré silencieusement par le schéma Zod), désactivé par
  défaut, activable via `ENABLE_SCHEDULER=true`.

**Explicitement exclu** (reste de la Phase 3 du cahier des charges, à re-tracker séparément si un
besoin réel apparaît) :
- Concurrence bornée par domaine (fetch parallèle contrôlé) — l'usage actuel est séquentiel, un
  connecteur à la fois.
- Reprise sur incident (reprendre un run interrompu sans tout re-fetcher).
- Configuration des limites de débit par domaine.

## Décisions de conception

### 1. Rate limiting : fetch gardé, transparent pour les connecteurs

Nouveau module `packages/harvester/src/rate-limit/rate-limited-fetch.ts` exportant
`createRateLimitedFetch(baseFetch: typeof fetch): typeof fetch`. La fonction retournée, à chaque
appel :

1. Extrait `new URL(url).hostname` de la requête.
2. Attend sur un token bucket dédié à ce hostname (créé à la volée au premier appel, conservé
   dans une `Map<hostname, TokenBucket>` fermée sur l'instance retournée par la factory — donc
   partagée entre tous les appels d'un même run, isolée entre deux runs).
3. Effectue la requête via `baseFetch`.
4. Si la réponse est `429` ou `5xx` : retente avec backoff exponentiel + jitter complet, jusqu'à
   3 tentatives au total (1 essai initial + 2 retries). Délai avant le 2e essai : jitter aléatoire
   sur `[0, 500ms]` ; délai avant le 3e essai : jitter aléatoire sur `[0, 1000ms]`. Si le 3e essai
   échoue encore, la dernière réponse/erreur remonte normalement (comptée dans
   `rejectedCount`/`errorMessage` comme aujourd'hui — aucun changement du contrat `RunSummary`).

Valeurs par défaut conservatrices identiques pour tout domaine (~1 requête/seconde soutenue,
petite rafale autorisée au démarrage).

`packages/harvester/src/orchestrator.ts::runCampaign` construit **une instance** de ce fetch
gardé au début du run et la passe comme `ctx.fetchImpl` aux connecteurs, à la place du `fetch`
brut utilisé aujourd'hui (`{ fetchImpl: fetch, env }`). `DomainRateLimiter`
(`domain-rate-limiter.ts`) et son usage actuel (`rateLimiter.wait(connector.id)`) sont supprimés.

**Aucun changement dans les 4 `client.ts` des connecteurs** : ils consomment déjà
`ctx.fetchImpl`/`options.fetchImpl ?? fetch` pour tous leurs appels internes, donc le nouveau
comportement s'applique automatiquement, y compris aux appels de pagination et de détail. Un
futur connecteur en profite aussi sans rien faire de spécial.

Approche retenue plutôt que (a) faire appeler explicitement le rate limiter par chaque
connecteur à chaque site d'appel HTTP (10+ endroits dans les 4 fichiers existants, invasif,
facile à oublier pour un futur connecteur — exactement le type de bug que JOB-12 documente déjà)
ou (b) corriger seulement la clé du `DomainRateLimiter` actuel sans changer sa granularité
(laisserait les rafales internes à un seul `connector.fetch()` totalement non protégées, ce qui
est le vrai risque identifié ci-dessus).

### 2. Scheduler cron

- `schedule: z.string().optional()` ajouté à `CampaignConfigSchema`
  (`packages/harvester/src/config/campaign-schema.ts`).
- Nouvelle dépendance `croner` dans `packages/harvester` (bibliothèque de scheduling cron
  légère, sans dépendance transitive).
- Nouveau module `packages/harvester/src/scheduler.ts` exportant `startScheduler(campaigns,
  connectors, db, env): { stop(): void }` : pour chaque campagne dont `schedule` est défini,
  programme un job `croner` qui appelle `runCampaignAcrossConnectors(...)` (voir ci-dessous) à
  l'horaire configuré. `stop()` arrête tous les jobs programmés (utile pour les tests et un arrêt
  propre du process).
- Extraction de la logique commune "sélectionner les connecteurs qui supportent la campagne, puis
  lancer `runCampaign` sur chacun" — actuellement dans `packages/api/src/routes/harvest.ts`
  lignes 10-20 — vers une fonction partagée `runCampaignAcrossConnectors(campaign, connectors,
  db, env): Promise<RunSummary[]>` dans `packages/harvester` (même esprit que la correction
  JOB-24 sur la construction dupliquée de `HarvestQuery`). Réutilisée par la route HTTP et par le
  scheduler — élimine la duplication et garantit un comportement identique (mêmes connecteurs
  sélectionnés, même gestion du cas "aucun connecteur ne supporte la campagne") entre un run
  manuel et un run planifié.
- `packages/api/src/server.ts` démarre le scheduler uniquement si
  `process.env.ENABLE_SCHEDULER === "true"`, pour ne pas déclencher de collectes réelles vers des
  API externes à chaque redémarrage du serveur en développement local.
- `.env.example` : ajout de `ENABLE_SCHEDULER` (commenté, sans valeur par défaut forcée).

## Périmètre (fichiers touchés)

- `packages/harvester/src/rate-limit/rate-limited-fetch.ts` (nouveau) +
  `rate-limited-fetch.test.ts`.
- `packages/harvester/src/rate-limit/domain-rate-limiter.ts` et
  `domain-rate-limiter.test.ts` — supprimés (remplacés).
- `packages/harvester/src/orchestrator.ts` — construction du fetch gardé, retrait de l'usage de
  `DomainRateLimiter`, ajout de `runCampaignAcrossConnectors` (même fichier : elle appelle
  directement `runCampaign`, qui y est déjà défini — pas de nouveau fichier ni d'import circulaire
  à gérer).
- `packages/harvester/src/scheduler.ts` (nouveau) + `scheduler.test.ts`.
- `packages/harvester/src/config/campaign-schema.ts` — ajout du champ `schedule`.
- `packages/harvester/package.json` — ajout de la dépendance `croner`.
- `packages/api/src/routes/harvest.ts` — utilise `runCampaignAcrossConnectors` au lieu de
  dupliquer la sélection de connecteurs.
- `packages/api/src/server.ts` — démarre le scheduler si `ENABLE_SCHEDULER=true`.
- `.env.example`, `README.md` — documentation de `ENABLE_SCHEDULER` et du champ `schedule`.

## Tests

- `rate-limited-fetch.test.ts` : throttling effectif par domaine (deux hostnames différents ne se
  bloquent pas l'un l'autre) ; retry réussi après un `429`/`5xx` suivi d'une réponse `200` ;
  échec propagé (réponse/erreur d'origine) après épuisement des tentatives ; délai croissant
  entre tentatives (backoff).
- `scheduler.test.ts` : programmation correcte à partir d'une expression cron valide ;
  non-déclenchement pour une campagne sans `schedule` ; `stop()` arrête bien les jobs
  programmés.
- Test du champ `schedule` dans le schéma de campagne (accepté quand présent, campagne toujours
  valide quand absent).
- `orchestrator.test.ts` : `runCampaign` passe bien un `ctx.fetchImpl` gardé (pas le `fetch` brut)
  aux connecteurs.
- Test de `runCampaignAcrossConnectors` : mêmes cas que ceux actuellement couverts par le
  handler HTTP (`no_connector_supports_campaign`, agrégation des `RunSummary`), pour garantir la
  parité de comportement entre route et scheduler après extraction.
