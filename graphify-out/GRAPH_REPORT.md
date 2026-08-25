# Graph Report - job-harvester  (2026-08-25)

## Corpus Check
- 221 files · ~107,764 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1076 nodes · 2120 edges · 56 communities (51 shown, 5 thin omitted)
- Extraction: 99% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.76)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `765f5cb0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- digitalrecruiters/client.ts
- orchestrator.test.ts
- app.ts
- ADR-0002: Connector tier cascade
- devDependencies
- api/client.ts
- talentsoft/client.ts
- dependencies
- dependencies
- workday/client.ts
- francetravail/client.ts
- labonnealternance/client.ts
- connectors/package.json
- db/package.json
- welcometothejungle/client.ts
- smartrecruiters/client.ts
- RawOffer
- normalized-offer.ts
- core/package.json
- connectors/src/index.ts
- scripts
- normalizeCompanyName
- compilerOptions
- compilerOptions
- welcometothejungle/normalize.ts
- sitemap-crawler/client.ts
- core/tsconfig.json
- harvester/tsconfig.json
- talentsoft/normalize.ts
- api/tsconfig.json
- connectors/tsconfig.json
- db/tsconfig.json
- core/src/index.ts
- vitest
- jest-axe-vitest.d.ts
- discover-targets.ts
- Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters — Implementation Plan
- exactDedupKeyFromSource
- BulkActionBar.tsx
- main.tsx
- Global Constraints
- orchestrator.ts
- HarvestQuery
- Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters
- digitalrecruiters/normalize.ts
- timedHealthCheck
- Prompt développeur senior — Fiabiliser les filtres de collecte (contrat / ville / métier)
- ResizeObserverStub
- Fiabiliser les filtres de collecte (contrat / ville / métier)
- labonnealternance/normalize.ts
- CLAUDE.md

## God Nodes (most connected - your core abstractions)
1. `vitest` - 63 edges
2. `HarvestQuery` - 38 edges
3. `exactDedupKeyFromSource()` - 30 edges
4. `exactDedupKeyFromUrl()` - 28 edges
5. `NormalizedOffer` - 23 edges
6. `normalizeCompanyName()` - 22 edges
7. `Connector` - 21 edges
8. `timedHealthCheck()` - 20 edges
9. `RawOffer` - 20 edges
10. `canonicalizeUrl()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `pnpm workspace configuration` --conceptually_related_to--> `job-harvester README`  [INFERRED]
  pnpm-workspace.yaml → README.md
- `job-harvester README` --references--> `packages/web HTML entry point`  [EXTRACTED]
  README.md → packages/web/index.html
- `Source: jsonld-generic (Tier 2)` --conceptually_related_to--> `Tier 3 headless browser (not implemented)`  [AMBIGUOUS]
  docs/sources.md → docs/adr/0002-cascade-de-tiers-connecteurs.md
- `makeOffer()` --calls--> `exactDedupKeyFromUrl()`  [EXTRACTED]
  packages/core/src/dedup/merge.test.ts → packages/core/src/dedup/dedup-key.ts
- `makeOffer()` --calls--> `exactDedupKeyFromUrl()`  [EXTRACTED]
  packages/harvester/src/discovery/discover-targets.test.ts → packages/core/src/dedup/dedup-key.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tier 2 connectors sharing JSON-LD extraction, dynamic robots.txt checks, and headless fallback** — docs_sources_jsonld_generic, docs_sources_sitemap_crawler, docs_adr_0002_cascade_de_tiers_connecteurs_tier_cascade [EXTRACTED 1.00]
- **Tier 1 connectors against unauthenticated ATS/search JSON endpoints** — docs_sources_workday, docs_sources_smartrecruiters, docs_sources_welcometothejungle, docs_sources_talentsoft, docs_sources_digitalrecruiters [INFERRED 0.75]
- **Tier 0 connectors implementing the shared Connector contract against official market-wide APIs** — docs_sources_labonnealternance, docs_sources_francetravail, docs_superpowers_specs_2026_08_15_labonnealternance_e2e_design_connector_contract [INFERRED 0.85]

## Communities (56 total, 5 thin omitted)

### Community 0 - "digitalrecruiters/client.ts"
Cohesion: 0.14
Nodes (17): checkDigitalRecruitersHealth(), DIGITALRECRUITERS_CONNECTOR_ID, DigitalRecruitersClientOptions, escapeRegExp(), fetchDigitalRecruitersOffers(), fetchJobAdsPage(), headers(), matchesKeywords() (+9 more)

### Community 1 - "orchestrator.test.ts"
Cohesion: 0.12
Nodes (23): connectorRuns, commentOnIssue(), createIssue(), LinearGraphQLResponse, LinearIssueRef, linearRequest(), requireTeamId(), resolveLabelIds() (+15 more)

### Community 2 - "app.ts"
Cohesion: 0.06
Nodes (49): AppDeps, createApp(), sampleOffer, tmpDirs, registerCampaignRoutes(), CreateEventBodySchema, registerEventRoutes(), registerHarvestRoutes() (+41 more)

### Community 3 - "ADR-0002: Connector tier cascade"
Cohesion: 0.07
Nodes (53): Campaign alternance-data-hdf, Campaign alternance-devweb-hdf, ADR-0001: Hono over Fastify, Tier 3 headless browser (not implemented), ADR-0002: Connector tier cascade, ADR-0003: No TypeScript build step (tsx-only), ADR-0004: rawPayload stores Zod-whitelisted object, never raw payload, ADR index (+45 more)

### Community 4 - "devDependencies"
Cohesion: 0.04
Nodes (46): jest-axe, jsdom, dependencies, react, react-dom, @tanstack/react-query, @tanstack/react-virtual, devDependencies (+38 more)

### Community 5 - "api/client.ts"
Cohesion: 0.07
Nodes (38): Campaign, deleteEvent(), DiscoveredTarget, getCampaigns(), getOffers(), HarvestFilters, HarvestRunResult, OfferDetail (+30 more)

### Community 6 - "talentsoft/client.ts"
Cohesion: 0.09
Nodes (30): getRobots(), isAllowedByRobots(), Robots, robotsCache, robotsParser, checkTalentsoftHealth(), decodeXmlEntities(), detectTalentsoftPlatform() (+22 more)

### Community 7 - "dependencies"
Cohesion: 0.06
Nodes (34): hono, @hono/node-server, @job-harvester/harvester, dependencies, drizzle-orm, hono, @hono/node-server, @job-harvester/connectors (+26 more)

### Community 8 - "dependencies"
Cohesion: 0.06
Nodes (32): croner, dependencies, croner, drizzle-orm, @job-harvester/connectors, @job-harvester/core, @job-harvester/db, ulid (+24 more)

### Community 9 - "workday/client.ts"
Cohesion: 0.14
Nodes (21): checkWorkdayHealth(), cxsBaseUrl(), escapeRegExp(), fetchJobDetail(), fetchJobList(), fetchWorkdayOffers(), headers(), HEALTH_CHECK_TARGET (+13 more)

### Community 10 - "francetravail/client.ts"
Cohesion: 0.12
Nodes (22): authHeaders(), buildSearchUrl(), CachedToken, checkFranceTravailHealth(), extractDepartement(), fetchFranceTravailOffers(), FranceTravailClientOptions, getAccessToken() (+14 more)

### Community 11 - "labonnealternance/client.ts"
Cohesion: 0.15
Nodes (15): USER_AGENT, authHeaders(), buildSearchUrl(), checkLbaHealth(), fetchLbaOffers(), LBA_CONNECTOR_ID, LbaClientOptions, query (+7 more)

### Community 12 - "connectors/package.json"
Cohesion: 0.07
Nodes (26): cheerio, dependencies, cheerio, @job-harvester/core, playwright, robots-parser, zod, devDependencies (+18 more)

### Community 13 - "db/package.json"
Cohesion: 0.08
Nodes (25): better-sqlite3, drizzle-kit, dependencies, better-sqlite3, drizzle-orm, @job-harvester/core, devDependencies, drizzle-kit (+17 more)

### Community 14 - "welcometothejungle/client.ts"
Cohesion: 0.12
Nodes (21): buildParams(), checkWttjHealth(), escapeRegExp(), fetchWttjOffers(), getWttjCredentials(), headers(), matchesKeywords(), queryJobsIndex() (+13 more)

### Community 15 - "smartrecruiters/client.ts"
Cohesion: 0.13
Nodes (21): checkSmartRecruitersHealth(), escapeRegExp(), fetchPostingDetail(), fetchPostingsList(), fetchSmartRecruitersOffers(), headers(), matchesContractTypesHint(), matchesKeywords() (+13 more)

### Community 16 - "RawOffer"
Cohesion: 0.23
Nodes (9): WORKDAY_CONNECTOR_ID, query, workdayConnector, normalizeWorkdayOffer(), fixturesDir, loadFixture(), loadRawOfferPayload(), target (+1 more)

### Community 17 - "normalized-offer.ts"
Cohesion: 0.13
Nodes (18): FUZZY_MATCH_THRESHOLD, isDuplicate(), isExactDuplicate(), isFuzzyDuplicate(), mergeOffers(), makeOffer(), unionSourceRefs(), trigrams() (+10 more)

### Community 18 - "core/package.json"
Cohesion: 0.10
Nodes (20): dependencies, ulid, zod, devDependencies, @types/node, typescript, vitest, exports (+12 more)

### Community 19 - "connectors/src/index.ts"
Cohesion: 0.18
Nodes (10): normalizeJsonLdOffer(), sourceOfferIdFromUrl(), fixturesDir, loadFixture(), loadRawOfferPayload(), JobPosting, JobPostingSchema, JsonLdRawOffer (+2 more)

### Community 20 - "scripts"
Cohesion: 0.11
Nodes (17): devDependencies, tsx, typescript, vitest, tsx, typescript, vitest, name (+9 more)

### Community 21 - "normalizeCompanyName"
Cohesion: 0.24
Nodes (8): mapContractType(), normalizeFranceTravailOffer(), parseLieuTravail(), resolveApplyUrl(), resolveOriginSource(), fixturesDir, LEGAL_SUFFIXES, normalizeCompanyName()

### Community 22 - "compilerOptions"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+6 more)

### Community 23 - "compilerOptions"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, rootDir, extends, include (+5 more)

### Community 24 - "welcometothejungle/normalize.ts"
Cohesion: 0.31
Nodes (5): buildCanonicalUrl(), mapRemotePolicy(), normalizeWttjOffer(), fixturesDir, inferContractTypeFromText()

### Community 25 - "sitemap-crawler/client.ts"
Cohesion: 0.15
Nodes (14): DomainRateLimiter, sharedLimiter, waitForDomain(), extractJobPostings(), flatten(), hasJobPostingType(), checkSitemapCrawlerHealth(), extractLocs() (+6 more)

### Community 26 - "core/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, rootDir, types, extends, include, node, src, ../../tsconfig.base.json

### Community 27 - "harvester/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, rootDir, types, extends, include, node, src, ../../tsconfig.base.json

### Community 28 - "talentsoft/normalize.ts"
Cohesion: 0.24
Nodes (8): companyNameFromDomain(), findAddressCategory(), normalizeTalentsoftOffer(), parseAddress(), PLATFORM_LABELS, stripReferencePrefix(), ENTITY_REPLACEMENTS, stripHtml()

### Community 29 - "api/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 30 - "connectors/tsconfig.json"
Cohesion: 0.22
Nodes (8): compilerOptions, rootDir, types, extends, include, node, src, ../../tsconfig.base.json

### Community 31 - "db/tsconfig.json"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 32 - "core/src/index.ts"
Cohesion: 0.23
Nodes (9): fetchRenderedHtml(), checkJsonLdGenericHealth(), fetchJsonLdGenericOffers(), fetchStaticHtml(), headers(), JSONLD_GENERIC_CONNECTOR_ID, JsonLdGenericClientOptions, jsonldGenericConnector (+1 more)

### Community 34 - "jest-axe-vitest.d.ts"
Cohesion: 0.33
Nodes (3): Assertion, AsymmetricMatchersContaining, vitest

### Community 35 - "discover-targets.ts"
Cohesion: 0.07
Nodes (31): WorkdayTarget, ALL_PLATFORMS, DiscoveredTarget, discoverTargets(), DiscoverTargetsOptions, DiscoverySummary, probeKey(), ProbeResult (+23 more)

### Community 36 - "Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters — Implementation Plan"
Cohesion: 0.11
Nodes (17): Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters — Implementation Plan, Global Constraints, Task 10: Export depuis `packages/harvester`, Task 11: Branchement dans la route `POST /harvest/:campaignId/run`, Task 12: Câblage `server.ts` (production), Task 13: Réponse enrichie côté client web, Task 14: Affichage des découvertes dans `HarvestControl`, Task 15: Vérification finale de bout en bout (+9 more)

### Community 37 - "exactDedupKeyFromSource"
Cohesion: 0.36
Nodes (7): normalizeSmartRecruitersOffer(), fixturesDir, loadFixture(), loadRawOfferPayload(), exactDedupKeyFromSource(), exactDedupKeyFromUrl(), sha1()

### Community 45 - "Global Constraints"
Cohesion: 0.15
Nodes (12): Fiabiliser les filtres de collecte Implementation Plan, Global Constraints, Task 1: `inferContractTypeFromText` reconnaît "stage" (JOB-72), Task 2: Créer `query-filter.ts` — le post-filtre centralisé (JOB-73, partie 1/2), Task 3: Intégrer `query-filter.ts` dans `runCampaign()` (JOB-73, partie 2/2), Task 4: Workday — dériver la recherche de `contractTypes` au lieu de "alternance" en dur (JOB-74, 1/2), Task 5: SmartRecruiters — dériver le pré-filtre de `contractTypes` au lieu de "alternance" en dur (JOB-74, 2/2), Task 6: France Travail — erreur explicite au lieu du `console.warn` silencieux (JOB-64) (+4 more)

### Community 46 - "orchestrator.ts"
Cohesion: 0.06
Nodes (43): HarvestOverridesBodySchema, Connector, ContractType, ContractTypeSchema, buildHarvestQuery(), HarvestOverrides, CampaignConfig, CampaignConfigSchema (+35 more)

### Community 47 - "HarvestQuery"
Cohesion: 0.27
Nodes (7): FRANCE_TRAVAIL_CONNECTOR_ID, francetravailConnector, query, sitemapCrawlerConnector, query, ConnectorContext, HarvestQuery

### Community 48 - "Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters"
Cohesion: 0.18
Nodes (10): Contexte, Découverte automatique de cibles Workday/SmartRecruiters/Talentsoft/DigitalRecruiters, Détection par plateforme, Intégration API/UI, Limites connues (assumées, pas dans le scope de cette itération), Modèle de données, Plafond par collecte, Tests (TDD, comme le reste du projet) (+2 more)

### Community 49 - "digitalrecruiters/normalize.ts"
Cohesion: 0.27
Nodes (5): companyNameFromDomain(), normalizeDigitalRecruitersOffer(), parseLocationFromSlug(), fixturesDir, departmentFromPostalCode()

### Community 50 - "timedHealthCheck"
Cohesion: 0.24
Nodes (7): timedHealthCheck(), ConnectorHealth, HarvestLocation, HarvestLocationSchema, HarvestQuerySchema, HarvestTargets, HarvestTargetsSchema

### Community 51 - "Prompt développeur senior — Fiabiliser les filtres de collecte (contrat / ville / métier)"
Cohesion: 0.20
Nodes (9): 1. Contexte pour l'agent/développeur qui reprend ce ticket, 2. Root causes identifiées (fichier:ligne), 3. Ce qui doit changer (spécification fonctionnelle), 4. Découpage en tickets Linear (par charge de travail), 5. Definition of Done pour l'ensemble, L (grand, 2+ jours), M (moyen, 0.5–1.5 jour), Prompt développeur senior — Fiabiliser les filtres de collecte (contrat / ville / métier) (+1 more)

### Community 54 - "Fiabiliser les filtres de collecte (contrat / ville / métier)"
Cohesion: 0.25
Nodes (7): Ce que change chaque ticket, Contexte, Definition of Done (reprise du ticket parent JOB-61), Décision d'architecture : post-filtre centralisé, Fiabiliser les filtres de collecte (contrat / ville / métier), Limite connue et assumée (France Travail / `mapContractType`), Root causes confirmées par lecture directe du code (2026-08-24)

### Community 59 - "labonnealternance/normalize.ts"
Cohesion: 0.21
Nodes (9): mapContractType(), mapOriginSource(), normalizeLbaOffer(), parseFrenchAddress(), SELF_PARTNER_LABELS, fixturesDir, canonicalizeUrl(), TRACKING_PARAM_PREFIXES (+1 more)

## Ambiguous Edges - Review These
- `Tier 3 headless browser (not implemented)` → `Source: jsonld-generic (Tier 2)`  [AMBIGUOUS]
  docs/sources.md · relation: conceptually_related_to
- `robots.txt/CGU applies only to Tier 2 connectors` → `Source: welcometothejungle (Tier 1, via Algolia)`  [AMBIGUOUS]
  docs/sources.md · relation: conceptually_related_to

## Knowledge Gaps
- **379 isolated node(s):** `name`, `private`, `type`, `test`, `typecheck` (+374 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Tier 3 headless browser (not implemented)` and `Source: jsonld-generic (Tier 2)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `robots.txt/CGU applies only to Tier 2 connectors` and `Source: welcometothejungle (Tier 1, via Algolia)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `vitest` to `digitalrecruiters/client.ts`, `orchestrator.test.ts`, `app.ts`, `api/client.ts`, `talentsoft/client.ts`, `workday/client.ts`, `francetravail/client.ts`, `labonnealternance/client.ts`, `welcometothejungle/client.ts`, `smartrecruiters/client.ts`, `RawOffer`, `normalized-offer.ts`, `connectors/src/index.ts`, `normalizeCompanyName`, `welcometothejungle/normalize.ts`, `sitemap-crawler/client.ts`, `talentsoft/normalize.ts`, `connectors/tsconfig.json`, `core/src/index.ts`, `jest-axe-vitest.d.ts`, `discover-targets.ts`, `exactDedupKeyFromSource`, `orchestrator.ts`, `HarvestQuery`, `digitalrecruiters/normalize.ts`, `timedHealthCheck`, `ResizeObserverStub`, `labonnealternance/normalize.ts`?**
  _High betweenness centrality (0.144) - this node is a cross-community bridge._
- **Why does `types` connect `connectors/tsconfig.json` to `vitest`?**
  _High betweenness centrality (0.018) - this node is a cross-community bridge._
- **Why does `HarvestQuery` connect `HarvestQuery` to `digitalrecruiters/client.ts`, `core/src/index.ts`, `talentsoft/client.ts`, `workday/client.ts`, `francetravail/client.ts`, `labonnealternance/client.ts`, `welcometothejungle/client.ts`, `smartrecruiters/client.ts`, `RawOffer`, `orchestrator.ts`, `timedHealthCheck`, `sitemap-crawler/client.ts`?**
  _High betweenness centrality (0.014) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _379 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `digitalrecruiters/client.ts` be split into smaller, more focused modules?**
  _Cohesion score 0.1383399209486166 - nodes in this community are weakly interconnected._