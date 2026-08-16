# workday + smartrecruiters connectors Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two Tier-1 connectors — `workday` and `smartrecruiters` — that target specific
known companies (not the whole market like the Tier-0 connectors), plus the small core/harvester
extensions they need: a `targets` config field, a `locationScoped` connector flag so these two
aren't redundantly invoked once per campaign location, and a shared `stripHtml`/
`inferContractTypeFromText` pair of text utilities (first two sources whose raw description is
HTML and whose contract type isn't given as a structured field).

**Architecture:** `packages/connectors/src/tier1/{workday,smartrecruiters}/` mirror the existing
Tier-0 connectors' file shape (types/client/normalize/connector), implementing the same
`Connector` interface from `@job-harvester/core`. `packages/core` gains `targets` on
`HarvestQuerySchema` and an optional `locationScoped` field on `Connector`.
`packages/harvester`'s `CampaignConfigSchema` gains the matching `targets` field, and
`runCampaign` calls `fetch()` at most once for a `locationScoped: false` connector regardless of
how many locations the campaign has.

**Tech Stack:** Same as prior sub-projects — TypeScript strict, Zod, Vitest, no new
dependencies (both connectors only need `fetch`/`URL`, already-installed `zod`/`ulid`/
`@job-harvester/core`).

**Spec:** `docs/superpowers/specs/2026-08-16-workday-smartrecruiters-connectors-design.md`

## Global Constraints

- TypeScript `strict` mode everywhere; no `any` at external boundaries — every network payload
  validated with Zod before entering the domain.
- Neither connector's Zod schema includes any recruiter contact field (none surfaced in the
  live research for either vendor, but keep the whitelist narrow regardless — only the fields
  actually needed).
- `rawPayload` on every `NormalizedOffer` is assigned from the Zod-*parsed* object, never a raw
  unvalidated payload.
- A connector never talks to the DB and never performs deduplication itself.
- Every `normalize` function is pure (no I/O) and tested offline against a recorded fixture.
- No secrets hardcoded (not applicable to auth here — neither vendor requires credentials — but
  still true for company/tenant identifiers: they come from campaign config, never literals in
  connector code).
- Two fields in this plan's design have **residual uncertainty** flagged in the spec (the exact
  SmartRecruiters list-response envelope key, and the exact Workday job-detail response
  nesting) — implementers of Tasks 4 and 7 must verify these against a live call during
  implementation and correct the plan's assumed shape if it's wrong, the same way sub-project
  1's `/api` path-prefix surprise was caught and fixed.
- `pnpm test` and `pnpm typecheck` (run recursively across the workspace) must pass before any
  commit.
- Do not touch `tsconfig.base.json` or any package's own `tsconfig.json` — fix strict-mode
  issues narrowly at the call site if one arises.

---

### Task 1: `core` — `targets`/`locationScoped` schema extensions + shared text utilities

**Files:**
- Modify: `packages/core/src/schemas/connector.ts`
- Create: `packages/core/src/text/strip-html.ts`
- Create: `packages/core/src/text/strip-html.test.ts`
- Create: `packages/core/src/text/infer-contract-type.ts`
- Create: `packages/core/src/text/infer-contract-type.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `WorkdayTargetSchema`/`WorkdayTarget`, `HarvestTargetsSchema`/`HarvestTargets`
  (added to `HarvestQuerySchema` as `targets`), `Connector.locationScoped?: boolean`,
  `stripHtml(html: string): string`, `inferContractTypeFromText(text: string): ContractType`.
  Consumed by Task 2 (harvester) and Tasks 3-8 (both new connectors).

- [ ] **Step 1: Write the failing tests for the two new text utilities**

```typescript
// packages/core/src/text/strip-html.test.ts
import { describe, it, expect } from "vitest";
import { stripHtml } from "./strip-html.js";

describe("stripHtml", () => {
  it("removes tags while preserving the text content", () => {
    expect(stripHtml("<p>Rejoignez notre <strong>équipe</strong>.</p>")).toBe("Rejoignez notre équipe .");
  });

  it("decodes common HTML entities", () => {
    expect(stripHtml("Data &amp; Analytics &lt;junior&gt;")).toBe("Data & Analytics <junior>");
  });

  it("collapses repeated whitespace and trims", () => {
    expect(stripHtml("<ul><li>Un</li>  <li>Deux</li></ul>")).toBe("Un Deux");
  });
});
```

```typescript
// packages/core/src/text/infer-contract-type.test.ts
import { describe, it, expect } from "vitest";
import { inferContractTypeFromText } from "./infer-contract-type.js";

describe("inferContractTypeFromText", () => {
  it("detects apprentissage", () => {
    expect(inferContractTypeFromText("Alternant en contrat d'apprentissage")).toBe("apprentissage");
  });

  it("detects professionnalisation", () => {
    expect(inferContractTypeFromText("Contrat de professionnalisation proposé")).toBe("professionnalisation");
  });

  it("falls back to autre when neither matches", () => {
    expect(inferContractTypeFromText("Poste en CDI, non concerné")).toBe("autre");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/core test text`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `packages/core/src/text/strip-html.ts`**

```typescript
const ENTITY_REPLACEMENTS: Array<[RegExp, string]> = [
  [/&nbsp;/g, " "],
  [/&amp;/g, "&"],
  [/&lt;/g, "<"],
  [/&gt;/g, ">"],
  [/&quot;/g, '"'],
  [/&#39;/g, "'"],
];

export function stripHtml(html: string): string {
  let text = html.replace(/<[^>]*>/g, " ");
  for (const [pattern, replacement] of ENTITY_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }
  return text.replace(/\s+/g, " ").trim();
}
```

- [ ] **Step 4: Implement `packages/core/src/text/infer-contract-type.ts`**

```typescript
import type { ContractType } from "../schemas/normalized-offer.js";

export function inferContractTypeFromText(text: string): ContractType {
  if (/apprentissage/i.test(text)) return "apprentissage";
  if (/professionnalisation/i.test(text)) return "professionnalisation";
  return "autre";
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/core test text`
Expected: PASS (6 tests)

- [ ] **Step 6: Extend `packages/core/src/schemas/connector.ts`**

Add near the top (after the existing imports) and before `HarvestQuerySchema`:

```typescript
export const WorkdayTargetSchema = z.object({
  tenant: z.string(),
  site: z.string(),
  dc: z.string(),
});
export type WorkdayTarget = z.infer<typeof WorkdayTargetSchema>;

export const HarvestTargetsSchema = z.object({
  workday: z.array(WorkdayTargetSchema).optional(),
  smartrecruiters: z.array(z.string()).optional(),
});
export type HarvestTargets = z.infer<typeof HarvestTargetsSchema>;
```

Add `targets: HarvestTargetsSchema.optional(),` as a new field inside `HarvestQuerySchema`'s
`z.object({...})` (alongside `campaignId`, `keywords`, `romeCodes`, `location`,
`contractTypes`).

Add `locationScoped?: boolean;` as a new optional field on the `Connector` interface (alongside
`id`, `tier`, `supports`, `fetch`, `normalize`, `healthCheck`).

- [ ] **Step 7: Export the new modules from the barrel**

Add to `packages/core/src/index.ts`:

```typescript
export * from "./text/strip-html.js";
export * from "./text/infer-contract-type.js";
```

- [ ] **Step 8: Typecheck and run the full core suite**

Run: `pnpm --filter @job-harvester/core typecheck && pnpm --filter @job-harvester/core test`
Expected: no errors; all tests pass (existing + 6 new).

- [ ] **Step 9: Commit**

```bash
git add packages/core
git commit -m "feat(core): add HarvestQuery targets, Connector.locationScoped, stripHtml, and inferContractTypeFromText"
```

---

### Task 2: `harvester` — campaign `targets` field and orchestrator `locationScoped` handling

**Files:**
- Modify: `packages/harvester/src/config/campaign-schema.ts`
- Modify: `packages/harvester/src/orchestrator.ts`
- Modify: `packages/harvester/src/orchestrator.test.ts`

**Interfaces:**
- Consumes: `HarvestTargetsSchema` (`@job-harvester/core`, Task 1).
- Produces: `CampaignConfig.targets?: HarvestTargets`. `runCampaign` now respects
  `connector.locationScoped`. Consumed by Task 9 (`config/campaigns.yaml` gets a real
  `targets` block) and by both new connectors' `supports()`/`fetch()`.

- [ ] **Step 1: Write the failing tests**

Add to `packages/harvester/src/orchestrator.test.ts` (alongside the existing tests — keep them
untouched):

```typescript
describe("runCampaign — locationScoped connectors", () => {
  const multiLocationCampaign: CampaignConfig = {
    id: "multi-location-test",
    romeCodes: ["M1403"],
    keywords: [],
    locations: [
      { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
      { label: "Amiens", lat: 49.9, lng: 2.29, radiusKm: 30 },
    ],
    contractTypes: ["apprentissage"],
  };

  it("calls fetch exactly once across multiple campaign locations when locationScoped is false", async () => {
    const db = createDb(tmpDbPath());
    let fetchCallCount = 0;
    const scopedConnector: Connector = {
      id: "scoped-fake",
      tier: 1,
      locationScoped: false,
      supports: () => true,
      async *fetch() {
        fetchCallCount += 1;
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "scoped-fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    await runCampaign(multiLocationCampaign, scopedConnector, db, {});

    expect(fetchCallCount).toBe(1);
  });

  it("calls fetch once per location when locationScoped is absent (default true)", async () => {
    const db = createDb(tmpDbPath());
    let fetchCallCount = 0;
    const defaultConnector: Connector = {
      id: "default-fake",
      tier: 0,
      supports: () => true,
      async *fetch() {
        fetchCallCount += 1;
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "default-fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    await runCampaign(multiLocationCampaign, defaultConnector, db, {});

    expect(fetchCallCount).toBe(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/harvester test orchestrator`
Expected: FAIL — the current orchestrator calls `fetch()` once per matching location
unconditionally, so the first new test observes `fetchCallCount === 2`, not `1`.

- [ ] **Step 3: Extend `packages/harvester/src/config/campaign-schema.ts`**

Add the import: `import { ContractTypeSchema, HarvestTargetsSchema } from "@job-harvester/core";`
(extending the existing `@job-harvester/core` import if one already exists rather than adding a
duplicate import line).

Add `targets: HarvestTargetsSchema.optional(),` as a new field inside `CampaignConfigSchema`.

- [ ] **Step 4: Update `packages/harvester/src/orchestrator.ts`**

In the `runCampaign` function, change the per-location loop. Before:

```typescript
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
```

After:

```typescript
  let hasFetchedOnce = false;
  for (const location of campaign.locations) {
    const query: HarvestQuery = {
      campaignId: campaign.id,
      keywords: campaign.keywords,
      romeCodes: campaign.romeCodes,
      location,
      contractTypes: campaign.contractTypes,
      targets: campaign.targets,
    };
    if (!connector.supports(query)) continue;
    if (connector.locationScoped === false) {
      if (hasFetchedOnce) continue;
      hasFetchedOnce = true;
    }

    await rateLimiter.wait(connector.id);
    try {
      for await (const raw of connector.fetch(query, { fetchImpl: fetch, env })) {
```

(the rest of the loop body — the try/catch, the per-item normalize/reject/upsert logic — is
unchanged; only the lines shown above change). Declare `hasFetchedOnce` once, before the `for`
loop starts, not inside it.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/harvester test`
Expected: PASS (all existing tests + 2 new ones)

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @job-harvester/harvester typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/harvester
git commit -m "feat(harvester): add campaign targets field and locationScoped-aware orchestration"
```

---

### Task 3: `connectors` — Workday raw types and fixtures

**Files:**
- Create: `packages/connectors/src/tier1/workday/types.ts`
- Create: `fixtures/workday/search-response.json`
- Create: `fixtures/workday/job-detail.json`

**Interfaces:**
- Produces: `WorkdaySearchResponseSchema`, `WorkdayJobDetailSchema`, `WorkdayRawOfferSchema`
  (the composite shape this connector's own `client.ts` constructs and `normalize.ts`
  consumes — see note below). Consumed by Tasks 4 (client) and 5 (normalize).

**Note on `WorkdayRawOfferSchema`:** unlike the Tier-0 connectors, a single Workday API
response isn't enough to build a `NormalizedOffer` — the apply URL requires knowing which
`WorkdayTarget` (tenant/site/dc) produced this offer, information that lives in the campaign
config, not in Workday's own response. `client.ts` (Task 4) will construct a composite object
`{target, externalPath, jobPostingInfo}` as the `RawOffer.payload` it yields, and `normalize.ts`
(Task 5) validates that composite shape — not the literal Workday API response — via Zod. This
keeps `normalize` pure (everything it needs is already in `raw.payload`) without it needing to
know about tenants/sites itself.

- [ ] **Step 1: Implement `packages/connectors/src/tier1/workday/types.ts`**

```typescript
import { z } from "zod";
import { WorkdayTargetSchema } from "@job-harvester/core";

export const WorkdaySearchResponseSchema = z.object({
  total: z.number(),
  jobPostings: z.array(z.unknown()),
});
export type WorkdaySearchResponse = z.infer<typeof WorkdaySearchResponseSchema>;

export const WorkdayJobDetailSchema = z.object({
  jobPostingInfo: z.object({
    title: z.string(),
    jobDescription: z.string(),
    location: z.string().optional(),
    jobReqId: z.string().optional(),
    externalUrl: z.string().optional(),
  }),
});
export type WorkdayJobDetail = z.infer<typeof WorkdayJobDetailSchema>;

export const WorkdayRawOfferSchema = z.object({
  target: WorkdayTargetSchema,
  externalPath: z.string(),
  jobPostingInfo: WorkdayJobDetailSchema.shape.jobPostingInfo,
});
export type WorkdayRawOffer = z.infer<typeof WorkdayRawOfferSchema>;
```

- [ ] **Step 2: Create fixture `fixtures/workday/search-response.json`**

(matches the confirmed real shape from live research against `valeo.wd3.myworkdayjobs.com`)

```json
{
  "total": 2,
  "jobPostings": [
    {
      "title": "Alternant Data Analyst",
      "externalPath": "/job/Lille/Alternant-Data-Analyst_REQ2026000111",
      "locationsText": "Lille",
      "postedOn": "Posted 5 Days Ago"
    },
    {
      "title": "Ingénieur logiciel confirmé",
      "externalPath": "/job/Paris/Ingenieur-logiciel-confirme_REQ2026000222",
      "locationsText": "Paris",
      "postedOn": "Posted 2 Days Ago"
    }
  ]
}
```

- [ ] **Step 3: Create fixture `fixtures/workday/job-detail.json`**

**This nesting under `jobPostingInfo` is the plan's residual uncertainty for Task 4/5 —
verify it against a real live call and correct this fixture (and the schema in Step 1) if the
real API nests differently.**

```json
{
  "jobPostingInfo": {
    "title": "Alternant Data Analyst",
    "jobDescription": "<p>Rejoignez notre équipe data pour une alternance de 12 mois.</p><ul><li>Analyse de données</li></ul>",
    "location": "Lille",
    "jobReqId": "REQ2026000111",
    "externalUrl": "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111"
  }
}
```

- [ ] **Step 4: Install `@job-harvester/core` types dependency reference (already a dependency)**

Run: `pnpm --filter @job-harvester/connectors typecheck`
Expected: no errors (no new package dependency needed — `@job-harvester/core` is already a
dependency of `packages/connectors` from the `labonnealternance`/`francetravail` connectors).

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier1/workday/types.ts fixtures/workday
git commit -m "feat(connectors): add workday raw types and fixtures"
```

---

### Task 4: `connectors` — Workday client (search, detail fetch, health check)

**Files:**
- Create: `packages/connectors/src/tier1/workday/client.ts`
- Create: `packages/connectors/src/tier1/workday/client.test.ts`

**Interfaces:**
- Consumes: `HarvestQuery`, `ConnectorHealth`, `WorkdayTarget` (`@job-harvester/core`),
  `WorkdaySearchResponseSchema`, `WorkdayJobDetailSchema` (Task 3).
- Produces: `WORKDAY_CONNECTOR_ID`, `fetchWorkdayOffers(query, options): AsyncIterable<unknown>`
  (yields `WorkdayRawOffer`-shaped objects), `checkWorkdayHealth(options):
  Promise<ConnectorHealth>`. Consumed by Task 5.

**Residual uncertainty to verify during this task (see Task 3's note):** the job-detail
endpoint's exact response nesting. If a live call shows the real shape differs from
`{jobPostingInfo: {...}}`, fix `WorkdayJobDetailSchema` (Task 3's file) and this task's parsing
code together, and note the correction in your report.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/connectors/src/tier1/workday/client.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchWorkdayOffers, checkWorkdayHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }] },
};

const searchResponseBody = JSON.stringify({
  total: 1,
  jobPostings: [{ title: "Alternant Data Analyst", externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111" }],
});

const detailResponseBody = JSON.stringify({
  jobPostingInfo: {
    title: "Alternant Data Analyst",
    jobDescription: "<p>Une alternance data.</p>",
    location: "Lille",
    jobReqId: "REQ2026000111",
    externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  },
});

describe("fetchWorkdayOffers", () => {
  it("fetches the list for each target, fetches detail per item, and yields a composite raw offer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(searchResponseBody, { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      target: { tenant: "valeo", site: "valeo_jobs", dc: "wd3" },
      externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111",
      jobPostingInfo: { title: "Alternant Data Analyst" },
    });

    const searchCall = fetchImpl.mock.calls.find(([input]) => String(input).endsWith("/jobs"))!;
    expect(String(searchCall[0])).toBe("https://valeo.wd3.myworkdayjobs.com/wday/cxs/valeo/valeo_jobs/jobs");
  });

  it("throws when the search request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _item of fetchWorkdayOffers(query, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkWorkdayHealth", () => {
  it("reports ok:true when the search request against the health-check tenant succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 }));
    const health = await checkWorkdayHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "workday", ok: true });
  });

  it("reports ok:false with a message when the request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkWorkdayHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "workday", ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: FAIL — `client.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier1/workday/client.ts`**

```typescript
import type { ConnectorHealth, HarvestQuery, WorkdayTarget } from "@job-harvester/core";
import { WorkdaySearchResponseSchema, WorkdayJobDetailSchema } from "./types.js";

export const WORKDAY_CONNECTOR_ID = "workday";

export interface WorkdayClientOptions {
  fetchImpl?: typeof fetch;
}

const HEALTH_CHECK_TARGET: WorkdayTarget = { tenant: "valeo", site: "valeo_jobs", dc: "wd3" };

function cxsBaseUrl(target: WorkdayTarget): string {
  return `https://${target.tenant}.${target.dc}.myworkdayjobs.com/wday/cxs/${target.tenant}/${target.site}`;
}

function headers(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "User-Agent": "job-harvester/0.1 (personal alternance watch tool)",
  };
}

async function fetchJobList(target: WorkdayTarget, searchText: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const response = await fetchImpl(`${cxsBaseUrl(target)}/jobs`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ appliedFacets: {}, limit: 20, offset: 0, searchText }),
  });
  if (!response.ok) {
    throw new Error(`workday search failed: HTTP ${response.status}`);
  }
  const parsed = WorkdaySearchResponseSchema.parse(await response.json());
  return parsed.jobPostings;
}

async function fetchJobDetail(
  target: WorkdayTarget,
  externalPath: string,
  fetchImpl: typeof fetch,
): Promise<{ title: string; jobDescription: string; location?: string; jobReqId?: string; externalUrl?: string }> {
  const response = await fetchImpl(`${cxsBaseUrl(target)}${externalPath}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`workday job detail failed: HTTP ${response.status}`);
  }
  const parsed = WorkdayJobDetailSchema.parse(await response.json());
  return parsed.jobPostingInfo;
}

export async function* fetchWorkdayOffers(query: HarvestQuery, options: WorkdayClientOptions): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const targets = query.targets?.workday ?? [];
  for (const target of targets) {
    const listItems = await fetchJobList(target, "alternance", fetchImpl);
    for (const item of listItems) {
      const listing = item as { externalPath?: string };
      if (!listing.externalPath) continue;
      const jobPostingInfo = await fetchJobDetail(target, listing.externalPath, fetchImpl);
      yield { target, externalPath: listing.externalPath, jobPostingInfo };
    }
  }
}

export async function checkWorkdayHealth(options: WorkdayClientOptions): Promise<ConnectorHealth> {
  const start = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${cxsBaseUrl(HEALTH_CHECK_TARGET)}/jobs`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ appliedFacets: {}, limit: 1, offset: 0, searchText: "" }),
    });
    return {
      connectorId: WORKDAY_CONNECTOR_ID,
      ok: response.ok,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      connectorId: WORKDAY_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @job-harvester/connectors typecheck`

```bash
git add packages/connectors/src/tier1/workday/client.ts packages/connectors/src/tier1/workday/client.test.ts
git commit -m "feat(connectors): add workday search/detail client and health check"
```

---

### Task 5: `connectors` — Workday normalize and connector wiring

**Files:**
- Create: `packages/connectors/src/tier1/workday/normalize.ts`
- Create: `packages/connectors/src/tier1/workday/normalize.test.ts`
- Create: `packages/connectors/src/tier1/workday/connector.ts`
- Create: `packages/connectors/src/tier1/workday/connector.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interfaces:**
- Consumes: `canonicalizeUrl`, `exactDedupKeyFromUrl`, `normalizeCompanyName`, `stripHtml`,
  `inferContractTypeFromText`, `NormalizedOffer`, `Connector`, `RawOffer` (`@job-harvester/core`),
  `WorkdayRawOfferSchema` (Task 3), `fetchWorkdayOffers`/`checkWorkdayHealth`/
  `WORKDAY_CONNECTOR_ID` (Task 4).
- Produces: `normalizeWorkdayOffer(raw: RawOffer): NormalizedOffer`, `workdayConnector:
  Connector`, both re-exported from `@job-harvester/connectors`. Consumed by Task 9
  (`server.ts`).

- [ ] **Step 1: Write the failing normalize tests**

```typescript
// packages/connectors/src/tier1/workday/normalize.test.ts
import { describe, it, expect } from "vitest";
import { normalizeWorkdayOffer } from "./normalize.js";

const rawOfferPayload = {
  target: { tenant: "valeo", site: "valeo_jobs", dc: "wd3" },
  externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  jobPostingInfo: {
    title: "Alternant Data Analyst",
    jobDescription: "<p>Rejoignez notre équipe <strong>data</strong>.</p>",
    location: "Lille",
    jobReqId: "REQ2026000111",
    externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  },
};

describe("normalizeWorkdayOffer", () => {
  it("maps fields, strips HTML from the description, and uses the externalUrl as applyUrl", () => {
    const offer = normalizeWorkdayOffer({ source: "workday", payload: rawOfferPayload });

    expect(offer.source).toBe("workday");
    expect(offer.sourceOfferId).toBe("REQ2026000111");
    expect(offer.title).toBe("Alternant Data Analyst");
    expect(offer.descriptionText).toBe("Rejoignez notre équipe data .");
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
    expect(offer.location.city).toBe("Lille");
    expect(offer.company.normalizedName).toBe("valeo");
    expect(offer.romeCodes).toEqual([]);
    expect(offer.originSource).toBeUndefined();
  });

  it("infers contractType apprentissage from the title/description text", () => {
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...rawOfferPayload, jobPostingInfo: { ...rawOfferPayload.jobPostingInfo, title: "Contrat d'apprentissage - Data Analyst" } },
    });
    expect(offer.contractType).toBe("apprentissage");
  });

  it("constructs applyUrl from target+externalPath when externalUrl is absent", () => {
    const { externalUrl: _drop, ...jobPostingInfoWithoutExternalUrl } = rawOfferPayload.jobPostingInfo;
    const offer = normalizeWorkdayOffer({
      source: "workday",
      payload: { ...rawOfferPayload, jobPostingInfo: jobPostingInfoWithoutExternalUrl },
    });
    expect(offer.applyUrl).toBe("https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeWorkdayOffer({ source: "workday", payload: { nope: true } })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: FAIL — `normalize.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier1/workday/normalize.ts`**

```typescript
import { ulid } from "ulid";
import {
  canonicalizeUrl,
  exactDedupKeyFromUrl,
  normalizeCompanyName,
  stripHtml,
  inferContractTypeFromText,
  type NormalizedOffer,
  type RawOffer,
} from "@job-harvester/core";
import { WorkdayRawOfferSchema } from "./types.js";
import { WORKDAY_CONNECTOR_ID } from "./client.js";

export function normalizeWorkdayOffer(raw: RawOffer): NormalizedOffer {
  const parsed = WorkdayRawOfferSchema.parse(raw.payload);
  const { target, externalPath, jobPostingInfo } = parsed;

  const applyUrl =
    jobPostingInfo.externalUrl ?? `https://${target.tenant}.${target.dc}.myworkdayjobs.com/${target.site}${externalPath}`;
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const sourceOfferId = jobPostingInfo.jobReqId ?? externalPath;
  const descriptionText = stripHtml(jobPostingInfo.jobDescription);
  const city = jobPostingInfo.location ?? "";

  return {
    id: ulid(),
    source: WORKDAY_CONNECTOR_ID,
    sourceOfferId,
    canonicalUrl,
    applyUrl,
    title: jobPostingInfo.title,
    company: {
      name: target.tenant,
      normalizedName: normalizeCompanyName(target.tenant),
    },
    location: {
      label: city,
      city,
    },
    contractType: inferContractTypeFromText(`${jobPostingInfo.title} ${descriptionText}`),
    romeCodes: [],
    descriptionText,
    remotePolicy: "unknown",
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: WORKDAY_CONNECTOR_ID, sourceOfferId, canonicalUrl }],
    rawPayload: parsed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: PASS (4 new tests)

- [ ] **Step 5: Write the failing connector wiring test**

```typescript
// packages/connectors/src/tier1/workday/connector.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { workdayConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }] },
};

describe("workdayConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when workday targets are configured", () => {
    expect(workdayConnector.tier).toBe(1);
    expect(workdayConnector.locationScoped).toBe(false);
    expect(workdayConnector.supports(query)).toBe(true);
    expect(workdayConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(
          JSON.stringify({ total: 1, jobPostings: [{ title: "Alternant Data Analyst", externalPath: "/job/Lille/x_REQ1" }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ jobPostingInfo: { title: "Alternant Data Analyst", jobDescription: "desc", jobReqId: "REQ1", externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/x_REQ1" } }),
        { status: 200 },
      );
    });

    const raws = [];
    for await (const raw of workdayConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "workday" });
    expect(workdayConnector.normalize(raws[0]!).title).toBe("Alternant Data Analyst");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: FAIL — `connector.ts` not found.

- [ ] **Step 7: Implement `packages/connectors/src/tier1/workday/connector.ts`**

```typescript
import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchWorkdayOffers, checkWorkdayHealth, WORKDAY_CONNECTOR_ID } from "./client.js";
import { normalizeWorkdayOffer } from "./normalize.js";

export const workdayConnector: Connector = {
  id: WORKDAY_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.workday && query.targets.workday.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchWorkdayOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: WORKDAY_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeWorkdayOffer(raw);
  },

  async healthCheck() {
    return checkWorkdayHealth({});
  },
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/workday`
Expected: PASS (2 new tests)

- [ ] **Step 9: Update the package barrel**

Add to `packages/connectors/src/index.ts`:

```typescript
export * from "./tier1/workday/connector.js";
export * from "./tier1/workday/normalize.js";
```

- [ ] **Step 10: Run the full connectors suite and typecheck**

Run: `pnpm --filter @job-harvester/connectors test && pnpm --filter @job-harvester/connectors typecheck`
Expected: all pass, clean.

- [ ] **Step 11: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): implement workday normalize and connector wiring"
```

---

### Task 6: `connectors` — SmartRecruiters raw types and fixtures

**Files:**
- Create: `packages/connectors/src/tier1/smartrecruiters/types.ts`
- Create: `fixtures/smartrecruiters/posting-list.json`
- Create: `fixtures/smartrecruiters/posting-detail-alternance.json`

**Interfaces:**
- Produces: `SmartRecruitersSearchResponseSchema`, `SmartRecruitersPostingDetailSchema`.
  Consumed by Tasks 7 (client) and 8 (normalize).

- [ ] **Step 1: Implement `packages/connectors/src/tier1/smartrecruiters/types.ts`**

**Residual uncertainty (see this plan's Global Constraints): the exact envelope key of the
list response (`content` assumed below per SmartRecruiters' documented convention, not
confirmed by a live curl during spec research) — verify against a real call in Task 7 and
correct here if wrong.**

```typescript
import { z } from "zod";

export const SmartRecruitersSearchResponseSchema = z.object({
  content: z.array(z.unknown()),
});
export type SmartRecruitersSearchResponse = z.infer<typeof SmartRecruitersSearchResponseSchema>;

export const SmartRecruitersPostingDetailSchema = z.object({
  id: z.string(),
  name: z.string(),
  releasedDate: z.string().optional(),
  location: z
    .object({
      city: z.string().optional(),
      postalCode: z.string().optional(),
    })
    .optional(),
  company: z
    .object({
      name: z.string().optional(),
    })
    .optional(),
  jobAd: z
    .object({
      sections: z
        .object({
          jobDescription: z
            .object({
              text: z.string().optional(),
            })
            .optional(),
        })
        .optional(),
    })
    .optional(),
  postingUrl: z.string().optional(),
  applyUrl: z.string().optional(),
});
export type SmartRecruitersPostingDetail = z.infer<typeof SmartRecruitersPostingDetailSchema>;
```

- [ ] **Step 2: Create fixture `fixtures/smartrecruiters/posting-list.json`**

```json
{
  "content": [
    { "id": "743000000000001", "name": "Alternance Data Analyst H/F" },
    { "id": "743000000000002", "name": "Auditeur confirmé H/F" }
  ]
}
```

- [ ] **Step 3: Create fixture `fixtures/smartrecruiters/posting-detail-alternance.json`**

```json
{
  "id": "743000000000001",
  "name": "Alternance Data Analyst H/F",
  "releasedDate": "2026-07-15T09:00:00.000Z",
  "location": { "city": "Lille", "postalCode": "59000" },
  "company": { "name": "Mazars" },
  "jobAd": {
    "sections": {
      "jobDescription": { "text": "<p>Poste en <strong>alternance</strong> au sein de l'équipe data.</p>" }
    }
  },
  "postingUrl": "https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f",
  "applyUrl": "https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f"
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @job-harvester/connectors typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/connectors/src/tier1/smartrecruiters/types.ts fixtures/smartrecruiters
git commit -m "feat(connectors): add smartrecruiters raw types and fixtures"
```

---

### Task 7: `connectors` — SmartRecruiters client (list + detail, client-side alternance filter, health check)

**Files:**
- Create: `packages/connectors/src/tier1/smartrecruiters/client.ts`
- Create: `packages/connectors/src/tier1/smartrecruiters/client.test.ts`

**Interfaces:**
- Consumes: `HarvestQuery`, `ConnectorHealth` (`@job-harvester/core`),
  `SmartRecruitersSearchResponseSchema` (Task 6).
- Produces: `SMARTRECRUITERS_CONNECTOR_ID`, `fetchSmartRecruitersOffers(query, options):
  AsyncIterable<unknown>`, `checkSmartRecruitersHealth(options): Promise<ConnectorHealth>`.
  Consumed by Task 8.

**Residual uncertainty to verify during this task (see Task 6's note):** the list response's
envelope key. If a live `curl https://api.smartrecruiters.com/v1/companies/MAZARS/postings`
shows a different key than `content`, fix `SmartRecruitersSearchResponseSchema` (Task 6's file)
and this task's parsing code together, and note the correction in your report.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/connectors/src/tier1/smartrecruiters/client.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchSmartRecruitersOffers, checkSmartRecruitersHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { smartrecruiters: ["MAZARS"] },
};

describe("fetchSmartRecruitersOffers", () => {
  it("filters out non-alternance postings before fetching their detail", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Alternance Data Analyst H/F" },
              { id: "2", name: "Auditeur confirmé H/F" },
            ],
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Alternance Data Analyst H/F" }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(detailUrls).toHaveLength(1);
    expect(detailUrls[0]).toContain("/postings/1");
  });

  it("throws when the postings list request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _item of fetchSmartRecruitersOffers(query, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkSmartRecruitersHealth", () => {
  it("reports ok:true when the health-check request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ content: [] }), { status: 200 }));
    const health = await checkSmartRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "smartrecruiters", ok: true });
  });

  it("reports ok:false with a message when the request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkSmartRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "smartrecruiters", ok: false });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: FAIL — `client.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier1/smartrecruiters/client.ts`**

```typescript
import type { ConnectorHealth, HarvestQuery } from "@job-harvester/core";
import { SmartRecruitersSearchResponseSchema } from "./types.js";

export const SMARTRECRUITERS_CONNECTOR_ID = "smartrecruiters";
const BASE_URL = "https://api.smartrecruiters.com/v1/companies";
const HEALTH_CHECK_COMPANY = "MAZARS";

function headers(): Record<string, string> {
  return { "User-Agent": "job-harvester/0.1 (personal alternance watch tool)" };
}

function isAlternanceRelevant(text: string): boolean {
  return /alternance|apprentissage|apprenti/i.test(text);
}

async function fetchPostingsList(company: string, fetchImpl: typeof fetch): Promise<unknown[]> {
  const response = await fetchImpl(`${BASE_URL}/${company}/postings?limit=50`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`smartrecruiters postings list failed: HTTP ${response.status}`);
  }
  const parsed = SmartRecruitersSearchResponseSchema.parse(await response.json());
  return parsed.content;
}

async function fetchPostingDetail(company: string, id: string, fetchImpl: typeof fetch): Promise<unknown> {
  const response = await fetchImpl(`${BASE_URL}/${company}/postings/${id}`, { headers: headers() });
  if (!response.ok) {
    throw new Error(`smartrecruiters posting detail failed: HTTP ${response.status}`);
  }
  return response.json();
}

export async function* fetchSmartRecruitersOffers(query: HarvestQuery, options: { fetchImpl?: typeof fetch }): AsyncIterable<unknown> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const companies = query.targets?.smartrecruiters ?? [];
  for (const company of companies) {
    const list = await fetchPostingsList(company, fetchImpl);
    for (const item of list) {
      const listing = item as { id?: string; name?: string };
      if (!listing.id || !isAlternanceRelevant(listing.name ?? "")) continue;
      yield await fetchPostingDetail(company, listing.id, fetchImpl);
    }
  }
}

export async function checkSmartRecruitersHealth(options: { fetchImpl?: typeof fetch }): Promise<ConnectorHealth> {
  const start = Date.now();
  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${BASE_URL}/${HEALTH_CHECK_COMPANY}/postings?limit=1`, { headers: headers() });
    return {
      connectorId: SMARTRECRUITERS_CONNECTOR_ID,
      ok: response.ok,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      connectorId: SMARTRECRUITERS_CONNECTOR_ID,
      ok: false,
      latencyMs: Date.now() - start,
      checkedAt: new Date().toISOString(),
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: PASS (4 tests)

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm --filter @job-harvester/connectors typecheck`

```bash
git add packages/connectors/src/tier1/smartrecruiters/client.ts packages/connectors/src/tier1/smartrecruiters/client.test.ts
git commit -m "feat(connectors): add smartrecruiters list/detail client with alternance pre-filter and health check"
```

---

### Task 8: `connectors` — SmartRecruiters normalize and connector wiring

**Files:**
- Create: `packages/connectors/src/tier1/smartrecruiters/normalize.ts`
- Create: `packages/connectors/src/tier1/smartrecruiters/normalize.test.ts`
- Create: `packages/connectors/src/tier1/smartrecruiters/connector.ts`
- Create: `packages/connectors/src/tier1/smartrecruiters/connector.test.ts`
- Modify: `packages/connectors/src/index.ts`

**Interfaces:**
- Consumes: `canonicalizeUrl`, `exactDedupKeyFromUrl`, `normalizeCompanyName`, `stripHtml`,
  `inferContractTypeFromText`, `NormalizedOffer`, `Connector`, `RawOffer` (`@job-harvester/core`),
  `SmartRecruitersPostingDetailSchema` (Task 6), `fetchSmartRecruitersOffers`/
  `checkSmartRecruitersHealth`/`SMARTRECRUITERS_CONNECTOR_ID` (Task 7).
- Produces: `normalizeSmartRecruitersOffer(raw: RawOffer): NormalizedOffer`,
  `smartrecruitersConnector: Connector`, both re-exported from `@job-harvester/connectors`.
  Consumed by Task 9 (`server.ts`).

- [ ] **Step 1: Write the failing normalize tests**

```typescript
// packages/connectors/src/tier1/smartrecruiters/normalize.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeSmartRecruitersOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/smartrecruiters");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeSmartRecruitersOffer", () => {
  it("maps fields and strips HTML from the description", () => {
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: loadFixture("posting-detail-alternance.json") });

    expect(offer.source).toBe("smartrecruiters");
    expect(offer.sourceOfferId).toBe("743000000000001");
    expect(offer.title).toBe("Alternance Data Analyst H/F");
    expect(offer.descriptionText).toBe("Poste en alternance au sein de l'équipe data.");
    expect(offer.applyUrl).toBe("https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.location.department).toBe("59");
    expect(offer.company.normalizedName).toBe("mazars");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.postedAt).toBe("2026-07-15T09:00:00.000Z");
    expect(offer.romeCodes).toEqual([]);
    expect(offer.originSource).toBeUndefined();
  });

  it("falls back to postingUrl when applyUrl is absent", () => {
    const fixture = loadFixture("posting-detail-alternance.json") as Record<string, unknown>;
    const { applyUrl: _drop, ...withoutApplyUrl } = fixture;
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: withoutApplyUrl });
    expect(offer.applyUrl).toBe("https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: { nope: true } })).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: FAIL — `normalize.ts` not found.

- [ ] **Step 3: Implement `packages/connectors/src/tier1/smartrecruiters/normalize.ts`**

```typescript
import { ulid } from "ulid";
import {
  canonicalizeUrl,
  exactDedupKeyFromUrl,
  normalizeCompanyName,
  stripHtml,
  inferContractTypeFromText,
  type NormalizedOffer,
  type RawOffer,
} from "@job-harvester/core";
import { SmartRecruitersPostingDetailSchema } from "./types.js";
import { SMARTRECRUITERS_CONNECTOR_ID } from "./client.js";

export function normalizeSmartRecruitersOffer(raw: RawOffer): NormalizedOffer {
  const parsed = SmartRecruitersPostingDetailSchema.parse(raw.payload);
  const applyUrl = parsed.applyUrl ?? parsed.postingUrl ?? `https://api.smartrecruiters.com/v1/postings/${parsed.id}`;
  const canonicalUrl = canonicalizeUrl(applyUrl);
  const now = new Date().toISOString();
  const companyName = parsed.company?.name ?? "Entreprise inconnue";
  const descriptionText = stripHtml(parsed.jobAd?.sections?.jobDescription?.text ?? "");
  const postalCode = parsed.location?.postalCode;

  return {
    id: ulid(),
    source: SMARTRECRUITERS_CONNECTOR_ID,
    sourceOfferId: parsed.id,
    canonicalUrl,
    applyUrl,
    title: parsed.name,
    company: {
      name: companyName,
      normalizedName: normalizeCompanyName(companyName),
    },
    location: {
      label: parsed.location?.city ?? "",
      city: parsed.location?.city ?? "",
      postalCode,
      department: postalCode?.slice(0, 2),
    },
    contractType: inferContractTypeFromText(`${parsed.name} ${descriptionText}`),
    romeCodes: [],
    descriptionText,
    remotePolicy: "unknown",
    postedAt: parsed.releasedDate,
    firstSeenAt: now,
    lastSeenAt: now,
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: SMARTRECRUITERS_CONNECTOR_ID, sourceOfferId: parsed.id, canonicalUrl }],
    rawPayload: parsed,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: PASS (3 new tests)

- [ ] **Step 5: Write the failing connector wiring test**

```typescript
// packages/connectors/src/tier1/smartrecruiters/connector.test.ts
import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { smartrecruitersConnector } from "./connector.js";
import postingDetail from "../../../../../fixtures/smartrecruiters/posting-detail-alternance.json" with { type: "json" };

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { smartrecruiters: ["MAZARS"] },
};

describe("smartrecruitersConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when smartrecruiters targets are configured", () => {
    expect(smartrecruitersConnector.tier).toBe(1);
    expect(smartrecruitersConnector.locationScoped).toBe(false);
    expect(smartrecruitersConnector.supports(query)).toBe(true);
    expect(smartrecruitersConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/postings?limit=50")) {
        return new Response(JSON.stringify({ content: [{ id: "743000000000001", name: "Alternance Data Analyst H/F" }] }), { status: 200 });
      }
      return new Response(JSON.stringify(postingDetail), { status: 200 });
    });

    const raws = [];
    for await (const raw of smartrecruitersConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "smartrecruiters" });
    expect(smartrecruitersConnector.normalize(raws[0]!).title).toBe("Alternance Data Analyst H/F");
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: FAIL — `connector.ts` not found.

- [ ] **Step 7: Implement `packages/connectors/src/tier1/smartrecruiters/connector.ts`**

```typescript
import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchSmartRecruitersOffers, checkSmartRecruitersHealth, SMARTRECRUITERS_CONNECTOR_ID } from "./client.js";
import { normalizeSmartRecruitersOffer } from "./normalize.js";

export const smartrecruitersConnector: Connector = {
  id: SMARTRECRUITERS_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.smartrecruiters && query.targets.smartrecruiters.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchSmartRecruitersOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: SMARTRECRUITERS_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeSmartRecruitersOffer(raw);
  },

  async healthCheck() {
    return checkSmartRecruitersHealth({});
  },
};
```

- [ ] **Step 8: Run test to verify it passes**

Run: `pnpm --filter @job-harvester/connectors test tier1/smartrecruiters`
Expected: PASS (2 new tests)

- [ ] **Step 9: Update the package barrel**

Add to `packages/connectors/src/index.ts`:

```typescript
export * from "./tier1/smartrecruiters/connector.js";
export * from "./tier1/smartrecruiters/normalize.js";
```

- [ ] **Step 10: Run the full connectors suite and typecheck**

Run: `pnpm --filter @job-harvester/connectors test && pnpm --filter @job-harvester/connectors typecheck`
Expected: all pass, clean.

- [ ] **Step 11: Commit**

```bash
git add packages/connectors
git commit -m "feat(connectors): implement smartrecruiters normalize and connector wiring"
```

---

### Task 9: docs, campaign config targets, and server registration

**Files:**
- Modify: `docs/sources.md`
- Modify: `config/campaigns.yaml`
- Modify: `packages/api/src/server.ts`

**Interfaces:** none new — wires the two connectors into the running app and documents them.

- [ ] **Step 1: Add Workday and SmartRecruiters entries to `docs/sources.md`**

Append after the existing `francetravail` section:

```markdown
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
- **Statut robots.txt/CGU** : non applicable — API publique dédiée à l'intégration.
- **Décision** : autorisé, Tier 1.
- **Vérifié en direct le 2026-08-16** sur l'entreprise `MAZARS` (188 offres réelles).
```

- [ ] **Step 2: Add `targets` to the existing campaign in `config/campaigns.yaml`**

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
    targets:
      workday:
        - { tenant: valeo, site: valeo_jobs, dc: wd3 }
      smartrecruiters: ["MAZARS"]
```

(this replaces the existing file's content — the rest of the campaign is unchanged, only the
new `targets` block is added at the end)

- [ ] **Step 3: Register both connectors in `packages/api/src/server.ts`**

```typescript
import { serve } from "@hono/node-server";
import { createDb } from "@job-harvester/db";
import { loadCampaigns } from "@job-harvester/harvester";
import { labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

const db = createDb(process.env.DB_PATH ?? "./job-harvester.sqlite");
const campaigns = loadCampaigns(process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml");

const app = createApp({
  db,
  connectors: [labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector],
  campaigns,
  env: process.env,
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
```

- [ ] **Step 4: Full workspace verification**

Run: `pnpm -r run test && pnpm -r run typecheck`
Expected: all green across all 6 packages.

- [ ] **Step 5: Commit**

```bash
git add docs/sources.md config/campaigns.yaml packages/api/src/server.ts
git commit -m "feat: document and register workday/smartrecruiters connectors, add example targets"
```

---

### Task 10: End-to-end manual verification (four connectors live)

**Files:** none (verification only).

- [ ] **Step 1: Confirm all credentials/config are present**

Check `.env` has `LBA_API_KEY`, `FRANCE_TRAVAIL_CLIENT_ID`/`_SECRET` (Workday and
SmartRecruiters need no credentials). Confirm `config/campaigns.yaml`'s `targets` block from
Task 9 is present.

- [ ] **Step 2: Install, typecheck, test the whole workspace**

Run: `pnpm install && pnpm -r run typecheck && pnpm -r run test`
Expected: no errors, all tests pass.

- [ ] **Step 3: Start the API and trigger a live four-connector harvest**

Start the API, then:

```bash
curl -X POST http://localhost:3000/harvest/alternance-data-hdf/run
```

Expected: `{"summaries":[...]}` with **four** entries (labonnealternance, francetravail,
workday, smartrecruiters).

- [ ] **Step 4: Verify no redundant Workday/SmartRecruiters calls**

The campaign has 2 locations. Confirm (e.g. via added temporary logging, or by reasoning about
the single `runId`/count in the returned summary, or by checking the connector's reported
`rawCount` is consistent with a single pass over the target list rather than doubled) that
`workday`/`smartrecruiters` were each invoked once, not twice, for this run — this is the
behavior Task 2's orchestrator test already covers in isolation, this step confirms it holds
in the real wired-up app too.

- [ ] **Step 5: Verify connector health for all four**

Run: `curl http://localhost:3000/connectors/health`
Expected: four entries, all with a non-null `lastRun`.

- [ ] **Step 6: Verify SmartRecruiters' alternance filter held in practice**

Run: `curl http://localhost:3000/offers | python3 -c "import json,sys; d=json.load(sys.stdin); print([o['title'] for o in d['offers'] if o['source']=='smartrecruiters'])"`
Expected: every listed title plausibly relates to alternance/apprentissage (spot-check by eye
— this is a live, real-data check, not a hard assertion).

- [ ] **Step 7: Verify the jobboard displays the new sources**

Start the web dev server, open the jobboard in a browser, confirm rows exist with `source`
values `workday` and `smartrecruiters` alongside the existing two.

- [ ] **Step 8: Stop both dev servers and clean up**

Stop the API/web background processes; remove any local `*.sqlite*` test artifacts created
during this verification.

- [ ] **Step 9: Record results**

Note in a follow-up message to the user: volumes obtained per connector, whether the residual
uncertainties flagged in Tasks 4/7 (Workday detail nesting, SmartRecruiters envelope key) held
up against live data or needed correction, and confirmation that Step 4's non-redundancy check
passed.
