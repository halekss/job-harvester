# Graph Report - job-harvester  (2026-08-19)

## Corpus Check
- 195 files · ~75,223 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 910 nodes · 1806 edges · 45 communities (42 shown, 3 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 10 edges (avg confidence: 0.76)
- Token cost: 204,506 input · 0 output

## Community Hubs (Navigation)
- Connector Utilities Library
- Connector Contract & Campaign Config
- API App & Routes
- Architecture Decisions & Sources
- Web Package Dependencies
- Web API Client & UI
- Robots Parsing & TalentSoft Client
- API Package Dependencies
- Harvester Package Dependencies
- Workday Connector Client
- France Travail Connector Client
- La Bonne Alternance Connector
- Connectors Package Dependencies
- DB Package Dependencies
- Welcome to the Jungle Connector
- SmartRecruiters Connector
- Core Dedup, Geo & Connector Tests
- Offer Dedup & Normalization Schema
- Core Package Dependencies
- Offer Normalization Across Connectors
- Root Package Scripts
- France Travail Normalize & Dedup Key
- Base TypeScript Config
- Web TypeScript Config
- WTTJ Normalize & URL Canonicalization
- Rate Limiting & Token Bucket
- Core TypeScript Config
- Harvester TypeScript Config
- TalentSoft Normalize
- API TypeScript Config
- Connectors TypeScript Config
- DB TypeScript Config
- Application Event Schema
- Web Test Setup Stubs
- Jest-Axe Vitest Types
- Workday Normalize Tests
- JSON-LD Job Posting Types
- SmartRecruiters Normalize Tests
- Bulk Action Bar Component
- Web App Entry Point

## God Nodes (most connected - your core abstractions)
1. `vitest` - 52 edges
2. `HarvestQuery` - 38 edges
3. `exactDedupKeyFromSource()` - 30 edges
4. `exactDedupKeyFromUrl()` - 24 edges
5. `normalizeCompanyName()` - 20 edges
6. `timedHealthCheck()` - 20 edges
7. `Connector` - 20 edges
8. `RawOffer` - 19 edges
9. `NormalizedOffer` - 19 edges
10. `canonicalizeUrl()` - 18 edges

## Surprising Connections (you probably didn't know these)
- `pnpm workspace configuration` --conceptually_related_to--> `job-harvester README`  [INFERRED]
  pnpm-workspace.yaml → README.md
- `job-harvester README` --references--> `packages/web HTML entry point`  [EXTRACTED]
  README.md → packages/web/index.html
- `Source: jsonld-generic (Tier 2)` --conceptually_related_to--> `Tier 3 headless browser (not implemented)`  [AMBIGUOUS]
  docs/sources.md → docs/adr/0002-cascade-de-tiers-connecteurs.md
- `ADR-0003: No TypeScript build step (tsx-only)` --rationale_for--> `job-harvester README`  [EXTRACTED]
  docs/adr/0003-pas-de-compilation-en-sous-projet-1.md → README.md
- `job-harvester README` --references--> `Campaign alternance-data-hdf`  [EXTRACTED]
  README.md → config/campaigns.yaml

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Tier 0 connectors implementing the shared Connector contract against official market-wide APIs** — docs_sources_labonnealternance, docs_sources_francetravail, docs_superpowers_specs_2026_08_15_labonnealternance_e2e_design_connector_contract [INFERRED 0.85]
- **Tier 1 connectors against unauthenticated ATS/search JSON endpoints** — docs_sources_workday, docs_sources_smartrecruiters, docs_sources_welcometothejungle, docs_sources_talentsoft, docs_sources_digitalrecruiters [INFERRED 0.75]
- **Tier 2 connectors sharing JSON-LD extraction, dynamic robots.txt checks, and headless fallback** — docs_sources_jsonld_generic, docs_sources_sitemap_crawler, docs_adr_0002_cascade_de_tiers_connecteurs_tier_cascade [EXTRACTED 1.00]

## Communities (45 total, 3 thin omitted)

### Community 0 - "Connector Utilities Library"
Cohesion: 0.05
Nodes (47): DomainRateLimiter, sharedLimiter, waitForDomain(), fetchRenderedHtml(), extractJobPostings(), flatten(), hasJobPostingType(), USER_AGENT (+39 more)

### Community 1 - "Connector Contract & Campaign Config"
Cohesion: 0.06
Nodes (44): Connector, HarvestTargetsSchema, ContractTypeSchema, connectorRuns, buildHarvestQuery(), CampaignConfig, CampaignConfigSchema, CampaignsFileSchema (+36 more)

### Community 2 - "API App & Routes"
Cohesion: 0.07
Nodes (40): AppDeps, createApp(), sampleOffer, tmpDirs, registerCampaignRoutes(), CreateEventBodySchema, registerEventRoutes(), registerHarvestRoutes() (+32 more)

### Community 3 - "Architecture Decisions & Sources"
Cohesion: 0.07
Nodes (53): Campaign alternance-data-hdf, Campaign alternance-devweb-hdf, ADR-0001: Hono over Fastify, Tier 3 headless browser (not implemented), ADR-0002: Connector tier cascade, ADR-0003: No TypeScript build step (tsx-only), ADR-0004: rawPayload stores Zod-whitelisted object, never raw payload, ADR index (+45 more)

### Community 4 - "Web Package Dependencies"
Cohesion: 0.04
Nodes (46): jest-axe, jsdom, dependencies, react, react-dom, @tanstack/react-query, @tanstack/react-virtual, devDependencies (+38 more)

### Community 5 - "Web API Client & UI"
Cohesion: 0.09
Nodes (30): Campaign, getCampaigns(), getOffers(), OfferDetail, OfferFilters, OffersPage, OfferSummary, postEvent() (+22 more)

### Community 6 - "Robots Parsing & TalentSoft Client"
Cohesion: 0.09
Nodes (28): getRobots(), isAllowedByRobots(), Robots, robotsCache, robotsParser, checkTalentsoftHealth(), decodeXmlEntities(), detectTalentsoftPlatform() (+20 more)

### Community 7 - "API Package Dependencies"
Cohesion: 0.06
Nodes (34): hono, @hono/node-server, @job-harvester/connectors, @job-harvester/harvester, dependencies, drizzle-orm, hono, @hono/node-server (+26 more)

### Community 8 - "Harvester Package Dependencies"
Cohesion: 0.06
Nodes (30): croner, dependencies, croner, drizzle-orm, @job-harvester/core, @job-harvester/db, ulid, yaml (+22 more)

### Community 9 - "Workday Connector Client"
Cohesion: 0.10
Nodes (25): checkWorkdayHealth(), cxsBaseUrl(), fetchJobDetail(), fetchJobList(), fetchWorkdayOffers(), headers(), HEALTH_CHECK_TARGET, detailResponseBody (+17 more)

### Community 10 - "France Travail Connector Client"
Cohesion: 0.11
Nodes (25): authHeaders(), buildSearchUrl(), CachedToken, checkFranceTravailHealth(), extractDepartement(), fetchFranceTravailOffers(), FRANCE_TRAVAIL_CONNECTOR_ID, FranceTravailClientOptions (+17 more)

### Community 11 - "La Bonne Alternance Connector"
Cohesion: 0.12
Nodes (20): authHeaders(), buildSearchUrl(), checkLbaHealth(), fetchLbaOffers(), LBA_CONNECTOR_ID, LbaClientOptions, query, labonnealternanceConnector (+12 more)

### Community 12 - "Connectors Package Dependencies"
Cohesion: 0.07
Nodes (26): cheerio, dependencies, cheerio, @job-harvester/core, playwright, robots-parser, zod, devDependencies (+18 more)

### Community 13 - "DB Package Dependencies"
Cohesion: 0.08
Nodes (25): better-sqlite3, drizzle-kit, dependencies, better-sqlite3, drizzle-orm, @job-harvester/core, devDependencies, drizzle-kit (+17 more)

### Community 14 - "Welcome to the Jungle Connector"
Cohesion: 0.13
Nodes (19): buildParams(), checkWttjHealth(), fetchWttjOffers(), getWttjCredentials(), headers(), queryJobsIndex(), credentials, query (+11 more)

### Community 15 - "SmartRecruiters Connector"
Cohesion: 0.13
Nodes (19): checkSmartRecruitersHealth(), fetchPostingDetail(), fetchPostingsList(), fetchSmartRecruitersOffers(), headers(), isAlternanceRelevant(), SMARTRECRUITERS_CONNECTOR_ID, SmartRecruitersClientOptions (+11 more)

### Community 16 - "Core Dedup, Geo & Connector Tests"
Cohesion: 0.12
Nodes (11): query, workdayConnector, fixturesDir, loadFixture(), loadRawOfferPayload(), types, node, LEGAL_SUFFIXES (+3 more)

### Community 17 - "Offer Dedup & Normalization Schema"
Cohesion: 0.13
Nodes (17): FUZZY_MATCH_THRESHOLD, isDuplicate(), isExactDuplicate(), isFuzzyDuplicate(), mergeOffers(), unionSourceRefs(), trigrams(), trigramSimilarity() (+9 more)

### Community 18 - "Core Package Dependencies"
Cohesion: 0.10
Nodes (20): dependencies, ulid, zod, devDependencies, @types/node, typescript, vitest, exports (+12 more)

### Community 19 - "Offer Normalization Across Connectors"
Cohesion: 0.27
Nodes (11): normalizeSmartRecruitersOffer(), WORKDAY_CONNECTOR_ID, normalizeWorkdayOffer(), normalizeJsonLdOffer(), sourceOfferIdFromUrl(), fixturesDir, normalizeCompanyName(), departmentFromPostalCode() (+3 more)

### Community 20 - "Root Package Scripts"
Cohesion: 0.11
Nodes (17): devDependencies, tsx, typescript, vitest, tsx, typescript, vitest, name (+9 more)

### Community 21 - "France Travail Normalize & Dedup Key"
Cohesion: 0.25
Nodes (10): mapContractType(), normalizeFranceTravailOffer(), parseLieuTravail(), resolveApplyUrl(), resolveOriginSource(), fixturesDir, exactDedupKeyFromSource(), exactDedupKeyFromUrl() (+2 more)

### Community 22 - "Base TypeScript Config"
Cohesion: 0.13
Nodes (14): compilerOptions, declaration, esModuleInterop, isolatedModules, lib, module, moduleResolution, noEmit (+6 more)

### Community 23 - "Web TypeScript Config"
Cohesion: 0.14
Nodes (13): compilerOptions, jsx, lib, module, moduleResolution, rootDir, extends, include (+5 more)

### Community 24 - "WTTJ Normalize & URL Canonicalization"
Cohesion: 0.24
Nodes (7): buildCanonicalUrl(), mapRemotePolicy(), normalizeWttjOffer(), fixturesDir, canonicalizeUrl(), TRACKING_PARAM_PREFIXES, TRACKING_PARAMS_EXACT

### Community 25 - "Rate Limiting & Token Bucket"
Cohesion: 0.26
Nodes (6): createRateLimitedFetch(), DEFAULT_RETRY_DELAYS_MS, extractHostname(), RateLimitedFetchOptions, sleep(), TokenBucket

### Community 26 - "Core TypeScript Config"
Cohesion: 0.22
Nodes (8): compilerOptions, rootDir, types, extends, include, node, src, ../../tsconfig.base.json

### Community 27 - "Harvester TypeScript Config"
Cohesion: 0.22
Nodes (8): compilerOptions, rootDir, types, extends, include, node, src, ../../tsconfig.base.json

### Community 28 - "TalentSoft Normalize"
Cohesion: 0.43
Nodes (5): companyNameFromDomain(), findAddressCategory(), normalizeTalentsoftOffer(), parseAddress(), stripReferencePrefix()

### Community 29 - "API TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 30 - "Connectors TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 31 - "DB TypeScript Config"
Cohesion: 0.29
Nodes (6): compilerOptions, rootDir, extends, include, src, ../../tsconfig.base.json

### Community 32 - "Application Event Schema"
Cohesion: 0.40
Nodes (4): ApplicationEvent, ApplicationEventSchema, ApplicationEventType, ApplicationEventTypeSchema

### Community 34 - "Jest-Axe Vitest Types"
Cohesion: 0.33
Nodes (3): Assertion, AsymmetricMatchersContaining, vitest

### Community 35 - "Workday Normalize Tests"
Cohesion: 0.50
Nodes (4): fixturesDir, loadFixture(), loadRawOfferPayload(), target

### Community 36 - "JSON-LD Job Posting Types"
Cohesion: 0.40
Nodes (4): JobPosting, JobPostingSchema, JsonLdRawOffer, JsonLdRawOfferSchema

### Community 37 - "SmartRecruiters Normalize Tests"
Cohesion: 0.67
Nodes (3): fixturesDir, loadFixture(), loadRawOfferPayload()

## Ambiguous Edges - Review These
- `Tier 3 headless browser (not implemented)` → `Source: jsonld-generic (Tier 2)`  [AMBIGUOUS]
  docs/sources.md · relation: conceptually_related_to
- `robots.txt/CGU applies only to Tier 2 connectors` → `Source: welcometothejungle (Tier 1, via Algolia)`  [AMBIGUOUS]
  docs/sources.md · relation: conceptually_related_to

## Knowledge Gaps
- **310 isolated node(s):** `name`, `private`, `type`, `test`, `typecheck` (+305 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **3 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **What is the exact relationship between `Tier 3 headless browser (not implemented)` and `Source: jsonld-generic (Tier 2)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **What is the exact relationship between `robots.txt/CGU applies only to Tier 2 connectors` and `Source: welcometothejungle (Tier 1, via Algolia)`?**
  _Edge tagged AMBIGUOUS (relation: conceptually_related_to) - confidence is low._
- **Why does `vitest` connect `Core Dedup, Geo & Connector Tests` to `Connector Utilities Library`, `Connector Contract & Campaign Config`, `API App & Routes`, `Web API Client & UI`, `Robots Parsing & TalentSoft Client`, `Workday Connector Client`, `France Travail Connector Client`, `La Bonne Alternance Connector`, `Welcome to the Jungle Connector`, `SmartRecruiters Connector`, `Offer Dedup & Normalization Schema`, `Offer Normalization Across Connectors`, `France Travail Normalize & Dedup Key`, `WTTJ Normalize & URL Canonicalization`, `Rate Limiting & Token Bucket`, `TalentSoft Normalize`, `Application Event Schema`, `Web Test Setup Stubs`, `Jest-Axe Vitest Types`, `Workday Normalize Tests`, `SmartRecruiters Normalize Tests`?**
  _High betweenness centrality (0.122) - this node is a cross-community bridge._
- **Why does `HarvestQuery` connect `Connector Utilities Library` to `Connector Contract & Campaign Config`, `Robots Parsing & TalentSoft Client`, `Workday Connector Client`, `France Travail Connector Client`, `La Bonne Alternance Connector`, `Welcome to the Jungle Connector`, `SmartRecruiters Connector`, `Core Dedup, Geo & Connector Tests`, `Offer Normalization Across Connectors`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `types` connect `Core Dedup, Geo & Connector Tests` to `Connectors TypeScript Config`?**
  _High betweenness centrality (0.011) - this node is a cross-community bridge._
- **What connects `name`, `private`, `type` to the rest of the system?**
  _310 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Connector Utilities Library` be split into smaller, more focused modules?**
  _Cohesion score 0.05220288781932617 - nodes in this community are weakly interconnected._