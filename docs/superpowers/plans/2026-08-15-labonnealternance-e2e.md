# labonnealternance end-to-end Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `job-harvester`'s vertical slice: a `labonnealternance` connector whose offers flow through normalization, deduplication, SQLite storage, a local REST API, and a minimal React jobboard — end to end, manually triggerable.

**Architecture:** A pnpm TypeScript monorepo. `packages/core` owns the `NormalizedOffer`/`ApplicationEvent` Zod schemas, the shared `Connector` contract, URL canonicalization, and the two-stage dedup/merge engine — all pure, DB-free. `packages/connectors` implements the `labonnealternance` Tier-0 connector against the real `api.apprentissage.beta.gouv.fr` `/job/v1/search` endpoint. `packages/harvester` orchestrates one campaign against one connector with basic per-domain rate-limiting, calling into `packages/db` (Drizzle + SQLite) to upsert offers and log runs. `packages/api` (Hono) exposes a REST subset over the DB and can trigger a harvest run synchronously. `packages/web` (Vite + React 19 + Tailwind v4) is a minimal offer list with event buttons.

**Tech Stack:** Node 22, pnpm workspaces, TypeScript strict (`NodeNext` module resolution), Zod, Vitest, Hono + `@hono/node-server`, Drizzle ORM + `better-sqlite3` + `drizzle-kit`, `ulid`, `yaml`, Vite + React 19 + `@tanstack/react-query` + Tailwind CSS v4.

**Spec:** `docs/superpowers/specs/2026-08-15-labonnealternance-e2e-design.md`

## Global Constraints

- TypeScript `strict` mode everywhere; no `any` at external boundaries — every network payload is validated with Zod before entering the domain.
- A connector never talks to the DB and never performs deduplication itself — it only produces `RawOffer`s and pure `NormalizedOffer`s.
- Every `normalize` function is pure (no I/O) and is tested offline against a recorded fixture — no live network calls in tests.
- No secrets hardcoded. API tokens are read from environment variables; `.env.example` documents every variable used.
- No recruiter personal data (name, direct email, direct phone) is ever stored on a `NormalizedOffer`, even if present in the raw source payload.
- The database must be fully reconstructable by re-running a harvest without losing `ApplicationEvent` history; events are exportable/reimportable as JSON.
- `pnpm test` and `pnpm typecheck` (run recursively across the workspace) must pass before any commit.
- Collected data stays local — nothing in this slice republishes or redistributes offer content externally.

---

### Task 1: Monorepo scaffolding

**Files:**
- Create: `package.json` (root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`

**Interfaces:**
- Produces: pnpm workspace resolving `packages/*`; `tsconfig.base.json` every package's `tsconfig.json` extends; root scripts `test`, `typecheck`.

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Step 2: Create root `package.json`**

```json
{
  "name": "job-harvester",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "pnpm -r run test",
    "typecheck": "pnpm -r run typecheck",
    "dev:api": "pnpm --filter @job-harvester/api exec tsx watch src/server.ts",
    "dev:web": "pnpm --filter @job-harvester/web run dev",
    "harvest:run": "tsx packages/harvester/src/cli.ts"
  }
}
```

- [ ] **Step 3: Install root dev tooling**

Run: `cd /home/alex_halekss/ProjetsWSL/job-harvester && pnpm add -D -w typescript vitest tsx`
Expected: `package.json` gains a `devDependencies` block with resolved versions; `pnpm-lock.yaml` is created.

- [ ] **Step 4: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": false,
    "noEmit": true
  }
}
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
*.sqlite
*.sqlite-journal
*.sqlite-wal
.env
```

- [ ] **Step 6: Create `.env.example`**

```
# La Bonne Alternance (api.apprentissage.beta.gouv.fr) — Authorization: Bearer <token>
LBA_API_KEY=

# SQLite database file used by the api and harvester
DB_PATH=./job-harvester.sqlite

# YAML file describing harvest campaigns
CAMPAIGNS_FILE=./config/campaigns.yaml

# Local REST API port
PORT=3000
```

- [ ] **Step 7: Commit**

```bash
git add package.json pnpm-workspace.yaml tsconfig.base.json .gitignore .env.example pnpm-lock.yaml
git commit -m "chore: scaffold pnpm workspace and base tsconfig"
```

---

### Task 2: `core` — shared types, `NormalizedOffer`/`ApplicationEvent` schemas, `Connector` contract

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/schemas/normalized-offer.ts`
- Create: `packages/core/src/schemas/application-event.ts`
- Create: `packages/core/src/schemas/connector.ts`
- Create: `packages/core/src/schemas/normalized-offer.test.ts`
- Create: `packages/core/src/schemas/application-event.test.ts`
- Create: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `NormalizedOfferSchema`, `NormalizedOffer`, `ContractTypeSchema`, `ApplicationEventSchema`, `ApplicationEvent`, `ApplicationEventTypeSchema`, `Connector`, `RawOffer`, `HarvestQuery`, `ConnectorContext`, `ConnectorHealth` — all re-exported from `packages/core/src/index.ts`. Every later package imports from `@job-harvester/core`.

- [ ] **Step 1: Create `packages/core/package.json`**

```json
{
  "name": "@job-harvester/core",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm add zod ulid --filter @job-harvester/core && pnpm add -D typescript vitest --filter @job-harvester/core`
Expected: `packages/core/package.json` gains `dependencies`/`devDependencies` with resolved versions.

- [ ] **Step 4: Write the failing schema tests**

```typescript
// packages/core/src/schemas/normalized-offer.test.ts
import { describe, it, expect } from "vitest";
import { NormalizedOfferSchema } from "./normalized-offer.js";

const validOffer = {
  id: "01J000000000000000000000",
  source: "labonnealternance",
  sourceOfferId: "abc-123",
  canonicalUrl: "https://example.com/jobs/1",
  title: "Data Analyst en alternance",
  company: { name: "Acme", normalizedName: "acme" },
  location: { label: "10 Rue de la Paix, 59000 Lille", city: "Lille" },
  contractType: "apprentissage",
  romeCodes: ["M1403"],
  descriptionText: "Description",
  firstSeenAt: "2026-08-15T00:00:00.000Z",
  lastSeenAt: "2026-08-15T00:00:00.000Z",
  lifecycle: "active",
  dedupKey: "url:deadbeef",
  sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc-123", canonicalUrl: "https://example.com/jobs/1" }],
  rawPayload: { any: "thing" },
};

describe("NormalizedOfferSchema", () => {
  it("accepts a minimal valid offer", () => {
    expect(NormalizedOfferSchema.parse(validOffer)).toMatchObject({ title: "Data Analyst en alternance" });
  });

  it("rejects an offer with an invalid contractType", () => {
    expect(() => NormalizedOfferSchema.parse({ ...validOffer, contractType: "cdi" })).toThrow();
  });

  it("rejects an offer missing romeCodes", () => {
    const { romeCodes: _drop, ...withoutRomeCodes } = validOffer;
    expect(() => NormalizedOfferSchema.parse(withoutRomeCodes)).toThrow();
  });
});
```

```typescript
// packages/core/src/schemas/application-event.test.ts
import { describe, it, expect } from "vitest";
import { ApplicationEventSchema } from "./application-event.js";

describe("ApplicationEventSchema", () => {
  it("accepts a minimal valid event", () => {
    const event = {
      id: "01J000000000000000000001",
      offerId: "01J000000000000000000000",
      type: "applied",
      occurredAt: "2026-08-15T00:00:00.000Z",
    };
    expect(ApplicationEventSchema.parse(event)).toMatchObject({ type: "applied" });
  });

  it("rejects an unknown event type", () => {
    expect(() =>
      ApplicationEventSchema.parse({
        id: "01J000000000000000000001",
        offerId: "01J000000000000000000000",
        type: "ghosted",
        occurredAt: "2026-08-15T00:00:00.000Z",
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 5: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/core test`
Expected: FAIL — `./normalized-offer.js` and `./application-event.js` do not exist yet.

- [ ] **Step 6: Implement `packages/core/src/schemas/normalized-offer.ts`**

```typescript
import { z } from "zod";

export const ContractTypeSchema = z.enum(["apprentissage", "professionnalisation", "stage", "autre"]);
export type ContractType = z.infer<typeof ContractTypeSchema>;

export const RemotePolicySchema = z.enum(["onsite", "hybrid", "remote", "unknown"]);
export type RemotePolicy = z.infer<typeof RemotePolicySchema>;

export const LifecycleSchema = z.enum(["active", "expired", "dead_link"]);
export type Lifecycle = z.infer<typeof LifecycleSchema>;

export const SourceRefSchema = z.object({
  source: z.string(),
  sourceOfferId: z.string(),
  canonicalUrl: z.string(),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const NormalizedOfferSchema = z.object({
  id: z.string(),
  source: z.string(),
  sourceOfferId: z.string(),
  originSource: z.string().optional(),
  canonicalUrl: z.string(),
  applyUrl: z.string().optional(),
  title: z.string(),
  company: z.object({
    name: z.string(),
    normalizedName: z.string(),
    siret: z.string().optional(),
    website: z.string().optional(),
  }),
  location: z.object({
    label: z.string(),
    city: z.string(),
    postalCode: z.string().optional(),
    department: z.string().optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
  }),
  contractType: ContractTypeSchema,
  durationMonths: z.number().optional(),
  startDate: z.string().optional(),
  romeCodes: z.array(z.string()),
  descriptionText: z.string(),
  descriptionHtml: z.string().optional(),
  salary: z
    .object({
      min: z.number().optional(),
      max: z.number().optional(),
      period: z.enum(["hourly", "monthly", "yearly"]).optional(),
      currency: z.string().optional(),
    })
    .optional(),
  remotePolicy: RemotePolicySchema.optional(),
  postedAt: z.string().optional(),
  expiresAt: z.string().optional(),
  firstSeenAt: z.string(),
  lastSeenAt: z.string(),
  lifecycle: LifecycleSchema,
  dedupKey: z.string(),
  sourceRefs: z.array(SourceRefSchema),
  rawPayload: z.unknown(),
});
export type NormalizedOffer = z.infer<typeof NormalizedOfferSchema>;
```

- [ ] **Step 7: Implement `packages/core/src/schemas/application-event.ts`**

```typescript
import { z } from "zod";

export const ApplicationEventTypeSchema = z.enum([
  "applied",
  "spontaneous",
  "followup",
  "interview",
  "rejected",
  "no_reply",
  "archived",
]);
export type ApplicationEventType = z.infer<typeof ApplicationEventTypeSchema>;

export const ApplicationEventSchema = z.object({
  id: z.string(),
  offerId: z.string(),
  type: ApplicationEventTypeSchema,
  occurredAt: z.string(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});
export type ApplicationEvent = z.infer<typeof ApplicationEventSchema>;
```

- [ ] **Step 8: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/core test`
Expected: PASS (6 tests)

- [ ] **Step 9: Implement the `Connector` contract**

```typescript
// packages/core/src/schemas/connector.ts
import { z } from "zod";
import { ContractTypeSchema, type NormalizedOffer } from "./normalized-offer.js";

export const HarvestLocationSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number(),
});
export type HarvestLocation = z.infer<typeof HarvestLocationSchema>;

export const HarvestQuerySchema = z.object({
  campaignId: z.string(),
  keywords: z.array(z.string()),
  romeCodes: z.array(z.string()),
  location: HarvestLocationSchema,
  contractTypes: z.array(ContractTypeSchema),
});
export type HarvestQuery = z.infer<typeof HarvestQuerySchema>;

export interface RawOffer {
  source: string;
  payload: unknown;
}

export interface ConnectorContext {
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
}

export interface ConnectorHealth {
  connectorId: string;
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  message?: string;
}

export interface Connector {
  id: string;
  tier: 0 | 1 | 2;
  supports(query: HarvestQuery): boolean;
  fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer>;
  normalize(raw: RawOffer): NormalizedOffer;
  healthCheck(): Promise<ConnectorHealth>;
}
```

- [ ] **Step 10: Create the package barrel `packages/core/src/index.ts`**

```typescript
export * from "./schemas/normalized-offer.js";
export * from "./schemas/application-event.js";
export * from "./schemas/connector.js";
```

- [ ] **Step 11: Typecheck**

Run: `pnpm --filter @job-harvester/core typecheck`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add packages/core
git commit -m "feat(core): add NormalizedOffer/ApplicationEvent schemas and Connector contract"
```

---

### Task 3: `core` — URL canonicalization

**Files:**
- Create: `packages/core/src/url/canonicalize.ts`
- Create: `packages/core/src/url/canonicalize.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: nothing (pure string function).
- Produces: `canonicalizeUrl(rawUrl: string): string`, exported from `@job-harvester/core`. Used by Task 5 (dedup keys) and Task 9 (LBA normalize).

- [ ] **Step 1: Write the failing test**

```typescript
// packages/core/src/url/canonicalize.test.ts
import { describe, it, expect } from "vitest";
import { canonicalizeUrl } from "./canonicalize.js";

describe("canonicalizeUrl", () => {
  it("collapses the two sample duplicate URLs for offer 6a5a004c8bfdaae34d6a2ea4 to the same canonical string", () => {
    const urlA =
      "https://labonnealternance.apprentissage.beta.gouv.fr/emploi/6a5a004c8bfdaae34d6a2ea4?utm_source=la_bonne_alternance";
    const urlB =
      "https://LaBonneAlternance.apprentissage.beta.gouv.fr/emploi/6a5a004c8bfdaae34d6a2ea4/?utm_source=bonnealternance&utm_medium=metamoteurs-free&from=%2Fbeta%2Frecherche%3Fq%3Ddata%26lieu_label%3DLille";
    expect(canonicalizeUrl(urlA)).toBe(canonicalizeUrl(urlB));
  });

  it("removes utm_*, from, source, ref, gh_src, sid and sorts remaining params", () => {
    const url = "https://Example.com/jobs/42/?b=2&utm_campaign=x&a=1&source=agg&ref=xyz&gh_src=1&sid=1";
    expect(canonicalizeUrl(url)).toBe("https://example.com/jobs/42?a=1&b=2");
  });

  it("strips a trailing slash but keeps a bare root path", () => {
    expect(canonicalizeUrl("https://example.com/jobs/1/")).toBe("https://example.com/jobs/1");
    expect(canonicalizeUrl("https://example.com/")).toBe("https://example.com/");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/core test canonicalize`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `packages/core/src/url/canonicalize.ts`**

```typescript
const TRACKING_PARAM_PREFIXES = ["utm_"];
const TRACKING_PARAMS_EXACT = new Set(["from", "source", "ref", "gh_src", "sid"]);

export function canonicalizeUrl(rawUrl: string): string {
  const url = new URL(rawUrl);
  url.hostname = url.hostname.toLowerCase();

  const keptParams: [string, string][] = [];
  for (const [key, value] of url.searchParams.entries()) {
    const lowerKey = key.toLowerCase();
    if (TRACKING_PARAMS_EXACT.has(lowerKey)) continue;
    if (TRACKING_PARAM_PREFIXES.some((prefix) => lowerKey.startsWith(prefix))) continue;
    keptParams.push([key, value]);
  }
  keptParams.sort(([a], [b]) => a.localeCompare(b));

  url.search = "";
  for (const [key, value] of keptParams) {
    url.searchParams.append(key, value);
  }

  if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
    url.pathname = url.pathname.slice(0, -1);
  }

  return url.toString();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/core test canonicalize`
Expected: PASS (3 tests)

- [ ] **Step 5: Export from the barrel**

Add to `packages/core/src/index.ts`:

```typescript
export * from "./url/canonicalize.js";
```

- [ ] **Step 6: Commit**

```bash
git add packages/core
git commit -m "feat(core): add URL canonicalization"
```

---

### Task 4: `core` — company name normalization and trigram similarity

**Files:**
- Create: `packages/core/src/dedup/company-name.ts`
- Create: `packages/core/src/dedup/company-name.test.ts`
- Create: `packages/core/src/dedup/similarity.ts`
- Create: `packages/core/src/dedup/similarity.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `normalizeCompanyName(name: string): string`, `trigramSimilarity(a: string, b: string): number`. Consumed by Task 5's merge engine.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/src/dedup/company-name.test.ts
import { describe, it, expect } from "vitest";
import { normalizeCompanyName } from "./company-name.js";

describe("normalizeCompanyName", () => {
  it("strips common legal suffixes", () => {
    expect(normalizeCompanyName("Groupe ACME SAS")).toBe("acme");
    expect(normalizeCompanyName("Société Générale SA")).toBe("societe generale");
  });

  it("lowercases and strips accents and punctuation", () => {
    expect(normalizeCompanyName("Électricité de France")).toBe("electricite de france");
  });

  it("collapses repeated whitespace", () => {
    expect(normalizeCompanyName("Acme   Corp")).toBe("acme corp");
  });
});
```

```typescript
// packages/core/src/dedup/similarity.test.ts
import { describe, it, expect } from "vitest";
import { trigramSimilarity } from "./similarity.js";

describe("trigramSimilarity", () => {
  it("returns 1 for identical strings", () => {
    expect(trigramSimilarity("acme", "acme")).toBe(1);
  });

  it("returns 0 for completely different strings", () => {
    expect(trigramSimilarity("acme", "zzzzzzzz")).toBe(0);
  });

  it("returns a high score for near-identical strings", () => {
    expect(trigramSimilarity("data analyst", "data analyste")).toBeGreaterThan(0.7);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/core test dedup`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `packages/core/src/dedup/company-name.ts`**

```typescript
const LEGAL_SUFFIXES = new Set(["sasu", "sas", "sarl", "eurl", "sa", "sci", "scop", "groupe", "group"]);

export function normalizeCompanyName(name: string): string {
  const stripped = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return stripped
    .split(" ")
    .filter((token) => token.length > 0 && !LEGAL_SUFFIXES.has(token))
    .join(" ");
}
```

- [ ] **Step 4: Implement `packages/core/src/dedup/similarity.ts`**

```typescript
function trigrams(value: string): Set<string> {
  const padded = `  ${value} `;
  const grams = new Set<string>();
  for (let i = 0; i < padded.length - 2; i++) {
    grams.add(padded.slice(i, i + 3));
  }
  return grams;
}

export function trigramSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  const gramsA = trigrams(a);
  const gramsB = trigrams(b);
  if (gramsA.size === 0 || gramsB.size === 0) return 0;

  let intersectionSize = 0;
  for (const gram of gramsA) {
    if (gramsB.has(gram)) intersectionSize += 1;
  }
  const unionSize = gramsA.size + gramsB.size - intersectionSize;
  return intersectionSize / unionSize;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/core test dedup`
Expected: PASS (6 tests)

- [ ] **Step 6: Export from the barrel**

Add to `packages/core/src/index.ts`:

```typescript
export * from "./dedup/company-name.js";
export * from "./dedup/similarity.js";
```

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add company name normalization and trigram similarity"
```

---

### Task 5: `core` — exact dedup keys and the merge engine

**Files:**
- Create: `packages/core/src/dedup/dedup-key.ts`
- Create: `packages/core/src/dedup/dedup-key.test.ts`
- Create: `packages/core/src/dedup/merge.ts`
- Create: `packages/core/src/dedup/merge.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `canonicalizeUrl` (Task 3), `normalizeCompanyName`, `trigramSimilarity` (Task 4), `NormalizedOffer` (Task 2).
- Produces: `exactDedupKeyFromUrl(canonicalUrl: string): string`, `isExactDuplicate`, `isFuzzyDuplicate`, `isDuplicate`, `mergeOffers`, `FUZZY_MATCH_THRESHOLD`. Consumed by Task 13's orchestrator.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/core/src/dedup/dedup-key.test.ts
import { describe, it, expect } from "vitest";
import { exactDedupKeyFromUrl } from "./dedup-key.js";

describe("exactDedupKeyFromUrl", () => {
  it("produces the same key for the same canonical URL", () => {
    const key1 = exactDedupKeyFromUrl("https://example.com/jobs/1");
    const key2 = exactDedupKeyFromUrl("https://example.com/jobs/1");
    expect(key1).toBe(key2);
  });

  it("produces different keys for different URLs", () => {
    expect(exactDedupKeyFromUrl("https://example.com/jobs/1")).not.toBe(
      exactDedupKeyFromUrl("https://example.com/jobs/2"),
    );
  });
});
```

```typescript
// packages/core/src/dedup/merge.test.ts
import { describe, it, expect } from "vitest";
import { isDuplicate, mergeOffers } from "./merge.js";
import { exactDedupKeyFromUrl } from "./dedup-key.js";
import type { NormalizedOffer } from "../schemas/normalized-offer.js";

function makeOffer(overrides: Partial<NormalizedOffer>): NormalizedOffer {
  const canonicalUrl = overrides.canonicalUrl ?? "https://example.com/jobs/1";
  return {
    id: "01J0000000000000000000A0",
    source: "labonnealternance",
    sourceOfferId: "abc",
    canonicalUrl,
    title: "Data Analyst",
    company: { name: "Acme SAS", normalizedName: "acme" },
    location: { label: "Lille", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: ["M1403"],
    descriptionText: "short",
    firstSeenAt: "2026-08-10T00:00:00.000Z",
    lastSeenAt: "2026-08-10T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc", canonicalUrl }],
    rawPayload: {},
    ...overrides,
  };
}

describe("isDuplicate", () => {
  it("matches two offers with the same canonicalUrl", () => {
    const a = makeOffer({});
    const b = makeOffer({ id: "01J0000000000000000000B0" });
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("fuzzy-matches offers with the same company/title/city via different URLs", () => {
    const a = makeOffer({ canonicalUrl: "https://hellowork.com/jobs/1" });
    const b = makeOffer({
      id: "01J0000000000000000000B0",
      canonicalUrl: "https://acme.com/careers/1",
      dedupKey: exactDedupKeyFromUrl("https://acme.com/careers/1"),
      company: { name: "ACME", normalizedName: "acme" },
    });
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("does not match unrelated offers", () => {
    const a = makeOffer({});
    const b = makeOffer({
      id: "01J0000000000000000000C0",
      canonicalUrl: "https://other.com/jobs/9",
      dedupKey: exactDedupKeyFromUrl("https://other.com/jobs/9"),
      title: "Développeur web",
      company: { name: "Other Corp", normalizedName: "other corp" },
      location: { label: "Paris", city: "Paris" },
    });
    expect(isDuplicate(a, b)).toBe(false);
  });
});

describe("mergeOffers", () => {
  it("keeps the longer description, the oldest firstSeenAt, and unions sourceRefs", () => {
    const existing = makeOffer({
      descriptionText: "short",
      firstSeenAt: "2026-08-10T00:00:00.000Z",
      lastSeenAt: "2026-08-10T00:00:00.000Z",
    });
    const incoming = makeOffer({
      id: "01J0000000000000000000B0",
      descriptionText: "a much longer and more complete description",
      firstSeenAt: "2026-08-12T00:00:00.000Z",
      lastSeenAt: "2026-08-12T00:00:00.000Z",
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "def", canonicalUrl: "https://example.com/jobs/1" }],
    });

    const merged = mergeOffers(existing, incoming);

    expect(merged.descriptionText).toBe("a much longer and more complete description");
    expect(merged.firstSeenAt).toBe("2026-08-10T00:00:00.000Z");
    expect(merged.lastSeenAt).toBe("2026-08-12T00:00:00.000Z");
    expect(merged.sourceRefs).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/core test dedup`
Expected: FAIL — `dedup-key.js`/`merge.js` not found.

- [ ] **Step 3: Implement `packages/core/src/dedup/dedup-key.ts`**

```typescript
import { createHash } from "node:crypto";

function sha1(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function exactDedupKeyFromUrl(canonicalUrl: string): string {
  return `url:${sha1(canonicalUrl)}`;
}

export function exactDedupKeyFromSource(source: string, sourceOfferId: string): string {
  return `src:${sha1(`${source}::${sourceOfferId}`)}`;
}
```

- [ ] **Step 4: Implement `packages/core/src/dedup/merge.ts`**

```typescript
import type { NormalizedOffer, SourceRef } from "../schemas/normalized-offer.js";
import { normalizeCompanyName } from "./company-name.js";
import { trigramSimilarity } from "./similarity.js";

export const FUZZY_MATCH_THRESHOLD = 0.6;

export function isExactDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  if (a.dedupKey === b.dedupKey) return true;
  return a.source === b.source && a.sourceOfferId === b.sourceOfferId;
}

export function isFuzzyDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  if (a.location.city.toLowerCase() !== b.location.city.toLowerCase()) return false;
  const companySimilarity = trigramSimilarity(normalizeCompanyName(a.company.name), normalizeCompanyName(b.company.name));
  const titleSimilarity = trigramSimilarity(a.title.toLowerCase(), b.title.toLowerCase());
  return companySimilarity >= FUZZY_MATCH_THRESHOLD && titleSimilarity >= FUZZY_MATCH_THRESHOLD;
}

export function isDuplicate(a: NormalizedOffer, b: NormalizedOffer): boolean {
  return isExactDuplicate(a, b) || isFuzzyDuplicate(a, b);
}

function unionSourceRefs(a: SourceRef[], b: SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const result: SourceRef[] = [];
  for (const ref of [...a, ...b]) {
    const key = `${ref.source}::${ref.sourceOfferId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(ref);
  }
  return result;
}

export function mergeOffers(existing: NormalizedOffer, incoming: NormalizedOffer): NormalizedOffer {
  const existingHasAggregator = Boolean(existing.originSource);
  const incomingHasAggregator = Boolean(incoming.originSource);
  const preferredApplyUrl =
    existingHasAggregator && !incomingHasAggregator
      ? (incoming.applyUrl ?? existing.applyUrl)
      : (existing.applyUrl ?? incoming.applyUrl);

  return {
    ...existing,
    descriptionText:
      incoming.descriptionText.length > existing.descriptionText.length ? incoming.descriptionText : existing.descriptionText,
    applyUrl: preferredApplyUrl,
    firstSeenAt: existing.firstSeenAt < incoming.firstSeenAt ? existing.firstSeenAt : incoming.firstSeenAt,
    lastSeenAt: existing.lastSeenAt > incoming.lastSeenAt ? existing.lastSeenAt : incoming.lastSeenAt,
    sourceRefs: unionSourceRefs(existing.sourceRefs, incoming.sourceRefs),
  };
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/core test`
Expected: PASS (all core tests, including the two-URL sample case from Task 3)

- [ ] **Step 6: Export from the barrel and typecheck**

Add to `packages/core/src/index.ts`:

```typescript
export * from "./dedup/dedup-key.js";
export * from "./dedup/merge.js";
```

Run: `pnpm --filter @job-harvester/core typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core
git commit -m "feat(core): add exact dedup keys and the merge engine"
```

---

### Task 6: `docs/sources.md` — La Bonne Alternance entry

**Files:**
- Create: `docs/sources.md`

**Interfaces:**
- Produces: reference documentation consumed by Task 8/9's implementers and by the README (Task 19).

- [ ] **Step 1: Write `docs/sources.md`**

```markdown
# Sources

Statut légal évalué avant écriture de chaque connecteur. `robots.txt`/CGU ne s'appliquent
qu'aux connecteurs Tier 2 (accès par navigateur/DOM) ; les sources Tier 0/1 listées ici sont
consommées via API officielle avec authentification, donc hors périmètre `robots.txt`.

## Tier 0 — `labonnealternance`

- **Domaine** : `api.apprentissage.beta.gouv.fr` (API Apprentissage / La Bonne Alternance)
- **Route utilisée** : `GET /job/v1/search`
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/sources.md
git commit -m "docs: document the labonnealternance source"
```

---

### Task 7: `connectors` — LBA raw types and fixtures

**Files:**
- Create: `packages/connectors/package.json`
- Create: `packages/connectors/tsconfig.json`
- Create: `packages/connectors/src/tier0/labonnealternance/types.ts`
- Create: `fixtures/labonnealternance/offer-direct.json`
- Create: `fixtures/labonnealternance/offer-france-travail.json`

**Interfaces:**
- Consumes: nothing yet.
- Produces: `LbaOfferSchema`, `LbaOffer`, `LbaSearchResponseSchema`, `LbaSearchResponse`. Consumed by Task 8 (client) and Task 9 (normalize).

- [ ] **Step 1: Create `packages/connectors/package.json`**

```json
{
  "name": "@job-harvester/connectors",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/connectors/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm add zod --filter @job-harvester/connectors && pnpm add @job-harvester/core --filter @job-harvester/connectors --workspace && pnpm add -D typescript vitest --filter @job-harvester/connectors`
Expected: `packages/connectors/package.json` lists `@job-harvester/core` as `workspace:*` plus `zod`.

- [ ] **Step 4: Implement `packages/connectors/src/tier0/labonnealternance/types.ts`**

```typescript
import { z } from "zod";

export const LbaGeoPointSchema = z.object({
  type: z.literal("Point"),
  coordinates: z.tuple([z.number(), z.number()]),
});

export const LbaOfferSchema = z.object({
  identifier: z.object({
    id: z.string().nullable(),
    partner_job_id: z.string(),
    partner_label: z.string(),
  }),
  workplace: z.object({
    name: z.string().nullable(),
    legal_name: z.string().nullable(),
    website: z.string().nullable(),
    siret: z.string().nullable(),
    location: z.object({
      address: z.string(),
      geopoint: LbaGeoPointSchema,
    }),
  }),
  apply: z.object({
    url: z.string(),
  }),
  contract: z.object({
    start: z.string().nullable(),
    duration: z.number().nullable(),
    type: z.array(z.enum(["Apprentissage", "Professionnalisation"])),
    remote: z.enum(["onsite", "remote", "hybrid"]).nullable(),
  }),
  offer: z.object({
    title: z.string(),
    description: z.string(),
    rome_codes: z.array(z.string()),
    publication: z.object({
      creation: z.string().nullable(),
      expiration: z.string().nullable(),
    }),
    status: z.enum(["Active", "Filled", "Cancelled"]),
  }),
});
export type LbaOffer = z.infer<typeof LbaOfferSchema>;

export const LbaSearchResponseSchema = z.object({
  jobs: z.array(z.unknown()),
  recruiters: z.array(z.unknown()),
  warnings: z.array(z.object({ message: z.string(), code: z.string() })),
});
export type LbaSearchResponse = z.infer<typeof LbaSearchResponseSchema>;
```

- [ ] **Step 5: Create fixture `fixtures/labonnealternance/offer-direct.json`**

```json
{
  "identifier": {
    "id": "6a5a004c8bfdaae34d6a2ea4",
    "partner_job_id": "6a5a004c8bfdaae34d6a2ea4",
    "partner_label": "offres_emploi_lba"
  },
  "workplace": {
    "name": "Acme Data SAS",
    "legal_name": "ACME DATA",
    "website": "https://acme-data.example",
    "siret": "12345678900012",
    "location": {
      "address": "10 Rue de la Paix, 59000 Lille",
      "geopoint": { "type": "Point", "coordinates": [3.045391, 50.630951] }
    }
  },
  "apply": {
    "url": "https://acme-data.example/careers/data-analyst-alternance"
  },
  "contract": {
    "start": "2026-09-01T00:00:00.000Z",
    "duration": 12,
    "type": ["Apprentissage"],
    "remote": "hybrid"
  },
  "offer": {
    "title": "Data Analyst en alternance",
    "description": "Rejoignez notre équipe data pour analyser nos indicateurs et construire des tableaux de bord BI.",
    "rome_codes": ["M1403"],
    "publication": {
      "creation": "2026-08-01T09:00:00.000Z",
      "expiration": "2026-11-01T00:00:00.000Z"
    },
    "status": "Active"
  }
}
```

- [ ] **Step 6: Create fixture `fixtures/labonnealternance/offer-france-travail.json`**

```json
{
  "identifier": {
    "id": null,
    "partner_job_id": "170WXYZ",
    "partner_label": "France Travail"
  },
  "workplace": {
    "name": "Roquette Frères",
    "legal_name": "ROQUETTE FRERES",
    "website": null,
    "siret": null,
    "location": {
      "address": "80080 Amiens",
      "geopoint": { "type": "Point", "coordinates": [2.292605, 49.903041] }
    }
  },
  "apply": {
    "url": "https://candidat.francetravail.fr/offres/recherche/detail/170WXYZ?utm_source=api-apprentissage"
  },
  "contract": {
    "start": null,
    "duration": 24,
    "type": ["Professionnalisation"],
    "remote": null
  },
  "offer": {
    "title": "Data Quality Analyst en alternance",
    "description": "Contrôle et fiabilisation de la qualité des données industrielles.",
    "rome_codes": ["M1805"],
    "publication": {
      "creation": "2026-07-20T08:00:00.000Z",
      "expiration": null
    },
    "status": "Active"
  }
}
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @job-harvester/connectors typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/connectors fixtures/labonnealternance
git commit -m "feat(connectors): add labonnealternance raw types and fixtures"
```

---

### Task 8: `connectors` — LBA client (search + pagination) and health check

**Files:**
- Create: `packages/connectors/src/tier0/labonnealternance/client.ts`
- Create: `packages/connectors/src/tier0/labonnealternance/client.test.ts`

**Interfaces:**
- Consumes: `HarvestQuery`, `ConnectorHealth` (`@job-harvester/core`, Task 2), `LbaSearchResponseSchema` (Task 7).
- Produces: `fetchLbaOffers(query, options): AsyncIterable<unknown>`, `checkLbaHealth(options): Promise<ConnectorHealth>`. Consumed by Task 9's connector wiring.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/connectors/src/tier0/labonnealternance/client.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchLbaOffers, checkLbaHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

describe("fetchLbaOffers", () => {
  it("yields each job from the search response and sends the Authorization header", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [{ id: 1 }, { id: 2 }], recruiters: [], warnings: [] }), { status: 200 }),
    );

    const results: unknown[] = [];
    for await (const job of fetchLbaOffers(query, { apiKey: "secret", fetchImpl })) {
      results.push(job);
    }

    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _job of fetchLbaOffers(query, { apiKey: "secret", fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkLbaHealth", () => {
  it("reports ok:true on a 200 response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ jobs: [], recruiters: [], warnings: [] }), { status: 200 }));
    const health = await checkLbaHealth({ apiKey: "secret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "labonnealternance", ok: true });
  });

  it("reports ok:false and a message when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const health = await checkLbaHealth({ apiKey: "secret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "labonnealternance", ok: false, message: "network down" });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test client`
Expected: FAIL — `client.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier0/labonnealternance/client.ts`**

```typescript
import type { HarvestQuery, ConnectorHealth } from "@job-harvester/core";
import { LbaSearchResponseSchema } from "./types.js";

const BASE_URL = "https://api.apprentissage.beta.gouv.fr";
export const LBA_CONNECTOR_ID = "labonnealternance";

export interface LbaClientOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
}

function buildSearchUrl(query: Pick<HarvestQuery, "location" | "romeCodes">): URL {
  const url = new URL("/job/v1/search", BASE_URL);
  url.searchParams.set("latitude", String(query.location.lat));
  url.searchParams.set("longitude", String(query.location.lng));
  url.searchParams.set("radius", String(query.location.radiusKm));
  if (query.romeCodes.length > 0) {
    url.searchParams.set("romes", query.romeCodes.join(","));
  }
  return url;
}

function authHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    "User-Agent": "job-harvester/0.1 (personal alternance watch tool)",
  };
}

export async function* fetchLbaOffers(query: HarvestQuery, options: LbaClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildSearchUrl(query);
  const response = await fetchImpl(url, { headers: authHeaders(options.apiKey) });
  if (!response.ok) {
    throw new Error(`labonnealternance search failed: HTTP ${response.status}`);
  }
  const body = await response.json();
  const parsed = LbaSearchResponseSchema.parse(body);
  for (const job of parsed.jobs) {
    yield job;
  }
}

export async function checkLbaHealth(options: LbaClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = buildSearchUrl({ location: { label: "Paris", lat: 48.8566, lng: 2.3522, radiusKm: 5 }, romeCodes: [] });
  try {
    const response = await fetchImpl(url, { headers: authHeaders(options.apiKey) });
    return {
      connectorId: LBA_CONNECTOR_ID,
      ok: response.ok,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      connectorId: LBA_CONNECTOR_ID,
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
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @job-harvester/connectors typecheck`

```bash
git add packages/connectors
git commit -m "feat(connectors): add labonnealternance search client and health check"
```

---

### Task 9: `connectors` — LBA normalize (pure) and connector wiring

**Files:**
- Create: `packages/connectors/src/tier0/labonnealternance/normalize.ts`
- Create: `packages/connectors/src/tier0/labonnealternance/normalize.test.ts`
- Create: `packages/connectors/src/tier0/labonnealternance/connector.ts`
- Create: `packages/connectors/src/tier0/labonnealternance/connector.test.ts`
- Create: `packages/connectors/src/index.ts`

**Interfaces:**
- Consumes: `canonicalizeUrl`, `exactDedupKeyFromUrl`, `normalizeCompanyName`, `NormalizedOffer`, `Connector`, `RawOffer` (`@job-harvester/core`), `LbaOfferSchema` (Task 7), `fetchLbaOffers`/`checkLbaHealth` (Task 8).
- Produces: `normalizeLbaOffer(raw: RawOffer): NormalizedOffer`, `labonnealternanceConnector: Connector`, exported from `@job-harvester/connectors`. Consumed by Task 13 (harvester), Task 16 (api server entry).

- [ ] **Step 1: Write the failing normalize tests**

```typescript
// packages/connectors/src/tier0/labonnealternance/normalize.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeLbaOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/labonnealternance");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeLbaOffer", () => {
  it("normalizes a direct LBA offer with no aggregator origin", () => {
    const offer = normalizeLbaOffer({ source: "labonnealternance", payload: loadFixture("offer-direct.json") });

    expect(offer.source).toBe("labonnealternance");
    expect(offer.sourceOfferId).toBe("6a5a004c8bfdaae34d6a2ea4");
    expect(offer.originSource).toBeUndefined();
    expect(offer.title).toBe("Data Analyst en alternance");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.company.normalizedName).toBe("acme data");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.romeCodes).toEqual(["M1403"]);
    expect(offer.remotePolicy).toBe("hybrid");
  });

  it("sets originSource to the partner name for a rebounded France Travail offer", () => {
    const offer = normalizeLbaOffer({ source: "labonnealternance", payload: loadFixture("offer-france-travail.json") });

    expect(offer.originSource).toBe("France Travail");
    expect(offer.contractType).toBe("professionnalisation");
    expect(offer.location.city).toBe("Amiens");
    expect(offer.remotePolicy).toBe("unknown");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeLbaOffer({ source: "labonnealternance", payload: { nope: true } })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test normalize`
Expected: FAIL — `normalize.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier0/labonnealternance/normalize.ts`**

```typescript
import { ulid } from "ulid";
import { canonicalizeUrl, exactDedupKeyFromUrl, normalizeCompanyName, type ContractType, type NormalizedOffer, type RawOffer } from "@job-harvester/core";
import { LbaOfferSchema } from "./types.js";
import { LBA_CONNECTOR_ID } from "./client.js";

const SELF_PARTNER_LABELS = new Set(["offres_emploi_lba", "recruteurs_lba"]);

function mapContractType(types: string[]): ContractType {
  if (types.includes("Apprentissage")) return "apprentissage";
  if (types.includes("Professionnalisation")) return "professionnalisation";
  return "autre";
}

function mapOriginSource(partnerLabel: string): string | undefined {
  return SELF_PARTNER_LABELS.has(partnerLabel) ? undefined : partnerLabel;
}

// LBA only exposes a free-text address; postal code and city are parsed from its
// trailing "<code postal> <ville>" convention, falling back to the raw string.
function parseFrenchAddress(address: string): { city: string; postalCode?: string; department?: string } {
  const match = address.trim().match(/(\d{5})\s+(.+)$/);
  if (!match) return { city: address.trim() };
  const [, postalCode, city] = match;
  return { city: city.trim(), postalCode, department: postalCode.slice(0, 2) };
}

export function normalizeLbaOffer(raw: RawOffer): NormalizedOffer {
  const parsed = LbaOfferSchema.parse(raw.payload);
  const canonicalUrl = canonicalizeUrl(parsed.apply.url);
  const now = new Date().toISOString();
  const companyName = parsed.workplace.name ?? parsed.workplace.legal_name ?? "Entreprise inconnue";
  const { city, postalCode, department } = parseFrenchAddress(parsed.workplace.location.address);

  return {
    id: ulid(),
    source: LBA_CONNECTOR_ID,
    sourceOfferId: parsed.identifier.partner_job_id,
    originSource: mapOriginSource(parsed.identifier.partner_label),
    canonicalUrl,
    applyUrl: parsed.apply.url,
    title: parsed.offer.title,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
      siret: parsed.workplace.siret ?? undefined,
      website: parsed.workplace.website ?? undefined,
    },
    location: {
      label: parsed.workplace.location.address,
      city,
      postalCode,
      department,
      lat: parsed.workplace.location.geopoint.coordinates[1],
      lng: parsed.workplace.location.geopoint.coordinates[0],
    },
    contractType: mapContractType(parsed.contract.type),
    durationMonths: parsed.contract.duration ?? undefined,
    startDate: parsed.contract.start ?? undefined,
    romeCodes: parsed.offer.rome_codes,
    descriptionText: parsed.offer.description,
    remotePolicy: parsed.contract.remote ?? "unknown",
    postedAt: parsed.offer.publication.creation ?? undefined,
    expiresAt: parsed.offer.publication.expiration ?? undefined,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: LBA_CONNECTOR_ID, sourceOfferId: parsed.identifier.partner_job_id, canonicalUrl }],
    rawPayload: raw.payload,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test normalize`
Expected: PASS (3 tests)

- [ ] **Step 5: Write the failing connector wiring test**

```typescript
// packages/connectors/src/tier0/labonnealternance/connector.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { labonnealternanceConnector } from "./connector.js";
import offerDirect from "../../../../../fixtures/labonnealternance/offer-direct.json" with { type: "json" };

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

describe("labonnealternanceConnector", () => {
  it("declares tier 0 and supports apprentissage/professionnalisation queries", () => {
    expect(labonnealternanceConnector.tier).toBe(0);
    expect(labonnealternanceConnector.supports(query)).toBe(true);
    expect(labonnealternanceConnector.supports({ ...query, contractTypes: ["stage"] })).toBe(false);
  });

  it("fetches raw offers wrapping each job with the connector id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [offerDirect], recruiters: [], warnings: [] }), { status: 200 }),
    );

    const raws = [];
    for await (const raw of labonnealternanceConnector.fetch(query, { fetchImpl, env: { LBA_API_KEY: "secret" } })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "labonnealternance" });
    expect(labonnealternanceConnector.normalize(raws[0]!).title).toBe("Data Analyst en alternance");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test connector`
Expected: FAIL — `connector.ts` not found.

- [ ] **Step 7: Implement `packages/connectors/src/tier0/labonnealternance/connector.ts`**

```typescript
import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchLbaOffers, checkLbaHealth, LBA_CONNECTOR_ID } from "./client.js";
import { normalizeLbaOffer } from "./normalize.js";

export const labonnealternanceConnector: Connector = {
  id: LBA_CONNECTOR_ID,
  tier: 0,

  supports(query: HarvestQuery): boolean {
    return query.contractTypes.some((type) => type === "apprentissage" || type === "professionnalisation");
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    const apiKey = ctx.env.LBA_API_KEY;
    if (!apiKey) {
      throw new Error("LBA_API_KEY is not set");
    }
    for await (const job of fetchLbaOffers(query, { apiKey, fetchImpl: ctx.fetchImpl })) {
      yield { source: LBA_CONNECTOR_ID, payload: job };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeLbaOffer(raw);
  },

  async healthCheck() {
    const apiKey = process.env.LBA_API_KEY;
    if (!apiKey) {
      return { connectorId: LBA_CONNECTOR_ID, ok: false, latencyMs: 0, checkedAt: new Date().toISOString(), message: "LBA_API_KEY is not set" };
    }
    return checkLbaHealth({ apiKey });
  },
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test connector`
Expected: PASS (2 tests)

- [ ] **Step 9: Create the package barrel and typecheck**

```typescript
// packages/connectors/src/index.ts
export * from "./tier0/labonnealternance/connector.js";
export * from "./tier0/labonnealternance/normalize.js";
```

Run: `pnpm --filter @job-harvester/connectors typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): implement labonnealternance normalize and connector wiring"
```

---

### Task 10: `db` — Drizzle schema and migrations

**Files:**
- Create: `packages/db/package.json`
- Create: `packages/db/tsconfig.json`
- Create: `packages/db/drizzle.config.ts`
- Create: `packages/db/src/schema.ts`

**Interfaces:**
- Produces: `offers`, `applicationEvents`, `connectorRuns`, `campaigns` Drizzle table definitions. Consumed by Task 11 (mapper/client) and Task 14-16 (api routes).

- [ ] **Step 1: Create `packages/db/package.json`**

```json
{
  "name": "@job-harvester/db",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "migrate:generate": "drizzle-kit generate"
  }
}
```

- [ ] **Step 2: Create `packages/db/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm add drizzle-orm better-sqlite3 --filter @job-harvester/db && pnpm add @job-harvester/core --filter @job-harvester/db --workspace && pnpm add -D typescript vitest drizzle-kit @types/better-sqlite3 --filter @job-harvester/db`

- [ ] **Step 4: Implement `packages/db/src/schema.ts`**

```typescript
import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const offers = sqliteTable("offers", {
  id: text("id").primaryKey(),
  source: text("source").notNull(),
  sourceOfferId: text("source_offer_id").notNull(),
  originSource: text("origin_source"),
  canonicalUrl: text("canonical_url").notNull(),
  applyUrl: text("apply_url"),
  title: text("title").notNull(),
  companyName: text("company_name").notNull(),
  companyNormalizedName: text("company_normalized_name").notNull(),
  companySiret: text("company_siret"),
  companyWebsite: text("company_website"),
  locationLabel: text("location_label").notNull(),
  city: text("city").notNull(),
  postalCode: text("postal_code"),
  department: text("department"),
  lat: real("lat"),
  lng: real("lng"),
  contractType: text("contract_type").notNull(),
  durationMonths: integer("duration_months"),
  startDate: text("start_date"),
  romeCodes: text("rome_codes", { mode: "json" }).notNull().$type<string[]>(),
  descriptionText: text("description_text").notNull(),
  descriptionHtml: text("description_html"),
  salary: text("salary", { mode: "json" }).$type<{ min?: number; max?: number; period?: string; currency?: string }>(),
  remotePolicy: text("remote_policy"),
  postedAt: text("posted_at"),
  expiresAt: text("expires_at"),
  firstSeenAt: text("first_seen_at").notNull(),
  lastSeenAt: text("last_seen_at").notNull(),
  lifecycle: text("lifecycle").notNull(),
  dedupKey: text("dedup_key").notNull(),
  sourceRefs: text("source_refs", { mode: "json" })
    .notNull()
    .$type<Array<{ source: string; sourceOfferId: string; canonicalUrl: string }>>(),
  rawPayload: text("raw_payload", { mode: "json" }).notNull(),
});

export const applicationEvents = sqliteTable("application_events", {
  id: text("id").primaryKey(),
  offerId: text("offer_id")
    .notNull()
    .references(() => offers.id),
  type: text("type").notNull(),
  occurredAt: text("occurred_at").notNull(),
  channel: text("channel"),
  notes: text("notes"),
  nextFollowUpAt: text("next_follow_up_at"),
});

export const connectorRuns = sqliteTable("connector_runs", {
  id: text("id").primaryKey(),
  connectorId: text("connector_id").notNull(),
  campaignId: text("campaign_id").notNull(),
  startedAt: text("started_at").notNull(),
  finishedAt: text("finished_at").notNull(),
  rawCount: integer("raw_count").notNull(),
  normalizedCount: integer("normalized_count").notNull(),
  rejectedCount: integer("rejected_count").notNull(),
  httpStatusesSeen: text("http_statuses_seen", { mode: "json" }).notNull().$type<number[]>(),
  ok: integer("ok", { mode: "boolean" }).notNull(),
  errorMessage: text("error_message"),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  config: text("config", { mode: "json" }).notNull(),
});
```

- [ ] **Step 5: Create `packages/db/drizzle.config.ts`**

```typescript
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "sqlite",
});
```

- [ ] **Step 6: Generate the initial migration**

Run: `pnpm --filter @job-harvester/db exec drizzle-kit generate`
Expected: creates `packages/db/migrations/0000_*.sql` and `packages/db/migrations/meta/`.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @job-harvester/db typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/db
git commit -m "feat(db): add Drizzle schema and initial migration"
```

---

### Task 11: `db` — client, offer row mapper, export/import scripts

**Files:**
- Create: `packages/db/src/client.ts`
- Create: `packages/db/src/mapper.ts`
- Create: `packages/db/src/scripts/export-events.ts`
- Create: `packages/db/src/scripts/import-events.ts`
- Create: `packages/db/src/db.test.ts`
- Create: `packages/db/src/index.ts`

**Interfaces:**
- Consumes: `offers`, `applicationEvents`, `connectorRuns` (Task 10), `NormalizedOffer` (`@job-harvester/core`).
- Produces: `createDb(filePath): Db`, `Db` type, `offerToRow`, `rowToOffer`, `exportEvents(dbPath, outPath)`, `importEvents(dbPath, inPath)`. Consumed by Task 13 (harvester) and Task 14-16 (api).

- [ ] **Step 1: Implement `packages/db/src/client.ts`**

```typescript
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as schema from "./schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function createDb(filePath: string) {
  const sqlite = new Database(filePath);
  sqlite.pragma("journal_mode = WAL");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: path.join(__dirname, "..", "migrations") });
  return db;
}
export type Db = ReturnType<typeof createDb>;
```

- [ ] **Step 2: Implement `packages/db/src/mapper.ts`**

```typescript
import type { NormalizedOffer } from "@job-harvester/core";
import type { offers } from "./schema.js";

type OfferRow = typeof offers.$inferSelect;
type OfferInsert = typeof offers.$inferInsert;

export function offerToRow(offer: NormalizedOffer): OfferInsert {
  return {
    id: offer.id,
    source: offer.source,
    sourceOfferId: offer.sourceOfferId,
    originSource: offer.originSource ?? null,
    canonicalUrl: offer.canonicalUrl,
    applyUrl: offer.applyUrl ?? null,
    title: offer.title,
    companyName: offer.company.name,
    companyNormalizedName: offer.company.normalizedName,
    companySiret: offer.company.siret ?? null,
    companyWebsite: offer.company.website ?? null,
    locationLabel: offer.location.label,
    city: offer.location.city,
    postalCode: offer.location.postalCode ?? null,
    department: offer.location.department ?? null,
    lat: offer.location.lat ?? null,
    lng: offer.location.lng ?? null,
    contractType: offer.contractType,
    durationMonths: offer.durationMonths ?? null,
    startDate: offer.startDate ?? null,
    romeCodes: offer.romeCodes,
    descriptionText: offer.descriptionText,
    descriptionHtml: offer.descriptionHtml ?? null,
    salary: offer.salary ?? null,
    remotePolicy: offer.remotePolicy ?? null,
    postedAt: offer.postedAt ?? null,
    expiresAt: offer.expiresAt ?? null,
    firstSeenAt: offer.firstSeenAt,
    lastSeenAt: offer.lastSeenAt,
    lifecycle: offer.lifecycle,
    dedupKey: offer.dedupKey,
    sourceRefs: offer.sourceRefs,
    rawPayload: offer.rawPayload,
  };
}

export function rowToOffer(row: OfferRow): NormalizedOffer {
  return {
    id: row.id,
    source: row.source,
    sourceOfferId: row.sourceOfferId,
    originSource: row.originSource ?? undefined,
    canonicalUrl: row.canonicalUrl,
    applyUrl: row.applyUrl ?? undefined,
    title: row.title,
    company: {
      name: row.companyName,
      normalizedName: row.companyNormalizedName,
      siret: row.companySiret ?? undefined,
      website: row.companyWebsite ?? undefined,
    },
    location: {
      label: row.locationLabel,
      city: row.city,
      postalCode: row.postalCode ?? undefined,
      department: row.department ?? undefined,
      lat: row.lat ?? undefined,
      lng: row.lng ?? undefined,
    },
    contractType: row.contractType as NormalizedOffer["contractType"],
    durationMonths: row.durationMonths ?? undefined,
    startDate: row.startDate ?? undefined,
    romeCodes: row.romeCodes,
    descriptionText: row.descriptionText,
    descriptionHtml: row.descriptionHtml ?? undefined,
    salary: row.salary ?? undefined,
    remotePolicy: (row.remotePolicy ?? undefined) as NormalizedOffer["remotePolicy"],
    postedAt: row.postedAt ?? undefined,
    expiresAt: row.expiresAt ?? undefined,
    firstSeenAt: row.firstSeenAt,
    lastSeenAt: row.lastSeenAt,
    lifecycle: row.lifecycle as NormalizedOffer["lifecycle"],
    dedupKey: row.dedupKey,
    sourceRefs: row.sourceRefs,
    rawPayload: row.rawPayload,
  };
}
```

- [ ] **Step 3: Implement the export/import scripts**

```typescript
// packages/db/src/scripts/export-events.ts
import { writeFileSync } from "node:fs";
import { createDb } from "../client.js";
import { applicationEvents } from "../schema.js";

export function exportEvents(dbPath: string, outPath: string): void {
  const db = createDb(dbPath);
  const rows = db.select().from(applicationEvents).all();
  writeFileSync(outPath, JSON.stringify(rows, null, 2));
}

if (process.argv[1]?.endsWith("export-events.ts") || process.argv[1]?.endsWith("export-events.js")) {
  const [, , dbPath, outPath] = process.argv;
  if (!dbPath || !outPath) throw new Error("usage: export-events.ts <dbPath> <outPath>");
  exportEvents(dbPath, outPath);
}
```

```typescript
// packages/db/src/scripts/import-events.ts
import { readFileSync } from "node:fs";
import { createDb } from "../client.js";
import { applicationEvents } from "../schema.js";

export function importEvents(dbPath: string, inPath: string): void {
  const db = createDb(dbPath);
  const rows = JSON.parse(readFileSync(inPath, "utf-8"));
  for (const row of rows) {
    db.insert(applicationEvents).values(row).onConflictDoNothing().run();
  }
}

if (process.argv[1]?.endsWith("import-events.ts") || process.argv[1]?.endsWith("import-events.js")) {
  const [, , dbPath, inPath] = process.argv;
  if (!dbPath || !inPath) throw new Error("usage: import-events.ts <dbPath> <inPath>");
  importEvents(dbPath, inPath);
}
```

- [ ] **Step 4: Write the failing round-trip test**

```typescript
// packages/db/src/db.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "./client.js";
import { offers, applicationEvents } from "./schema.js";
import { offerToRow, rowToOffer } from "./mapper.js";
import { exportEvents } from "./scripts/export-events.js";
import { importEvents } from "./scripts/import-events.js";
import type { NormalizedOffer } from "@job-harvester/core";

const tmpDirs: string[] = [];
function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-db-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sampleOffer: NormalizedOffer = {
  id: "01J0000000000000000000A0",
  source: "labonnealternance",
  sourceOfferId: "abc",
  canonicalUrl: "https://example.com/jobs/1",
  title: "Data Analyst",
  company: { name: "Acme", normalizedName: "acme" },
  location: { label: "Lille", city: "Lille" },
  contractType: "apprentissage",
  romeCodes: ["M1403"],
  descriptionText: "desc",
  firstSeenAt: "2026-08-15T00:00:00.000Z",
  lastSeenAt: "2026-08-15T00:00:00.000Z",
  lifecycle: "active",
  dedupKey: "url:abc",
  sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc", canonicalUrl: "https://example.com/jobs/1" }],
  rawPayload: { any: "thing" },
};

describe("db migrations and offer round-trip", () => {
  it("applies migrations and round-trips a NormalizedOffer through the mapper", () => {
    const db = createDb(tmpDbPath());
    db.insert(offers).values(offerToRow(sampleOffer)).run();
    const row = db.select().from(offers).all()[0]!;
    expect(rowToOffer(row)).toEqual(sampleOffer);
  });
});

describe("export/import events round-trip", () => {
  it("exports events to JSON and reimports them without loss", () => {
    const dbPath = tmpDbPath();
    const db = createDb(dbPath);
    db.insert(offers).values(offerToRow(sampleOffer)).run();
    db.insert(applicationEvents)
      .values({ id: "01J0000000000000000000E0", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-15T10:00:00.000Z" })
      .run();

    const outPath = path.join(path.dirname(dbPath), "events.json");
    exportEvents(dbPath, outPath);

    const freshDbPath = tmpDbPath();
    const freshDb = createDb(freshDbPath);
    freshDb.insert(offers).values(offerToRow(sampleOffer)).run();
    importEvents(freshDbPath, outPath);

    const importedEvents = freshDb.select().from(applicationEvents).all();
    expect(importedEvents).toHaveLength(1);
    expect(importedEvents[0]).toMatchObject({ type: "applied", offerId: sampleOffer.id });
  });
});
```

- [ ] **Step 5: Run test to verify it fails, then implement, then verify it passes**

Run: `pnpm --filter @job-harvester/db test`
Expected first: FAIL (files exist from steps 1-3 already, so this should mostly pass once the barrel below exists — if any import fails, fix the specific file before continuing).

- [ ] **Step 6: Create the package barrel `packages/db/src/index.ts`**

```typescript
export * from "./schema.js";
export * from "./client.js";
export * from "./mapper.js";
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/db test`
Expected: PASS (2 tests)

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm --filter @job-harvester/db typecheck`

```bash
git add packages/db
git commit -m "feat(db): add client, offer row mapper, and event export/import scripts"
```

---

### Task 12: `harvester` — campaign config schema and YAML loader

**Files:**
- Create: `packages/harvester/package.json`
- Create: `packages/harvester/tsconfig.json`
- Create: `packages/harvester/src/config/campaign-schema.ts`
- Create: `packages/harvester/src/config/load-campaigns.ts`
- Create: `packages/harvester/src/config/load-campaigns.test.ts`
- Create: `config/campaigns.yaml`

**Interfaces:**
- Consumes: `ContractTypeSchema` (`@job-harvester/core`).
- Produces: `CampaignConfig`, `loadCampaigns(filePath): CampaignConfig[]`, `findCampaign(campaigns, id)`. Consumed by Task 13 (orchestrator) and Task 16 (api server entry).

- [ ] **Step 1: Create `packages/harvester/package.json`**

```json
{
  "name": "@job-harvester/harvester",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/harvester/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm add zod yaml ulid --filter @job-harvester/harvester && pnpm add @job-harvester/core @job-harvester/db --filter @job-harvester/harvester --workspace && pnpm add -D typescript vitest --filter @job-harvester/harvester`

- [ ] **Step 4: Write the failing loader test**

```typescript
// packages/harvester/src/config/load-campaigns.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCampaigns, findCampaign } from "./load-campaigns.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeCampaignsFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-campaigns-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(filePath, yaml);
  return filePath;
}

describe("loadCampaigns", () => {
  it("parses a valid campaigns file", () => {
    const filePath = writeCampaignsFile(`
campaigns:
  - id: alternance-data-hdf
    romeCodes: [M1403, M1805]
    keywords: ["data analyst"]
    locations:
      - { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 }
    contractTypes: [apprentissage, professionnalisation]
    schedule: "0 7 * * *"
`);
    const campaigns = loadCampaigns(filePath);
    expect(campaigns).toHaveLength(1);
    expect(findCampaign(campaigns, "alternance-data-hdf")?.romeCodes).toEqual(["M1403", "M1805"]);
  });

  it("rejects a file with an invalid contract type", () => {
    const filePath = writeCampaignsFile(`
campaigns:
  - id: bad
    romeCodes: [M1403]
    keywords: []
    locations: []
    contractTypes: [cdi]
`);
    expect(() => loadCampaigns(filePath)).toThrow();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester test load-campaigns`
Expected: FAIL — modules not found.

- [ ] **Step 6: Implement `packages/harvester/src/config/campaign-schema.ts`**

```typescript
import { z } from "zod";
import { ContractTypeSchema } from "@job-harvester/core";

export const LocationConfigSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number(),
});
export type LocationConfig = z.infer<typeof LocationConfigSchema>;

export const CampaignConfigSchema = z.object({
  id: z.string(),
  romeCodes: z.array(z.string()),
  keywords: z.array(z.string()),
  locations: z.array(LocationConfigSchema),
  contractTypes: z.array(ContractTypeSchema),
});
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;

export const CampaignsFileSchema = z.object({
  campaigns: z.array(CampaignConfigSchema),
});
```

- [ ] **Step 7: Implement `packages/harvester/src/config/load-campaigns.ts`**

```typescript
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { CampaignsFileSchema, type CampaignConfig } from "./campaign-schema.js";

export function loadCampaigns(filePath: string): CampaignConfig[] {
  const raw = readFileSync(filePath, "utf-8");
  return CampaignsFileSchema.parse(parse(raw)).campaigns;
}

export function findCampaign(campaigns: CampaignConfig[], id: string): CampaignConfig | undefined {
  return campaigns.find((campaign) => campaign.id === id);
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester test load-campaigns`
Expected: PASS (2 tests)

- [ ] **Step 9: Create the sample `config/campaigns.yaml` at the repo root**

```yaml
campaigns:
  - id: alternance-data-hdf
    romeCodes: [M1403, M1805]
    keywords: ["data analyst", "data quality", "statistiques", "BI"]
    locations:
      - { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 }
      - { label: "Amiens 80000", lat: 49.903041, lng: 2.292605, radiusKm: 30 }
    contractTypes: [apprentissage, professionnalisation]
    schedule: "0 7 * * *"
```

- [ ] **Step 10: Commit**

```bash
git add packages/harvester config/campaigns.yaml
git commit -m "feat(harvester): add campaign config schema and YAML loader"
```

---

### Task 13: `harvester` — rate limiter and orchestrator

**Files:**
- Create: `packages/harvester/src/rate-limit/domain-rate-limiter.ts`
- Create: `packages/harvester/src/rate-limit/domain-rate-limiter.test.ts`
- Create: `packages/harvester/src/orchestrator.ts`
- Create: `packages/harvester/src/orchestrator.test.ts`
- Create: `packages/harvester/src/index.ts`

**Interfaces:**
- Consumes: `Connector`, `HarvestQuery`, `isDuplicate`, `isFuzzyDuplicate`, `mergeOffers` (`@job-harvester/core`), `Db`, `offers`, `connectorRuns`, `offerToRow`, `rowToOffer` (`@job-harvester/db`), `CampaignConfig` (Task 12).
- Produces: `DomainRateLimiter`, `runCampaign(campaign, connector, db, env): Promise<RunSummary>`. Consumed by Task 16 (api harvest route).

- [ ] **Step 1: Install `drizzle-orm` for the orchestrator's query helpers**

Run: `pnpm add drizzle-orm --filter @job-harvester/harvester`
Expected: `packages/harvester/package.json` gains `drizzle-orm` as a direct dependency (it is imported directly in `orchestrator.ts`, not re-exported by `@job-harvester/db`).

- [ ] **Step 2: Write the failing rate limiter test**

```typescript
// packages/harvester/src/rate-limit/domain-rate-limiter.test.ts
import { describe, it, expect } from "vitest";
import { DomainRateLimiter } from "./domain-rate-limiter.js";

describe("DomainRateLimiter", () => {
  it("delays a second call to the same domain by at least minDelayMs", async () => {
    const limiter = new DomainRateLimiter(50);
    const start = Date.now();
    await limiter.wait("example.com");
    await limiter.wait("example.com");
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });

  it("does not delay calls to different domains", async () => {
    const limiter = new DomainRateLimiter(200);
    const start = Date.now();
    await limiter.wait("a.com");
    await limiter.wait("b.com");
    expect(Date.now() - start).toBeLessThan(100);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester test domain-rate-limiter`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `packages/harvester/src/rate-limit/domain-rate-limiter.ts`**

```typescript
export class DomainRateLimiter {
  private readonly lastRequestAtByDomain = new Map<string, number>();

  constructor(private readonly minDelayMs: number = 1000) {}

  async wait(domain: string): Promise<void> {
    const last = this.lastRequestAtByDomain.get(domain);
    const now = Date.now();
    if (last !== undefined) {
      const elapsed = now - last;
      if (elapsed < this.minDelayMs) {
        await new Promise((resolve) => setTimeout(resolve, this.minDelayMs - elapsed));
      }
    }
    this.lastRequestAtByDomain.set(domain, Date.now());
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester test domain-rate-limiter`
Expected: PASS (2 tests)

- [ ] **Step 6: Write the failing orchestrator test using a fake connector**

```typescript
// packages/harvester/src/orchestrator.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, offers as offersTable, connectorRuns } from "@job-harvester/db";
import type { Connector, NormalizedOffer, RawOffer } from "@job-harvester/core";
import { exactDedupKeyFromUrl } from "@job-harvester/core";
import { runCampaign } from "./orchestrator.js";
import type { CampaignConfig } from "./config/campaign-schema.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-orchestrator-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function makeOffer(id: string, canonicalUrl: string): NormalizedOffer {
  return {
    id,
    source: "fake",
    sourceOfferId: id,
    canonicalUrl,
    title: "Data Analyst",
    company: { name: "Acme", normalizedName: "acme" },
    location: { label: "Lille", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: ["M1403"],
    descriptionText: "desc",
    firstSeenAt: "2026-08-15T00:00:00.000Z",
    lastSeenAt: "2026-08-15T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "fake", sourceOfferId: id, canonicalUrl }],
    rawPayload: {},
  };
}

const campaign: CampaignConfig = {
  id: "test-campaign",
  romeCodes: ["M1403"],
  keywords: [],
  locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
  contractTypes: ["apprentissage"],
};

describe("runCampaign", () => {
  it("normalizes, dedups, and stores offers, then records a run", async () => {
    const rawOffers: RawOffer[] = [
      { source: "fake", payload: { id: "1", url: "https://example.com/jobs/1" } },
      { source: "fake", payload: { id: "1-dup", url: "https://example.com/jobs/1" } },
      { source: "fake", payload: { id: "bad" } },
    ];
    const fakeConnector: Connector = {
      id: "fake",
      tier: 0,
      supports: () => true,
      async *fetch() {
        for (const raw of rawOffers) yield raw;
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url?: string };
        if (!payload.url) throw new Error("invalid payload");
        return makeOffer(payload.id, payload.url);
      },
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    const summary = await runCampaign(campaign, fakeConnector, db, {});

    expect(summary).toMatchObject({ rawCount: 3, normalizedCount: 2, rejectedCount: 1 });
    expect(db.select().from(offersTable).all()).toHaveLength(1);
    expect(db.select().from(connectorRuns).all()).toHaveLength(1);
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester test orchestrator`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement `packages/harvester/src/orchestrator.ts`**

```typescript
import { ulid } from "ulid";
import { eq, and, or } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type HarvestQuery, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { DomainRateLimiter } from "./rate-limit/domain-rate-limiter.js";

export interface RunSummary {
  runId: string;
  rawCount: number;
  normalizedCount: number;
  rejectedCount: number;
}

function upsertOffer(db: Db, normalized: NormalizedOffer): void {
  const exactMatch = db
    .select()
    .from(offersTable)
    .where(
      or(
        eq(offersTable.dedupKey, normalized.dedupKey),
        and(eq(offersTable.source, normalized.source), eq(offersTable.sourceOfferId, normalized.sourceOfferId)),
      ),
    )
    .get();

  if (exactMatch) {
    const merged = mergeOffers(rowToOffer(exactMatch), normalized);
    db.update(offersTable).set(offerToRow(merged)).where(eq(offersTable.id, exactMatch.id)).run();
    return;
  }

  const fuzzyMatch = db
    .select()
    .from(offersTable)
    .all()
    .map(rowToOffer)
    .find((existing) => isFuzzyDuplicate(existing, normalized));

  if (fuzzyMatch) {
    const merged = mergeOffers(fuzzyMatch, normalized);
    db.update(offersTable).set(offerToRow(merged)).where(eq(offersTable.id, merged.id)).run();
    return;
  }

  db.insert(offersTable).values(offerToRow(normalized)).run();
}

export async function runCampaign(
  campaign: CampaignConfig,
  connector: Connector,
  db: Db,
  env: Record<string, string | undefined>,
): Promise<RunSummary> {
  const rateLimiter = new DomainRateLimiter();
  const startedAt = new Date().toISOString();
  let rawCount = 0;
  let normalizedCount = 0;
  let rejectedCount = 0;
  let errorMessage: string | undefined;

  for (const location of campaign.locations) {
    const query: HarvestQuery = {
      campaignId: campaign.id,
      keywords: campaign.keywords,
      romeCodes: campaign.romeCodes,
      location,
      contractTypes: campaign.contractTypes,
    };
    if (!connector.supports(query)) continue;

    await rateLimiter.wait(connector.id);
    try {
      for await (const raw of connector.fetch(query, { fetchImpl: fetch, env })) {
        rawCount += 1;
        try {
          const normalized = connector.normalize(raw);
          normalizedCount += 1;
          upsertOffer(db, normalized);
        } catch {
          rejectedCount += 1;
        }
      }
    } catch (error) {
      errorMessage = error instanceof Error ? error.message : String(error);
    }
  }

  const runId = ulid();
  db.insert(connectorRuns)
    .values({
      id: runId,
      connectorId: connector.id,
      campaignId: campaign.id,
      startedAt,
      finishedAt: new Date().toISOString(),
      rawCount,
      normalizedCount,
      rejectedCount,
      httpStatusesSeen: [],
      ok: errorMessage === undefined,
      errorMessage,
    })
    .run();

  return { runId, rawCount, normalizedCount, rejectedCount };
}
```

- [ ] **Step 9: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester test`
Expected: PASS (all harvester tests)

- [ ] **Step 10: Create the package barrel and typecheck**

```typescript
// packages/harvester/src/index.ts
export * from "./config/campaign-schema.js";
export * from "./config/load-campaigns.js";
export * from "./orchestrator.js";
```

Run: `pnpm --filter @job-harvester/harvester typecheck`
Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/harvester
git commit -m "feat(harvester): add per-domain rate limiter and campaign orchestrator"
```

---

### Task 14: `api` — app scaffolding, `GET /offers`, `GET /offers/:id`

**Files:**
- Create: `packages/api/package.json`
- Create: `packages/api/tsconfig.json`
- Create: `packages/api/src/app.ts`
- Create: `packages/api/src/routes/offers.ts`
- Create: `packages/api/src/app.test.ts`

**Interfaces:**
- Consumes: `Db`, `offers`, `applicationEvents`, `rowToOffer` (`@job-harvester/db`), `Connector` (`@job-harvester/core`), `CampaignConfig` (`@job-harvester/harvester`).
- Produces: `createApp(deps: AppDeps): Hono`, `AppDeps`. `GET /offers`, `GET /offers/:id`. Consumed by Task 15, 16 (more routes on the same app) and Task 20 (smoke test).

- [ ] **Step 1: Create `packages/api/package.json`**

```json
{
  "name": "@job-harvester/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Create `packages/api/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

Run: `pnpm add hono @hono/node-server zod ulid drizzle-orm --filter @job-harvester/api && pnpm add @job-harvester/core @job-harvester/db @job-harvester/harvester @job-harvester/connectors --filter @job-harvester/api --workspace && pnpm add -D typescript vitest --filter @job-harvester/api`

- [ ] **Step 4: Implement `packages/api/src/app.ts`**

```typescript
import { Hono } from "hono";
import type { Connector } from "@job-harvester/core";
import type { Db } from "@job-harvester/db";
import type { CampaignConfig } from "@job-harvester/harvester";
import { registerOfferRoutes } from "./routes/offers.js";

export interface AppDeps {
  db: Db;
  connectors: Connector[];
  campaigns: CampaignConfig[];
  env: Record<string, string | undefined>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerOfferRoutes(app, deps);
  return app;
}
```

- [ ] **Step 5: Implement `packages/api/src/routes/offers.ts`**

```typescript
import type { Hono } from "hono";
import { and, desc, eq, like, sql } from "drizzle-orm";
import { offers as offersTable, applicationEvents, rowToOffer } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

const PAGE_SIZE = 50;

function encodeCursor(row: { postedAt: string | null; firstSeenAt: string; id: string }): string {
  return Buffer.from(JSON.stringify({ postedAt: row.postedAt, firstSeenAt: row.firstSeenAt, id: row.id })).toString("base64url");
}

function decodeCursor(cursor: string): { postedAt: string | null; firstSeenAt: string; id: string } {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
}

function deriveStatus(events: { type: string; occurredAt: string }[]): string {
  if (events.length === 0) return "new";
  return [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt)).at(-1)!.type;
}

export function registerOfferRoutes(app: Hono, { db }: AppDeps): void {
  app.get("/offers", (c) => {
    const city = c.req.query("city");
    const contractType = c.req.query("contractType");
    const q = c.req.query("q");
    const cursorParam = c.req.query("cursor");

    const conditions = [
      city ? eq(offersTable.city, city) : undefined,
      contractType ? eq(offersTable.contractType, contractType) : undefined,
      q ? like(offersTable.title, `%${q}%`) : undefined,
      cursorParam
        ? (() => {
            const cursor = decodeCursor(cursorParam);
            return sql`(${offersTable.postedAt}, ${offersTable.firstSeenAt}, ${offersTable.id}) < (${cursor.postedAt}, ${cursor.firstSeenAt}, ${cursor.id})`;
          })()
        : undefined,
    ].filter((condition) => condition !== undefined);

    const rows = db
      .select()
      .from(offersTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(offersTable.postedAt), desc(offersTable.firstSeenAt))
      .limit(PAGE_SIZE)
      .all();

    const nextCursor = rows.length === PAGE_SIZE ? encodeCursor(rows.at(-1)!) : null;
    return c.json({ offers: rows.map(rowToOffer), nextCursor });
  });

  app.get("/offers/:id", (c) => {
    const row = db.select().from(offersTable).where(eq(offersTable.id, c.req.param("id"))).get();
    if (!row) return c.json({ error: "not_found" }, 404);
    const events = db.select().from(applicationEvents).where(eq(applicationEvents.offerId, row.id)).all();
    return c.json({ offer: rowToOffer(row), status: deriveStatus(events), events });
  });
}
```

- [ ] **Step 6: Write the failing integration test**

```typescript
// packages/api/src/app.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, offers as offersTable, offerToRow } from "@job-harvester/db";
import { exactDedupKeyFromUrl, type NormalizedOffer } from "@job-harvester/core";
import { createApp } from "./app.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-api-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

const sampleOffer: NormalizedOffer = {
  id: "01J0000000000000000000A0",
  source: "labonnealternance",
  sourceOfferId: "abc",
  canonicalUrl: "https://example.com/jobs/1",
  title: "Data Analyst en alternance",
  company: { name: "Acme", normalizedName: "acme" },
  location: { label: "Lille", city: "Lille" },
  contractType: "apprentissage",
  romeCodes: ["M1403"],
  descriptionText: "desc",
  postedAt: "2026-08-10T00:00:00.000Z",
  firstSeenAt: "2026-08-10T00:00:00.000Z",
  lastSeenAt: "2026-08-10T00:00:00.000Z",
  lifecycle: "active",
  dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/1"),
  sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc", canonicalUrl: "https://example.com/jobs/1" }],
  rawPayload: {},
};

describe("GET /offers", () => {
  it("returns stored offers filtered by city", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers?city=Lille");
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0].title).toBe("Data Analyst en alternance");
  });
});

describe("GET /offers/:id", () => {
  it("returns 404 for an unknown offer", async () => {
    const db = createDb(tmpDbPath());
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });
    const res = await app.request("/offers/does-not-exist");
    expect(res.status).toBe(404);
  });

  it("derives status 'new' when there are no events yet", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request(`/offers/${sampleOffer.id}`);
    const body = await res.json();

    expect(body.status).toBe("new");
  });
});
```

- [ ] **Step 7: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/api test`
Expected: PASS (3 tests)

- [ ] **Step 8: Typecheck and commit**

Run: `pnpm --filter @job-harvester/api typecheck`

```bash
git add packages/api
git commit -m "feat(api): add app scaffolding and GET /offers, GET /offers/:id"
```

---

### Task 15: `api` — `POST /offers/:id/events`

**Files:**
- Create: `packages/api/src/routes/events.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/app.test.ts`

**Interfaces:**
- Consumes: `applicationEvents` (`@job-harvester/db`), `AppDeps` (Task 14).
- Produces: `registerEventRoutes(app, deps)`. `POST /offers/:id/events` creates an `ApplicationEvent` row.

- [ ] **Step 1: Add the failing test**

Append to `packages/api/src/app.test.ts`:

```typescript
describe("POST /offers/:id/events", () => {
  it("creates an event and reflects it in the offer's derived status", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const postRes = await app.request(`/offers/${sampleOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied", channel: "email" }),
    });
    expect(postRes.status).toBe(201);

    const getRes = await app.request(`/offers/${sampleOffer.id}`);
    const body = await getRes.json();
    expect(body.status).toBe("applied");
    expect(body.events).toHaveLength(1);
  });

  it("rejects an unknown event type", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request(`/offers/${sampleOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "ghosted" }),
    });
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/api test app`
Expected: FAIL — route does not exist yet (404/no route match).

- [ ] **Step 3: Implement `packages/api/src/routes/events.ts`**

```typescript
import type { Hono } from "hono";
import { ulid } from "ulid";
import { z } from "zod";
import { applicationEvents } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

const CreateEventBodySchema = z.object({
  type: z.enum(["applied", "spontaneous", "followup", "interview", "rejected", "no_reply", "archived"]),
  occurredAt: z.string().optional(),
  channel: z.string().optional(),
  notes: z.string().optional(),
  nextFollowUpAt: z.string().optional(),
});

export function registerEventRoutes(app: Hono, { db }: AppDeps): void {
  app.post("/offers/:id/events", async (c) => {
    const parsed = CreateEventBodySchema.safeParse(await c.req.json());
    if (!parsed.success) {
      return c.json({ error: "invalid_body", issues: parsed.error.issues }, 400);
    }
    const event = {
      id: ulid(),
      offerId: c.req.param("id"),
      type: parsed.data.type,
      occurredAt: parsed.data.occurredAt ?? new Date().toISOString(),
      channel: parsed.data.channel,
      notes: parsed.data.notes,
      nextFollowUpAt: parsed.data.nextFollowUpAt,
    };
    db.insert(applicationEvents).values(event).run();
    return c.json({ event }, 201);
  });
}
```

- [ ] **Step 4: Wire the route into the app**

In `packages/api/src/app.ts`, add the import and registration call:

```typescript
import { registerEventRoutes } from "./routes/events.js";
```

```typescript
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerOfferRoutes(app, deps);
  registerEventRoutes(app, deps);
  return app;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/api test`
Expected: PASS (5 tests)

- [ ] **Step 6: Typecheck and commit**

Run: `pnpm --filter @job-harvester/api typecheck`

```bash
git add packages/api
git commit -m "feat(api): add POST /offers/:id/events"
```

---

### Task 16: `api` — `POST /harvest/:campaignId/run`, `GET /connectors/health`, server entry

**Files:**
- Create: `packages/api/src/routes/harvest.ts`
- Create: `packages/api/src/routes/health.ts`
- Create: `packages/api/src/server.ts`
- Modify: `packages/api/src/app.ts`
- Modify: `packages/api/src/app.test.ts`

**Interfaces:**
- Consumes: `runCampaign` (`@job-harvester/harvester`), `connectorRuns` (`@job-harvester/db`), `labonnealternanceConnector` (`@job-harvester/connectors`), `loadCampaigns` (`@job-harvester/harvester`).
- Produces: `registerHarvestRoutes`, `registerHealthRoutes`, a runnable `server.ts` entry point. Consumed by Task 20 (smoke test).

- [ ] **Step 1: Add the failing tests**

Append to `packages/api/src/app.test.ts`:

```typescript
describe("POST /harvest/:campaignId/run", () => {
  it("returns 404 for an unknown campaign", async () => {
    const db = createDb(tmpDbPath());
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });
    const res = await app.request("/harvest/does-not-exist/run", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

describe("GET /connectors/health", () => {
  it("returns null lastRun for a connector that has never run", async () => {
    const db = createDb(tmpDbPath());
    const fakeConnector = {
      id: "fake",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: unknown) => raw as never,
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const app = createApp({ db, connectors: [fakeConnector], campaigns: [], env: {} });
    const res = await app.request("/connectors/health");
    const body = await res.json();
    expect(body.connectors).toEqual([{ connectorId: "fake", lastRun: null }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/api test app`
Expected: FAIL — routes not registered yet.

- [ ] **Step 3: Implement `packages/api/src/routes/harvest.ts`**

```typescript
import type { Hono } from "hono";
import { runCampaign } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);
    // v1 runs a single campaign against a single connector; connector selection
    // by campaign contents is deferred to the multi-connector orchestrator sub-project.
    const connector = connectors.find((conn) => conn.id === "labonnealternance");
    if (!connector) return c.json({ error: "no_connector_supports_campaign" }, 500);
    const summary = await runCampaign(campaign, connector, db, env);
    return c.json({ summary });
  });
}
```

- [ ] **Step 4: Implement `packages/api/src/routes/health.ts`**

```typescript
import type { Hono } from "hono";
import { desc, eq } from "drizzle-orm";
import { connectorRuns } from "@job-harvester/db";
import type { AppDeps } from "../app.js";

export function registerHealthRoutes(app: Hono, { db, connectors }: AppDeps): void {
  app.get("/connectors/health", (c) => {
    const results = connectors.map((connector) => {
      const lastRun =
        db.select().from(connectorRuns).where(eq(connectorRuns.connectorId, connector.id)).orderBy(desc(connectorRuns.finishedAt)).limit(1).get() ?? null;
      return { connectorId: connector.id, lastRun };
    });
    return c.json({ connectors: results });
  });
}
```

- [ ] **Step 5: Wire both routes into the app**

In `packages/api/src/app.ts`, add imports and registration calls:

```typescript
import { registerHarvestRoutes } from "./routes/harvest.js";
import { registerHealthRoutes } from "./routes/health.js";
```

```typescript
export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerOfferRoutes(app, deps);
  registerEventRoutes(app, deps);
  registerHarvestRoutes(app, deps);
  registerHealthRoutes(app, deps);
  return app;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/api test`
Expected: PASS (7 tests)

- [ ] **Step 7: Implement the server entry point `packages/api/src/server.ts`**

```typescript
import { serve } from "@hono/node-server";
import { createDb } from "@job-harvester/db";
import { loadCampaigns } from "@job-harvester/harvester";
import { labonnealternanceConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

const db = createDb(process.env.DB_PATH ?? "./job-harvester.sqlite");
const campaigns = loadCampaigns(process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml");

const app = createApp({
  db,
  connectors: [labonnealternanceConnector],
  campaigns,
  env: process.env,
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 8: Create the package barrel, install `tsx`, typecheck**

```typescript
// packages/api/src/index.ts
export * from "./app.js";
```

Run: `pnpm add -D tsx --filter @job-harvester/api && pnpm --filter @job-harvester/api typecheck`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/api
git commit -m "feat(api): add POST /harvest/:campaignId/run, GET /connectors/health, and server entry"
```

---

### Task 17: `web` — scaffolding and API client

**Files:**
- Create: `packages/web/package.json`
- Create: `packages/web/tsconfig.json`
- Create: `packages/web/vite.config.ts`
- Create: `packages/web/index.html`
- Create: `packages/web/src/index.css`
- Create: `packages/web/src/api/client.ts`

**Interfaces:**
- Produces: `getOffers()`, `getOfferDetail(id)`, `postEvent(offerId, body)` fetch wrappers against the local API. Consumed by Task 18's components.

- [ ] **Step 1: Create `packages/web/package.json`**

```json
{
  "name": "@job-harvester/web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `pnpm add react react-dom @tanstack/react-query --filter @job-harvester/web && pnpm add -D vite @vitejs/plugin-react typescript @tailwindcss/vite tailwindcss @types/react @types/react-dom --filter @job-harvester/web`

- [ ] **Step 3: Create `packages/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "rootDir": "src"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `packages/web/vite.config.ts`**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      "/offers": "http://localhost:3000",
      "/harvest": "http://localhost:3000",
      "/connectors": "http://localhost:3000",
    },
  },
});
```

- [ ] **Step 5: Create `packages/web/index.html`**

```html
<!doctype html>
<html lang="fr">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>job-harvester</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `packages/web/src/index.css`**

```css
@import "tailwindcss";

@theme {
  --color-background: #0b0d10;
  --color-surface: #14171c;
  --color-border: #262b33;
  --color-text: #e7e9ea;
  --color-text-muted: #9aa1ab;
  --color-accent: #4f8cff;
}

body {
  background-color: var(--color-background);
  color: var(--color-text);
}
```

- [ ] **Step 7: Create `packages/web/src/api/client.ts`**

```typescript
export interface OfferSummary {
  id: string;
  title: string;
  company: { name: string };
  location: { city: string };
  source: string;
  originSource?: string;
  postedAt?: string;
  contractType: string;
}

export interface OfferDetail {
  offer: OfferSummary;
  status: string;
  events: Array<{ id: string; type: string; occurredAt: string }>;
}

export async function getOffers(): Promise<OfferSummary[]> {
  const res = await fetch("/offers");
  if (!res.ok) throw new Error(`GET /offers failed: HTTP ${res.status}`);
  const body = await res.json();
  return body.offers;
}

export async function getOfferDetail(id: string): Promise<OfferDetail> {
  const res = await fetch(`/offers/${id}`);
  if (!res.ok) throw new Error(`GET /offers/${id} failed: HTTP ${res.status}`);
  return res.json();
}

export async function postEvent(
  offerId: string,
  body: { type: string; channel?: string; notes?: string },
): Promise<void> {
  const res = await fetch(`/offers/${offerId}/events`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`POST /offers/${offerId}/events failed: HTTP ${res.status}`);
}
```

- [ ] **Step 8: Commit**

`main.tsx` (the app entry point) is deliberately deferred to Task 18: it imports the `App`
component that task creates, so adding it now would leave this task's typecheck failing.

```bash
git add packages/web
git commit -m "chore(web): scaffold Vite/React/Tailwind app and API client"
```

---

### Task 18: `web` — `OfferTable` and `EventButtons`

**Files:**
- Create: `packages/web/src/App.tsx`
- Create: `packages/web/src/components/OfferTable.tsx`
- Create: `packages/web/src/components/EventButtons.tsx`
- Create: `packages/web/src/main.tsx`

**Interfaces:**
- Consumes: `getOffers`, `postEvent`, `OfferSummary` (Task 17).
- Produces: `App` default export, rendering the offer list end to end.

- [ ] **Step 1: Implement `packages/web/src/components/EventButtons.tsx`**

```tsx
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postEvent } from "../api/client.js";

const EVENT_TYPES: Array<{ type: string; label: string }> = [
  { type: "applied", label: "Candidature" },
  { type: "spontaneous", label: "Spontanée" },
  { type: "followup", label: "Relance" },
  { type: "interview", label: "Entretien" },
  { type: "rejected", label: "Refus" },
  { type: "no_reply", label: "Sans réponse" },
];

export function EventButtons({ offerId }: { offerId: string }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: (type: string) => postEvent(offerId, { type }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["offers"] }),
  });

  return (
    <div className="flex gap-1 flex-wrap">
      {EVENT_TYPES.map(({ type, label }) => (
        <button
          key={type}
          type="button"
          onClick={() => mutation.mutate(type)}
          disabled={mutation.isPending}
          className="text-xs px-2 py-1 rounded border border-[var(--color-border)] text-[var(--color-text)] hover:border-[var(--color-accent)] disabled:opacity-50"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Implement `packages/web/src/components/OfferTable.tsx`**

```tsx
import type { OfferSummary } from "../api/client.js";
import { EventButtons } from "./EventButtons.js";

export function OfferTable({ offers }: { offers: OfferSummary[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
          <th className="py-2 pr-4">Titre</th>
          <th className="py-2 pr-4">Entreprise</th>
          <th className="py-2 pr-4">Ville</th>
          <th className="py-2 pr-4">Source</th>
          <th className="py-2 pr-4 tabular-nums">Publiée</th>
          <th className="py-2 pr-4">Actions</th>
        </tr>
      </thead>
      <tbody>
        {offers.map((offer) => (
          <tr key={offer.id} className="border-b border-[var(--color-border)]">
            <td className="py-2 pr-4">{offer.title}</td>
            <td className="py-2 pr-4">{offer.company.name}</td>
            <td className="py-2 pr-4">{offer.location.city}</td>
            <td className="py-2 pr-4">
              {offer.originSource ? `${offer.originSource} (via ${offer.source})` : offer.source}
            </td>
            <td className="py-2 pr-4 tabular-nums">{offer.postedAt?.slice(0, 10) ?? "—"}</td>
            <td className="py-2 pr-4">
              <EventButtons offerId={offer.id} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 3: Implement `packages/web/src/App.tsx`**

```tsx
import { useQuery } from "@tanstack/react-query";
import { getOffers } from "./api/client.js";
import { OfferTable } from "./components/OfferTable.js";

export default function App() {
  const { data: offers, isLoading, error } = useQuery({ queryKey: ["offers"], queryFn: getOffers });

  return (
    <main className="min-h-screen bg-[var(--color-background)] text-[var(--color-text)] p-6">
      <h1 className="text-xl font-semibold mb-4">job-harvester</h1>
      {isLoading && <p className="text-[var(--color-text-muted)]">Chargement…</p>}
      {error && <p className="text-red-400">Erreur de chargement des offres.</p>}
      {offers && <OfferTable offers={offers} />}
    </main>
  );
}
```

- [ ] **Step 4: Implement `packages/web/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import App from "./App.js";
import "./index.css";

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
```

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @job-harvester/web typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/web
git commit -m "feat(web): add minimal offer table with event action buttons"
```

---

### Task 19: Root README and final `.env.example`

**Files:**
- Create: `README.md`
- Modify: `.env.example`

**Interfaces:**
- Produces: onboarding documentation. No code interface.

- [ ] **Step 1: Confirm `.env.example` matches all env vars actually read in code**

Cross-check against `LBA_API_KEY` (Task 9), `DB_PATH`/`CAMPAIGNS_FILE`/`PORT` (Task 16). No changes expected if Task 1's version was followed exactly; otherwise update `.env.example` to match.

- [ ] **Step 2: Write `README.md`**

```markdown
# job-harvester

Outil personnel de veille et de suivi de candidatures en alternance. Collecte des offres
via des connecteurs multi-sources et les affiche dans un jobboard local de suivi.

## Démarrer

```bash
pnpm install
cp .env.example .env   # renseigner LBA_API_KEY
pnpm --filter @job-harvester/db exec drizzle-kit generate   # si les migrations ne sont pas déjà commitées
pnpm dev:api            # démarre l'API locale sur http://localhost:3000
pnpm dev:web             # démarre le jobboard sur http://localhost:5173 (proxy vers l'API)
```

## Lancer une campagne de collecte

Les campagnes sont déclarées dans `config/campaigns.yaml`. Pour lancer la campagne
`alternance-data-hdf` une fois l'API démarrée :

```bash
curl -X POST http://localhost:3000/harvest/alternance-data-hdf/run
```

La réponse contient un résumé (`rawCount`, `normalizedCount`, `rejectedCount`). Les offres
apparaissent ensuite dans le jobboard (`pnpm dev:web`).

## Ajouter une source

1. Documenter la source dans `docs/sources.md` (endpoint, authentification, statut
   robots.txt/CGU, décision) avant d'écrire le connecteur.
2. Créer un module sous `packages/connectors/src/tier{0,1,2}/<source>/` implémentant
   l'interface `Connector` de `@job-harvester/core` (`supports`, `fetch`, `normalize`,
   `healthCheck`).
3. Ajouter au moins une fixture dans `fixtures/<source>/` et un test de `normalize` hors-ligne.
4. Enregistrer le connecteur dans la liste passée à `createApp` (`packages/api/src/server.ts`).

## Interpréter `GET /connectors/health`

Retourne, pour chaque connecteur enregistré, le dernier run connu
(`rawCount`, `normalizedCount`, `rejectedCount`, `ok`, `errorMessage`). `lastRun: null`
signifie que le connecteur n'a encore jamais été exécuté. Un `rejectedCount` élevé par
rapport à `rawCount` indique un connecteur dont le format de réponse a changé.

## Export/réimport des événements de candidature

```bash
pnpm --filter @job-harvester/db exec tsx src/scripts/export-events.ts ./job-harvester.sqlite ./events-backup.json
pnpm --filter @job-harvester/db exec tsx src/scripts/import-events.ts ./job-harvester.sqlite ./events-backup.json
```

## Obtenir une clé API La Bonne Alternance

Voir `docs/sources.md` pour le détail de l'API. La clé s'obtient sur l'espace développeurs
`https://api.apprentissage.beta.gouv.fr` et se renseigne dans `.env` sous `LBA_API_KEY`.
```

- [ ] **Step 3: Commit**

```bash
git add README.md .env.example
git commit -m "docs: add root README with quickstart, source-onboarding, and health-check guide"
```

---

### Task 20: End-to-end manual verification

**Files:** none (verification only).

**Interfaces:** none — this task exercises the full stack built in Tasks 1-19.

- [ ] **Step 1: Install and typecheck the whole workspace**

Run: `pnpm install && pnpm typecheck`
Expected: no errors across all packages.

- [ ] **Step 2: Run the full test suite**

Run: `pnpm test`
Expected: all packages' test suites pass.

- [ ] **Step 3: Ensure a real `LBA_API_KEY` is present**

Check `.env` has a non-empty `LBA_API_KEY` (obtained per the README). If missing, stop here and obtain it before continuing — the live run in Step 5 needs it.

- [ ] **Step 4: Start the API**

Run (background): `pnpm dev:api`
Expected: log line `job-harvester api listening on http://localhost:3000`.

- [ ] **Step 5: Trigger a live harvest run**

Run: `curl -s -X POST http://localhost:3000/harvest/alternance-data-hdf/run | head -c 500`
Expected: JSON with a `summary` object; `rawCount` and `normalizedCount` greater than 0 if LBA has active offers for the M1403/M1805 ROME codes around Lille/Amiens at the time of the run. If `rejectedCount` is unexpectedly high relative to `rawCount`, compare a raw response sample against `packages/connectors/src/tier0/labonnealternance/types.ts` — the live schema may have drifted from what `docs/sources.md` recorded.

- [ ] **Step 6: Verify the API surface directly**

Run: `curl -s http://localhost:3000/offers | head -c 500` and `curl -s http://localhost:3000/connectors/health`
Expected: `/offers` returns the offers stored in Step 5; `/connectors/health` shows a non-null `lastRun` for `labonnealternance` with `ok: true`.

- [ ] **Step 7: Start the web app and verify in a browser**

Run (background): `pnpm dev:web`
Then use the Playwright browser tool: navigate to `http://localhost:5173`, take a snapshot, confirm the offer table renders with real titles/companies/cities, click one row's "Candidature" button, and confirm (via a fresh snapshot or a `GET /offers/:id` curl check) that the offer's status updates and the table refetches without a full page reload.

- [ ] **Step 8: Stop both dev servers**

Stop the `pnpm dev:api` and `pnpm dev:web` background processes started in Steps 4 and 7.

- [ ] **Step 9: Record results in a session report (per the product spec's Livrable 9)**

Note in the PR/commit description or a follow-up message to the user: which sources were actually covered and the volume obtained (from Step 5's summary), any connector fragility observed (from Step 5's rejectedCount, if nonzero), and confirmation that the deliverables listed in the design spec's "Livrables de ce sous-projet" section are all present.
