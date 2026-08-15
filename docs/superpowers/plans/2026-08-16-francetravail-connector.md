# francetravail connector + multi-connector orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `francetravail` Tier-0 connector (real OAuth2-authenticated API, field mapping verified live) and generalize `POST /harvest/:campaignId/run` so a campaign runs against every connector that supports it, not just `labonnealternance` hardcoded.

**Architecture:** `packages/connectors/src/tier0/francetravail/` mirrors the existing `labonnealternance` connector's file shape (types/client/normalize/connector), implementing the same `Connector` interface from `@job-harvester/core`. The only orchestration-layer change is in `packages/api/src/routes/harvest.ts`: instead of picking one hardcoded connector, it filters `deps.connectors` by `connector.supports(query)` and runs each match, returning one summary per connector. `packages/harvester`'s `runCampaign` itself is unchanged — it already takes one connector per call.

**Tech Stack:** Same as sub-project 1 — TypeScript strict, Zod, Vitest, Hono, Drizzle/SQLite. No new dependencies: `francetravail`'s client only needs `fetch`/`URL`/`URLSearchParams` (built-in) plus `zod`/`ulid`/`@job-harvester/core`, all already installed in `packages/connectors`.

**Spec:** `docs/superpowers/specs/2026-08-16-francetravail-connector-design.md`

## Global Constraints

- TypeScript `strict` mode everywhere; no `any` at external boundaries — every network payload validated with Zod before entering the domain.
- The `francetravail` Zod schema never includes the API's `contact` or `contexteTravail` fields (recruiter PII risk, confirmed present in the live schema even though empty on the captured example) — this is the exact class of bug fixed reactively in `labonnealternance`'s `rawPayload`; here it must not exist in the first place. `rawPayload` stores the Zod-*parsed* (whitelisted) object, never the raw unvalidated payload.
- A connector never talks to the DB and never performs deduplication itself.
- Every `normalize` function is pure and tested offline against a recorded fixture.
- No secrets hardcoded. `FRANCE_TRAVAIL_CLIENT_ID`/`FRANCE_TRAVAIL_CLIENT_SECRET` read from `ConnectorContext.env`/`process.env`, documented in `.env.example` without values.
- `pnpm test` and `pnpm typecheck` (run recursively across the workspace) must pass before any commit.
- Do not touch `tsconfig.base.json` or any package's own `tsconfig.json` — if a strict-mode issue arises, fix it narrowly at the call site (this repo has hit shared-config regressions before; see prior plan's ledger).

---

### Task 1: `connectors` — France Travail raw types and fixtures

**Files:**
- Create: `packages/connectors/src/tier0/francetravail/types.ts`
- Create: `fixtures/francetravail/offer-direct.json`
- Create: `fixtures/francetravail/offer-partner.json`

**Interfaces:**
- Produces: `FranceTravailOfferSchema`, `FranceTravailOffer`, `FranceTravailSearchResponseSchema`. Consumed by Task 2 (client) and Task 3 (normalize).

- [ ] **Step 1: Implement `packages/connectors/src/tier0/francetravail/types.ts`**

```typescript
import { z } from "zod";

export const FranceTravailPartenaireSchema = z.object({
  nom: z.string(),
  url: z.string(),
});

export const FranceTravailOfferSchema = z.object({
  id: z.string(),
  intitule: z.string(),
  description: z.string(),
  dateCreation: z.string(),
  lieuTravail: z.object({
    libelle: z.string(),
    codePostal: z.string().optional(),
  }),
  romeCode: z.string(),
  entreprise: z
    .object({
      nom: z.string().optional(),
    })
    .optional(),
  natureContrat: z.string().optional(),
  alternance: z.boolean().optional(),
  origineOffre: z.object({
    origine: z.string(),
    urlOrigine: z.string().optional(),
    partenaires: z.array(FranceTravailPartenaireSchema).optional(),
  }),
});
export type FranceTravailOffer = z.infer<typeof FranceTravailOfferSchema>;

export const FranceTravailSearchResponseSchema = z.object({
  resultats: z.array(z.unknown()),
});
export type FranceTravailSearchResponse = z.infer<typeof FranceTravailSearchResponseSchema>;
```

Note deliberately absent fields: `contact`, `contexteTravail`, `codeNAF`, `secteurActivite*`, `experienceExige`, `nombrePostes`, `entrepriseAdaptee`, `employeurHandiEngage`, `salaire` — not needed for `NormalizedOffer` and, for `contact` specifically, a confirmed PII risk to exclude by construction.

- [ ] **Step 2: Create fixture `fixtures/francetravail/offer-direct.json`** (offer served directly by France Travail, no partner relay — `origine: "1"`)

```json
{
  "id": "170ABCD",
  "intitule": "Data Analyst en alternance",
  "description": "Rejoignez notre équipe pour analyser nos indicateurs de performance et construire des tableaux de bord.",
  "dateCreation": "2026-08-01T09:00:00.000Z",
  "lieuTravail": {
    "libelle": "59 - Lille",
    "codePostal": "59000"
  },
  "romeCode": "M1403",
  "entreprise": {
    "nom": "Acme Data SAS"
  },
  "natureContrat": "Cont. apprentissage",
  "alternance": true,
  "origineOffre": {
    "origine": "1",
    "urlOrigine": "https://candidat.francetravail.fr/offres/recherche/detail/170ABCD"
  }
}
```

- [ ] **Step 3: Create fixture `fixtures/francetravail/offer-partner.json`** (offer relayed by a partner ATS — `origine: "2"`, has `partenaires[]`)

```json
{
  "id": "170WXYZ",
  "intitule": "Développeur Web en alternance",
  "description": "Contrat en alternance pour renforcer notre équipe technique sur des projets web full-stack.",
  "dateCreation": "2026-07-20T08:00:00.000Z",
  "lieuTravail": {
    "libelle": "80 - Amiens",
    "codePostal": "80000"
  },
  "romeCode": "M1805",
  "entreprise": {
    "nom": "TechCorp Solutions"
  },
  "natureContrat": "Cont. professionnalisation",
  "alternance": true,
  "origineOffre": {
    "origine": "2",
    "urlOrigine": "https://candidat.francetravail.fr/offres/recherche/detail/170WXYZ",
    "partenaires": [
      {
        "nom": "JOBTEASER",
        "url": "https://www.jobteaser.com/fr/job-offers/170wxyz-developpeur-web-alternance"
      }
    ]
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @job-harvester/connectors typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier0/francetravail/types.ts fixtures/francetravail
git commit -m "feat(connectors): add francetravail raw types and fixtures"
```

---

### Task 2: `connectors` — France Travail OAuth2 client (token cache + search + health)

**Files:**
- Create: `packages/connectors/src/tier0/francetravail/client.ts`
- Create: `packages/connectors/src/tier0/francetravail/client.test.ts`

**Interfaces:**
- Consumes: `HarvestQuery`, `ConnectorHealth` (`@job-harvester/core`), `FranceTravailSearchResponseSchema` (Task 1).
- Produces: `FRANCE_TRAVAIL_CONNECTOR_ID`, `fetchFranceTravailOffers(query, options): AsyncIterable<unknown>`, `checkFranceTravailHealth(options): Promise<ConnectorHealth>`, `__resetTokenCacheForTests(): void`. Consumed by Task 3's connector wiring.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/connectors/src/tier0/francetravail/client.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchFranceTravailOffers, checkFranceTravailHealth, __resetTokenCacheForTests } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

const tokenResponseBody = JSON.stringify({ access_token: "fake-token", token_type: "Bearer", expires_in: 1499 });

beforeEach(() => {
  __resetTokenCacheForTests();
});

describe("fetchFranceTravailOffers", () => {
  it("fetches a token then yields each item from resultats, sending the Bearer token on search", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [{ id: "1" }, { id: "2" }] }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([{ id: "1" }, { id: "2" }]);
    const searchCall = fetchImpl.mock.calls.find(([input]) => !String(input).includes("access_token"))!;
    const [, init] = searchCall;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
  });

  it("reuses a cached token across two calls instead of requesting a new one", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }
    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }

    const tokenCalls = fetchImpl.mock.calls.filter(([input]) => String(input).includes("access_token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("throws when the search response is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response("nope", { status: 500 });
    });

    const iterate = async () => {
      for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkFranceTravailHealth", () => {
  it("reports ok:true when a token can be obtained", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(tokenResponseBody, { status: 200 }));
    const health = await checkFranceTravailHealth({ clientId: "cid", clientSecret: "csecret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "francetravail", ok: true });
  });

  it("reports ok:false with a message when the token request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 401 }));
    const health = await checkFranceTravailHealth({ clientId: "cid", clientSecret: "csecret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "francetravail", ok: false });
    expect(health.message).toContain("401");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test client`
Expected: FAIL — `./client.ts` (francetravail) not found (note: this will run alongside the existing `labonnealternance` `client.test.ts`; scope your run with `-- francetravail` if your vitest setup needs disambiguation, or just confirm the new file's tests fail while the old ones still pass).

- [ ] **Step 3: Implement `packages/connectors/src/tier0/francetravail/client.ts`**

```typescript
import type { HarvestQuery, ConnectorHealth } from "@job-harvester/core";
import { FranceTravailSearchResponseSchema } from "./types.js";

const TOKEN_URL = "https://entreprise.francetravail.fr/connexion/oauth2/access_token";
const SEARCH_URL = "https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search";
export const FRANCE_TRAVAIL_CONNECTOR_ID = "francetravail";

const TOKEN_SCOPE = "api_offresdemploiv2 o2dsoffre";
const TOKEN_EXPIRY_MARGIN_MS = 30_000;

export interface FranceTravailClientOptions {
  clientId: string;
  clientSecret: string;
  fetchImpl?: typeof fetch;
}

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, CachedToken>();

export function __resetTokenCacheForTests(): void {
  tokenCache.clear();
}

async function getAccessToken(options: FranceTravailClientOptions): Promise<string> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = Date.now();
  const cached = tokenCache.get(options.clientId);
  if (cached && cached.expiresAt > now + TOKEN_EXPIRY_MARGIN_MS) {
    return cached.accessToken;
  }

  const url = new URL(TOKEN_URL);
  url.searchParams.set("realm", "/partenaire");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: options.clientId,
    client_secret: options.clientSecret,
    scope: TOKEN_SCOPE,
  });

  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!response.ok) {
    throw new Error(`francetravail token request failed: HTTP ${response.status}`);
  }
  const data = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(options.clientId, { accessToken: data.access_token, expiresAt: now + data.expires_in * 1000 });
  return data.access_token;
}

// L'API n'accepte pas lat/lng en paramètre de recherche, seulement un code département.
// Les labels de localisation des campagnes contiennent le code postal (ex. "Lille 59000") ;
// on en extrait les deux premiers chiffres comme code département, sans filtre si absent.
function extractDepartement(label: string): string | undefined {
  const match = label.match(/(\d{5})/);
  return match ? match[1]!.slice(0, 2) : undefined;
}

function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL(SEARCH_URL);
  if (query.romeCodes.length > 0) {
    url.searchParams.set("codeROME", query.romeCodes.join(","));
  }
  const departement = extractDepartement(query.location.label);
  if (departement) {
    url.searchParams.set("departement", departement);
  }
  return url;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "User-Agent": "job-harvester/0.1 (personal alternance watch tool)",
  };
}

export async function* fetchFranceTravailOffers(query: HarvestQuery, options: FranceTravailClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const accessToken = await getAccessToken(options);
  const url = buildSearchUrl(query);
  const response = await fetchImpl(url, { headers: authHeaders(accessToken) });
  if (!response.ok) {
    throw new Error(`francetravail search failed: HTTP ${response.status}`);
  }
  const bodyJson = await response.json();
  const parsed = FranceTravailSearchResponseSchema.parse(bodyJson);
  for (const item of parsed.resultats) {
    yield item;
  }
}

export async function checkFranceTravailHealth(options: FranceTravailClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  try {
    await getAccessToken(options);
    return {
      connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
      ok: true,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test client`
Expected: PASS (5 new tests, plus the 4 pre-existing `labonnealternance` client tests still passing)

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @job-harvester/connectors typecheck`

```bash
git add packages/connectors/src/tier0/francetravail/client.ts packages/connectors/src/tier0/francetravail/client.test.ts
git commit -m "feat(connectors): add francetravail OAuth2 client with token caching, search, and health check"
```

---

### Task 3: `connectors` — France Travail normalize and connector wiring

**Files:**
- Create: `packages/connectors/src/tier0/francetravail/normalize.ts`
- Create: `packages/connectors/src/tier0/francetravail/normalize.test.ts`
- Create: `packages/connectors/src/tier0/francetravail/connector.ts`
- Create: `packages/connectors/src/tier0/francetravail/connector.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interfaces:**
- Consumes: `canonicalizeUrl`, `exactDedupKeyFromUrl`, `normalizeCompanyName`, `NormalizedOffer`, `Connector`, `RawOffer`, `ContractType` (`@job-harvester/core`), `FranceTravailOfferSchema` (Task 1), `fetchFranceTravailOffers`/`checkFranceTravailHealth`/`FRANCE_TRAVAIL_CONNECTOR_ID` (Task 2).
- Produces: `normalizeFranceTravailOffer(raw: RawOffer): NormalizedOffer`, `francetravailConnector: Connector`, both re-exported from `@job-harvester/connectors`. Consumed by Task 5 (`server.ts`).

- [ ] **Step 1: Write the failing normalize tests**

```typescript
// packages/connectors/src/tier0/francetravail/normalize.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeFranceTravailOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/francetravail");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeFranceTravailOffer", () => {
  it("normalizes a direct France Travail offer (origine 1, no partner) with no originSource", () => {
    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: loadFixture("offer-direct.json") });

    expect(offer.source).toBe("francetravail");
    expect(offer.sourceOfferId).toBe("170ABCD");
    expect(offer.originSource).toBeUndefined();
    expect(offer.title).toBe("Data Analyst en alternance");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.company.normalizedName).toBe("acme data");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.department).toBe("59");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.romeCodes).toEqual(["M1403"]);
    expect(offer.applyUrl).toBe("https://candidat.francetravail.fr/offres/recherche/detail/170ABCD");
  });

  it("sets originSource to the partner name and applyUrl to the partner link for a relayed offer (origine 2)", () => {
    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: loadFixture("offer-partner.json") });

    expect(offer.originSource).toBe("JOBTEASER");
    expect(offer.contractType).toBe("professionnalisation");
    expect(offer.applyUrl).toBe("https://www.jobteaser.com/fr/job-offers/170wxyz-developpeur-web-alternance");
    expect(offer.location.city).toBe("Amiens");
    expect(offer.location.department).toBe("80");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeFranceTravailOffer({ source: "francetravail", payload: { nope: true } })).toThrow();
  });

  it("never leaks a contact field into rawPayload even if the raw API payload contains one", () => {
    const directFixture = loadFixture("offer-direct.json") as Record<string, unknown>;
    const payloadWithContact = {
      ...directFixture,
      contact: { nom: "Jean Recruteur", telephone: "0600000000", courriel: "jean@example.com" },
    };

    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: payloadWithContact });

    expect(offer.rawPayload).not.toHaveProperty("contact");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("Jean Recruteur");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("telephone");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test normalize`
Expected: FAIL — `francetravail/normalize.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier0/francetravail/normalize.ts`**

```typescript
import { ulid } from "ulid";
import { canonicalizeUrl, exactDedupKeyFromUrl, normalizeCompanyName, type ContractType, type NormalizedOffer, type RawOffer } from "@job-harvester/core";
import { FranceTravailOfferSchema } from "./types.js";
import { FRANCE_TRAVAIL_CONNECTOR_ID } from "./client.js";

function mapContractType(natureContrat: string | undefined): ContractType {
  if (!natureContrat) return "autre";
  if (/apprentissage/i.test(natureContrat)) return "apprentissage";
  if (/professionnalisation/i.test(natureContrat)) return "professionnalisation";
  return "autre";
}

// lieuTravail.libelle suit le format "<code département> - <ville>" ; on retombe sur le
// libellé complet comme ville si le format diffère de ce à quoi s'attend l'API.
function parseLieuTravail(libelle: string): { city: string; department?: string } {
  const match = libelle.match(/^(\d{2,3})\s*-\s*(.+)$/);
  if (!match) return { city: libelle.trim() };
  return { department: match[1], city: match[2]!.trim() };
}

function resolveApplyUrl(parsed: ReturnType<typeof FranceTravailOfferSchema.parse>): string {
  const partner = parsed.origineOffre.partenaires?.[0];
  return partner?.url ?? parsed.origineOffre.urlOrigine ?? `https://candidat.francetravail.fr/offres/recherche/detail/${parsed.id}`;
}

function resolveOriginSource(parsed: ReturnType<typeof FranceTravailOfferSchema.parse>): string | undefined {
  if (parsed.origineOffre.origine === "2") {
    return parsed.origineOffre.partenaires?.[0]?.nom;
  }
  return undefined;
}

export function normalizeFranceTravailOffer(raw: RawOffer): NormalizedOffer {
  const parsed = FranceTravailOfferSchema.parse(raw.payload);
  const applyUrl = resolveApplyUrl(parsed);
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const companyName = parsed.entreprise?.nom ?? "Entreprise inconnue";
  const { city, department } = parseLieuTravail(parsed.lieuTravail.libelle);

  return {
    id: ulid(),
    source: FRANCE_TRAVAIL_CONNECTOR_ID,
    sourceOfferId: parsed.id,
    originSource: resolveOriginSource(parsed),
    canonicalUrl,
    applyUrl,
    title: parsed.intitule,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: parsed.lieuTravail.libelle,
      city,
      postalCode: parsed.lieuTravail.codePostal,
      department,
    },
    contractType: mapContractType(parsed.natureContrat),
    romeCodes: [parsed.romeCode],
    descriptionText: parsed.description,
    remotePolicy: "unknown",
    postedAt: parsed.dateCreation,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: FRANCE_TRAVAIL_CONNECTOR_ID, sourceOfferId: parsed.id, canonicalUrl }],
    rawPayload: parsed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test normalize`
Expected: PASS (4 new tests)

- [ ] **Step 5: Write the failing connector wiring test**

```typescript
// packages/connectors/src/tier0/francetravail/connector.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { francetravailConnector } from "./connector.js";
import { __resetTokenCacheForTests } from "./client.js";
import offerDirect from "../../../../../fixtures/francetravail/offer-direct.json" with { type: "json" };

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

beforeEach(() => {
  __resetTokenCacheForTests();
});

describe("francetravailConnector", () => {
  it("declares tier 0 and supports apprentissage/professionnalisation queries", () => {
    expect(francetravailConnector.tier).toBe(0);
    expect(francetravailConnector.supports(query)).toBe(true);
    expect(francetravailConnector.supports({ ...query, contractTypes: ["stage"] })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "fake-token", expires_in: 1499 }), { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [offerDirect] }), { status: 200 });
    });

    const raws = [];
    for await (const raw of francetravailConnector.fetch(query, {
      fetchImpl,
      env: { FRANCE_TRAVAIL_CLIENT_ID: "cid", FRANCE_TRAVAIL_CLIENT_SECRET: "csecret" },
    })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "francetravail" });
    expect(francetravailConnector.normalize(raws[0]!).title).toBe("Data Analyst en alternance");
  });

  it("throws if FRANCE_TRAVAIL_CLIENT_ID or FRANCE_TRAVAIL_CLIENT_SECRET is missing", async () => {
    const iterate = async () => {
      for await (const _raw of francetravailConnector.fetch(query, { fetchImpl: vi.fn(), env: {} })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/FRANCE_TRAVAIL_CLIENT_ID/);
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test connector`
Expected: FAIL — `francetravail/connector.ts` not found.

- [ ] **Step 7: Implement `packages/connectors/src/tier0/francetravail/connector.ts`**

```typescript
import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchFranceTravailOffers, checkFranceTravailHealth, FRANCE_TRAVAIL_CONNECTOR_ID } from "./client.js";
import { normalizeFranceTravailOffer } from "./normalize.js";

export const francetravailConnector: Connector = {
  id: FRANCE_TRAVAIL_CONNECTOR_ID,
  tier: 0,

  supports(query: HarvestQuery): boolean {
    return query.contractTypes.some((type) => type === "apprentissage" || type === "professionnalisation");
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    const clientId = ctx.env.FRANCE_TRAVAIL_CLIENT_ID;
    const clientSecret = ctx.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("FRANCE_TRAVAIL_CLIENT_ID/FRANCE_TRAVAIL_CLIENT_SECRET is not set");
    }
    for await (const item of fetchFranceTravailOffers(query, { clientId, clientSecret, fetchImpl: ctx.fetchImpl })) {
      yield { source: FRANCE_TRAVAIL_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeFranceTravailOffer(raw);
  },

  async healthCheck() {
    const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
    const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
        ok: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: "FRANCE_TRAVAIL_CLIENT_ID/FRANCE_TRAVAIL_CLIENT_SECRET is not set",
      };
    }
    return checkFranceTravailHealth({ clientId, clientSecret });
  },
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test connector`
Expected: PASS (3 new tests)

- [ ] **Step 9: Update the package barrel**

In `packages/connectors/src/index.ts`, add:

```typescript
export * from "./tier0/francetravail/connector.js";
export * from "./tier0/francetravail/normalize.js";
```

- [ ] **Step 10: Run the full connectors suite and typecheck**

Run: `pnpm --filter @job-harvester/connectors test && pnpm --filter @job-harvester/connectors typecheck`
Expected: all tests pass (labonnealternance's existing tests + all new francetravail tests), typecheck clean.

- [ ] **Step 11: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): implement francetravail normalize and connector wiring"
```

---

### Task 4: `docs/sources.md` — France Travail entry

**Files:**
- Modify: `docs/sources.md`

**Interfaces:** none — documentation only.

- [ ] **Step 1: Replace the existing `francetravail` stub section**

Find the current `## Tier 0 — \`francetravail\` (non couvert par ce sous-projet)` section in `docs/sources.md` and replace it entirely with:

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/sources.md
git commit -m "docs: document the francetravail source"
```

---

### Task 5: `api` — generalize the harvest route, register both connectors, update env docs

**Files:**
- Modify: `packages/api/src/routes/harvest.ts`
- Modify: `packages/api/src/app.test.ts`
- Modify: `packages/api/src/server.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `francetravailConnector` (`@job-harvester/connectors`, Task 3), `RunSummary` (`@job-harvester/harvester`, unchanged).
- Produces: `POST /harvest/:campaignId/run` now returns `{ summaries: RunSummary[] }` instead of `{ summary: RunSummary }` — this is a breaking response-shape change from sub-project 1, confined to this one route.

- [ ] **Step 1: Write the failing tests**

Add `import type { CampaignConfig } from "@job-harvester/harvester";` to the top of
`packages/api/src/app.test.ts`, alongside its existing imports. Then add the following new
`describe` block to the file (keep the existing `describe("POST /harvest/:campaignId/run", ...)`
block with its 404 test untouched — this is a new, separate block):

```typescript
describe("POST /harvest/:campaignId/run — multi-connector", () => {
  function makeFakeConnector(id: string, supportsQuery: boolean, offers: unknown[]) {
    return {
      id,
      tier: 0 as const,
      supports: () => supportsQuery,
      async *fetch() {
        for (const offer of offers) yield { source: id, payload: offer };
      },
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: id, ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
  }

  it("runs only the connectors that support the campaign and returns one summary each", async () => {
    const db = createDb(tmpDbPath());
    const supportedConnector = makeFakeConnector("supported", true, []);
    const unsupportedConnector = makeFakeConnector("unsupported", false, []);
    const campaign: CampaignConfig = {
      id: "multi-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [supportedConnector, unsupportedConnector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/multi-test/run", { method: "POST" });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.summaries).toHaveLength(1);
  });

  it("returns 500 when no registered connector supports the campaign", async () => {
    const db = createDb(tmpDbPath());
    const unsupportedConnector = makeFakeConnector("unsupported", false, []);
    const campaign: CampaignConfig = {
      id: "unsupported-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [unsupportedConnector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/unsupported-test/run", { method: "POST" });
    expect(res.status).toBe(500);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/api test app`
Expected: FAIL — current route only ever picks the connector literally named `"labonnealternance"`, so neither new test's fake connector (named `"supported"`/`"unsupported"`) gets matched correctly.

- [ ] **Step 3: Implement the generalized `packages/api/src/routes/harvest.ts`**

```typescript
import type { Hono } from "hono";
import { runCampaign, type RunSummary } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const supportedConnectors = connectors.filter((connector) =>
      campaign.locations.some((location) =>
        connector.supports({
          campaignId: campaign.id,
          keywords: campaign.keywords,
          romeCodes: campaign.romeCodes,
          location,
          contractTypes: campaign.contractTypes,
        }),
      ),
    );
    if (supportedConnectors.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 500);

    const summaries: RunSummary[] = [];
    for (const connector of supportedConnectors) {
      summaries.push(await runCampaign(campaign, connector, db, env));
    }
    return c.json({ summaries });
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/api test`
Expected: PASS (all tests, including the pre-existing 404 test and the two new multi-connector tests)

- [ ] **Step 5: Update `packages/api/src/server.ts` to register both connectors**

```typescript
import { serve } from "@hono/node-server";
import { createDb } from "@job-harvester/db";
import { loadCampaigns } from "@job-harvester/harvester";
import { labonnealternanceConnector, francetravailConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

const db = createDb(process.env.DB_PATH ?? "./job-harvester.sqlite");
const campaigns = loadCampaigns(process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml");

const app = createApp({
  db,
  connectors: [labonnealternanceConnector, francetravailConnector],
  campaigns,
  env: process.env,
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 6: Update `.env.example`**

Add, after the `LBA_API_KEY` line:

```
# France Travail (api.francetravail.io) — OAuth2 client_credentials
FRANCE_TRAVAIL_CLIENT_ID=
FRANCE_TRAVAIL_CLIENT_SECRET=
```

- [ ] **Step 7: Update `README.md`**

In the section documenting how to obtain API keys, add a paragraph after the La Bonne Alternance one:

```markdown
## Obtenir des identifiants API France Travail

Voir `docs/sources.md` pour le détail de l'API. Les identifiants (`client_id` et
`client_secret`, deux valeurs distinctes) s'obtiennent sur l'espace développeur
`https://francetravail.io` en créant une application avec l'API "Offres d'emploi v2", et se
renseignent dans `.env` sous `FRANCE_TRAVAIL_CLIENT_ID` et `FRANCE_TRAVAIL_CLIENT_SECRET`.
```

Also update the existing "Lancer une campagne de collecte" section's example response to
reflect the new `{ summaries: [...] }` shape instead of `{ summary: {...} }`.

- [ ] **Step 8: Full workspace verification**

Run: `pnpm -r run test && pnpm -r run typecheck`
Expected: all green across all 6 packages.

- [ ] **Step 9: Commit**

```bash
git add packages/api .env.example README.md
git commit -m "feat(api): generalize harvest route to run every connector that supports a campaign, register francetravail"
```

---

### Task 6: End-to-end manual verification (both connectors live)

**Files:** none (verification only).

- [ ] **Step 1: Confirm both connectors' credentials are present**

Check `.env` has non-empty `LBA_API_KEY`, `FRANCE_TRAVAIL_CLIENT_ID`, and `FRANCE_TRAVAIL_CLIENT_SECRET`.

- [ ] **Step 2: Install, typecheck, test the whole workspace**

Run: `pnpm install && pnpm -r run typecheck && pnpm -r run test`
Expected: no errors, all tests pass.

- [ ] **Step 3: Start the API and trigger a live multi-connector harvest**

Start the API (`pnpm dev:api` or the equivalent env-wrapped `tsx` invocation used in sub-project 1's verification), then:

```bash
curl -X POST http://localhost:3000/harvest/alternance-data-hdf/run
```

Expected: `{"summaries":[{...labonnealternance run...},{...francetravail run...}]}`, two entries.

- [ ] **Step 4: Verify connector health for both**

Run: `curl http://localhost:3000/connectors/health`
Expected: two entries, `labonnealternance` and `francetravail`, both with a non-null `lastRun`.

- [ ] **Step 5: Verify dedup fusion across connectors**

Run: `curl http://localhost:3000/offers | python3 -m json.tool` (or equivalent) and check whether any offer's `sourceRefs` contains entries from both `labonnealternance` and `francetravail` — this would confirm the fuzzy-dedup path successfully merged a cross-connector duplicate (expected given the campaign's ROME codes and Hauts-de-France locations overlap between the two sources, as observed during spec research). Absence of a cross-connector merge in this particular run is not a failure — it depends on which offers are live at verification time — but if one exists, confirm `company.name`/`title`/`location.city` are sensible and `applyUrl` was not accidentally dropped.

- [ ] **Step 6: Verify no PII leaked into any stored `francetravail`-sourced offer**

Run: `curl http://localhost:3000/offers | python3 -c "import json,sys; d=json.load(sys.stdin); print([o for o in d['offers'] if o['source']=='francetravail'])"` (or inspect via the DB directly) and confirm no offer's `rawPayload` contains a `contact` key.

- [ ] **Step 7: Stop the API**

Stop the background process started in Step 3.

- [ ] **Step 8: Record results**

Note in a follow-up message to the user: volumes obtained per connector from Step 3's summaries, whether a cross-connector dedup merge was observed in Step 5, and confirmation that Step 6's PII check passed.
