# Rate Limiting par domaine + Scheduler cron — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the coarse, mis-keyed `DomainRateLimiter` with a real per-domain token bucket + retry/backoff applied to every actual HTTP request, and add an opt-in cron scheduler that reads the (currently ignored) `schedule` field on campaigns.

**Architecture:** A `createRateLimitedFetch(baseFetch)` factory wraps the raw `fetch` passed into `ConnectorContext.fetchImpl`, so every connector's internal HTTP call is throttled and retried transparently with zero changes to connector code. The harvest-selection logic duplicated between the HTTP route and (soon) the scheduler is extracted once into `runCampaignAcrossConnectors`. A thin `scheduler.ts` built on `croner` calls that shared function on each campaign's cron schedule, started only when `ENABLE_SCHEDULER=true`.

**Tech Stack:** TypeScript, vitest, drizzle-orm/better-sqlite3, Hono, `croner` (new dependency).

**Spec:** `docs/superpowers/specs/2026-08-18-rate-limiting-scheduler-design.md`

## Global Constraints

- Token bucket per domain (hostname extracted from the request URL, not `connector.id`): capacity 3, refill rate 1 token/second — same fixed values for every domain, no per-domain configuration.
- Retry on HTTP response status `429` or `>= 500`: up to 3 attempts total (1 initial + 2 retries). Delay before attempt 2: random in `[0, 500ms]`. Delay before attempt 3: random in `[0, 1000ms]`. After the 3rd failing attempt, the last response is returned as-is (no throw) — callers keep handling non-OK responses exactly as they do today.
- No retry on thrown/network errors — those propagate immediately, unchanged from current behavior.
- Scheduler must not start unless `process.env.ENABLE_SCHEDULER === "true"`.
- No bounded concurrency per domain, no incident/crash resume, no per-domain rate config — explicitly out of scope for this plan.
- `RunSummary`'s shape (`runId`, `rawCount`, `normalizedCount`, `rejectedCount`, `ok`, `errorMessage?`) does not change.

---

### Task 1: Per-domain token bucket + guarded fetch

**Files:**
- Create: `packages/harvester/src/rate-limit/rate-limited-fetch.ts`
- Test: `packages/harvester/src/rate-limit/rate-limited-fetch.test.ts`

**Interfaces:**
- Consumes: nothing from other tasks (standalone, only `typeof fetch`/`Response` from the DOM lib).
- Produces: `createRateLimitedFetch(baseFetch: typeof fetch, options?: { bucketCapacity?: number; refillPerSecond?: number; retryDelaysMs?: [number, number] }): typeof fetch` — the `options` parameter exists purely so tests can use fast timings; production call sites (Task 2) call it with no `options`, getting the Global Constraints defaults (capacity 3, refill 1/s, delays `[500, 1000]`).

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/harvester/src/rate-limit/rate-limited-fetch.test.ts
import { describe, it, expect, vi, afterEach } from "vitest";
import { createRateLimitedFetch } from "./rate-limited-fetch.js";

function jsonResponse(status: number): Response {
  return new Response(null, { status });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createRateLimitedFetch", () => {
  it("throttles a second call to the same domain but not a call to a different domain", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 1,
      refillPerSecond: 5, // 1 token every 200ms
    });

    const start = Date.now();
    await rateLimitedFetch("https://a.example.com/jobs");
    await rateLimitedFetch("https://a.example.com/jobs"); // must wait ~200ms (bucket empty)
    const afterSameDomain = Date.now() - start;

    await rateLimitedFetch("https://b.example.com/jobs"); // fresh bucket, must not wait
    const afterDifferentDomain = Date.now() - start;

    expect(afterSameDomain).toBeGreaterThanOrEqual(180);
    expect(afterDifferentDomain - afterSameDomain).toBeLessThan(100);
  });

  it("retries on a 429 and returns the eventual success", async () => {
    const baseFetch = vi.fn().mockResolvedValueOnce(jsonResponse(429)).mockResolvedValueOnce(jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [10, 20],
    });

    const response = await rateLimitedFetch("https://example.com/jobs");

    expect(response.status).toBe(200);
    expect(baseFetch).toHaveBeenCalledTimes(2);
  });

  it("gives up after 3 attempts and returns the last failing response", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(503));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [5, 5],
    });

    const response = await rateLimitedFetch("https://example.com/jobs");

    expect(response.status).toBe(503);
    expect(baseFetch).toHaveBeenCalledTimes(3);
  });

  it("does not retry a plain 200 (no wasted attempts)", async () => {
    const baseFetch = vi.fn(async () => jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [5, 5],
    });

    await rateLimitedFetch("https://example.com/jobs");

    expect(baseFetch).toHaveBeenCalledTimes(1);
  });

  it("applies increasing backoff delays between retries (full jitter at its maximum)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // full jitter always picks the max of the range
    const baseFetch = vi.fn().mockResolvedValueOnce(jsonResponse(500)).mockResolvedValueOnce(jsonResponse(500)).mockResolvedValueOnce(jsonResponse(200));
    const rateLimitedFetch = createRateLimitedFetch(baseFetch as unknown as typeof fetch, {
      bucketCapacity: 10,
      refillPerSecond: 100,
      retryDelaysMs: [30, 60],
    });

    const start = Date.now();
    const response = await rateLimitedFetch("https://example.com/jobs");
    const elapsed = Date.now() - start;

    expect(response.status).toBe(200);
    expect(elapsed).toBeGreaterThanOrEqual(85); // ~30ms + ~60ms, minus small scheduling slack
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/rate-limit/rate-limited-fetch.test.ts`
Expected: FAIL — `Cannot find module './rate-limited-fetch.js'`

- [ ] **Step 3: Write the implementation**

```typescript
// packages/harvester/src/rate-limit/rate-limited-fetch.ts
const DEFAULT_BUCKET_CAPACITY = 3;
const DEFAULT_REFILL_PER_SECOND = 1;
const DEFAULT_RETRY_DELAYS_MS: [number, number] = [500, 1000];
const MAX_ATTEMPTS = 3;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class TokenBucket {
  private tokens: number;
  private lastRefillAt: number;

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
  ) {
    this.tokens = capacity;
    this.lastRefillAt = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsedSeconds = (now - this.lastRefillAt) / 1000;
    this.tokens = Math.min(this.capacity, this.tokens + elapsedSeconds * this.refillPerSecond);
    this.lastRefillAt = now;
  }

  async take(): Promise<void> {
    this.refill();
    if (this.tokens < 1) {
      const waitMs = ((1 - this.tokens) / this.refillPerSecond) * 1000;
      await sleep(waitMs);
      this.refill();
    }
    this.tokens = Math.max(0, this.tokens - 1);
  }
}

function extractHostname(input: RequestInfo | URL): string {
  if (typeof input === "string") return new URL(input).hostname;
  if (input instanceof URL) return input.hostname;
  return new URL(input.url).hostname;
}

export interface RateLimitedFetchOptions {
  bucketCapacity?: number;
  refillPerSecond?: number;
  retryDelaysMs?: [number, number];
}

export function createRateLimitedFetch(baseFetch: typeof fetch, options: RateLimitedFetchOptions = {}): typeof fetch {
  const bucketCapacity = options.bucketCapacity ?? DEFAULT_BUCKET_CAPACITY;
  const refillPerSecond = options.refillPerSecond ?? DEFAULT_REFILL_PER_SECOND;
  const retryDelaysMs = options.retryDelaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const buckets = new Map<string, TokenBucket>();

  return async function rateLimitedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const hostname = extractHostname(input);
    let bucket = buckets.get(hostname);
    if (!bucket) {
      bucket = new TokenBucket(bucketCapacity, refillPerSecond);
      buckets.set(hostname, bucket);
    }

    let response: Response;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      await bucket.take();
      response = await baseFetch(input, init);
      if (response.status !== 429 && response.status < 500) return response;
      if (attempt < MAX_ATTEMPTS) {
        await sleep(Math.random() * retryDelaysMs[attempt - 1]);
      }
    }
    return response!;
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/rate-limit/rate-limited-fetch.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @job-harvester/harvester run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add packages/harvester/src/rate-limit/rate-limited-fetch.ts packages/harvester/src/rate-limit/rate-limited-fetch.test.ts
git commit -m "feat(harvester): add per-domain token bucket + retry/backoff guarded fetch (JOB-12)"
```

---

### Task 2: Wire the guarded fetch into the orchestrator, remove `DomainRateLimiter`

**Files:**
- Modify: `packages/harvester/src/orchestrator.ts`
- Delete: `packages/harvester/src/rate-limit/domain-rate-limiter.ts`
- Delete: `packages/harvester/src/rate-limit/domain-rate-limiter.test.ts`

**Interfaces:**
- Consumes: `createRateLimitedFetch` from Task 1 (`./rate-limit/rate-limited-fetch.js`).
- Produces: `runCampaign` now builds one guarded fetch per call and passes it as `ctx.fetchImpl` instead of the raw `fetch` — no signature change, existing callers/tests are unaffected except for the fetch behavior itself.

- [ ] **Step 1: Write the failing test proving `runCampaign` currently passes the raw `fetch`**

Add to `packages/harvester/src/orchestrator.test.ts`, inside the existing `describe("runCampaign", ...)` block:

```typescript
  it("passes a guarded fetchImpl to the connector, not the raw global fetch (JOB-12)", async () => {
    const db = createDb(tmpDbPath());
    let receivedFetchImpl: typeof fetch | undefined;
    const observingConnector: Connector = {
      id: "observing",
      tier: 0,
      supports: () => true,
      async *fetch(_query, ctx) {
        receivedFetchImpl = ctx.fetchImpl;
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    await runCampaign(campaign, observingConnector, db, {});

    expect(receivedFetchImpl).toBeDefined();
    expect(receivedFetchImpl).not.toBe(fetch);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/orchestrator.test.ts`
Expected: FAIL — `expected [Function: fetch] not to be [Function: fetch]` (today `ctx.fetchImpl` **is** the raw `fetch`)

- [ ] **Step 3: Delete the old rate limiter and its test**

```bash
rm packages/harvester/src/rate-limit/domain-rate-limiter.ts packages/harvester/src/rate-limit/domain-rate-limiter.test.ts
```

- [ ] **Step 4: Update `orchestrator.ts`**

Replace the import and usage (currently `packages/harvester/src/orchestrator.ts:1-8` and `:58,74,76`):

```typescript
// Before (top of file):
import { ulid } from "ulid";
import { eq, and, or } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { DomainRateLimiter } from "./rate-limit/domain-rate-limiter.js";
import { buildHarvestQuery } from "./build-harvest-query.js";
```

```typescript
// After:
import { ulid } from "ulid";
import { eq, and, or } from "drizzle-orm";
import { isFuzzyDuplicate, mergeOffers, type Connector, type NormalizedOffer } from "@job-harvester/core";
import { offers as offersTable, connectorRuns, offerToRow, rowToOffer, type Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { createRateLimitedFetch } from "./rate-limit/rate-limited-fetch.js";
import { buildHarvestQuery } from "./build-harvest-query.js";
```

Inside `runCampaign` (currently line 58, `const rateLimiter = new DomainRateLimiter();`):

```typescript
// Before:
  const rateLimiter = new DomainRateLimiter();
```

```typescript
// After:
  const guardedFetch = createRateLimitedFetch(fetch);
```

And the two call sites that used it (currently lines 74 and 76):

```typescript
// Before:
    await rateLimiter.wait(connector.id);
    try {
      for await (const raw of connector.fetch(query, { fetchImpl: fetch, env })) {
```

```typescript
// After:
    try {
      for await (const raw of connector.fetch(query, { fetchImpl: guardedFetch, env })) {
```

- [ ] **Step 5: Run the harvester test suite to verify everything is green**

Run: `pnpm --filter @job-harvester/harvester exec vitest run`
Expected: PASS — the new test from Step 1 now passes (`ctx.fetchImpl` is the guarded fetch), and all pre-existing `orchestrator.test.ts` tests still pass unmodified (they use a fake `Connector` and never call the real `fetch`, so the change is invisible to them).

- [ ] **Step 6: Typecheck**

Run: `pnpm --filter @job-harvester/harvester run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add packages/harvester/src/orchestrator.ts packages/harvester/src/rate-limit/domain-rate-limiter.ts packages/harvester/src/rate-limit/domain-rate-limiter.test.ts
git commit -m "fix(harvester): replace connector.id-keyed DomainRateLimiter with per-domain guarded fetch (JOB-12)"
```

---

### Task 3: Add the `schedule` field to the campaign schema

**Files:**
- Modify: `packages/harvester/src/config/campaign-schema.ts`
- Modify: `packages/harvester/src/config/load-campaigns.test.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `CampaignConfig.schedule?: string` — read by Task 5's scheduler.

- [ ] **Step 1: Write the failing test**

Add to `packages/harvester/src/config/load-campaigns.test.ts`, inside the existing `describe("loadCampaigns", ...)` block (after the `"parses a valid campaigns file"` test):

```typescript
  it("exposes the schedule field when present, and leaves it undefined when absent", () => {
    const withSchedule = writeCampaignsFile(`
campaigns:
  - id: with-schedule
    romeCodes: [M1403]
    keywords: []
    locations: []
    contractTypes: [apprentissage]
    schedule: "0 7 * * *"
`);
    const withoutSchedule = writeCampaignsFile(`
campaigns:
  - id: without-schedule
    romeCodes: [M1403]
    keywords: []
    locations: []
    contractTypes: [apprentissage]
`);

    expect(findCampaign(loadCampaigns(withSchedule), "with-schedule")?.schedule).toBe("0 7 * * *");
    expect(findCampaign(loadCampaigns(withoutSchedule), "without-schedule")?.schedule).toBeUndefined();
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/config/load-campaigns.test.ts`
Expected: FAIL — `expected undefined to be '0 7 * * *'` (the field is currently silently stripped by Zod)

- [ ] **Step 3: Add the field to the schema**

In `packages/harvester/src/config/campaign-schema.ts`, current schema:

```typescript
export const CampaignConfigSchema = z.object({
  id: z.string(),
  romeCodes: z.array(z.string()),
  keywords: z.array(z.string()),
  locations: z.array(LocationConfigSchema),
  contractTypes: z.array(ContractTypeSchema),
  targets: HarvestTargetsSchema.optional(),
});
```

Change to:

```typescript
export const CampaignConfigSchema = z.object({
  id: z.string(),
  romeCodes: z.array(z.string()),
  keywords: z.array(z.string()),
  locations: z.array(LocationConfigSchema),
  contractTypes: z.array(ContractTypeSchema),
  targets: HarvestTargetsSchema.optional(),
  schedule: z.string().optional(),
});
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/config/load-campaigns.test.ts`
Expected: PASS

- [ ] **Step 5: Run the full harvester suite + typecheck**

Run: `pnpm --filter @job-harvester/harvester exec vitest run && pnpm --filter @job-harvester/harvester run typecheck`
Expected: PASS, no errors

- [ ] **Step 6: Commit**

```bash
git add packages/harvester/src/config/campaign-schema.ts packages/harvester/src/config/load-campaigns.test.ts
git commit -m "feat(harvester): stop silently dropping the schedule field from campaigns.yaml (JOB-5)"
```

---

### Task 4: Extract `runCampaignAcrossConnectors`, reuse it in the HTTP route

**Files:**
- Modify: `packages/harvester/src/orchestrator.ts`
- Modify: `packages/harvester/src/orchestrator.test.ts`
- Modify: `packages/api/src/routes/harvest.ts`

**Interfaces:**
- Consumes: `runCampaign` (already in `orchestrator.ts`), `buildHarvestQuery` from `./build-harvest-query.js` (already imported in `orchestrator.ts`).
- Produces: `runCampaignAcrossConnectors(campaign: CampaignConfig, connectors: Connector[], db: Db, env: Record<string, string | undefined>): Promise<RunSummary[]>` — exported from `packages/harvester` (via the existing `export * from "./orchestrator.js"` in `index.ts`, no change needed there). Returns an **empty array** (not an error) when no connector supports the campaign — callers decide what that means (Task 5's scheduler just does nothing further; the HTTP route below still returns 422).

- [ ] **Step 1: Write the failing test**

Add to `packages/harvester/src/orchestrator.test.ts`, as a new `describe` block at the end of the file:

```typescript
describe("runCampaignAcrossConnectors", () => {
  it("runs only the connectors that support the campaign and returns one summary each", async () => {
    const db = createDb(tmpDbPath());
    const supported: Connector = {
      id: "supported",
      tier: 0,
      supports: () => true,
      async *fetch() {},
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "supported", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const unsupported: Connector = {
      id: "unsupported",
      tier: 0,
      supports: () => false,
      async *fetch() {},
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "unsupported", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const summaries = await runCampaignAcrossConnectors(campaign, [supported, unsupported], db, {});

    expect(summaries).toHaveLength(1);
  });

  it("returns an empty array when no connector supports the campaign", async () => {
    const db = createDb(tmpDbPath());
    const unsupported: Connector = {
      id: "unsupported",
      tier: 0,
      supports: () => false,
      async *fetch() {},
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "unsupported", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const summaries = await runCampaignAcrossConnectors(campaign, [unsupported], db, {});

    expect(summaries).toEqual([]);
  });
});
```

Add `runCampaignAcrossConnectors` to the existing import at the top of the file:

```typescript
// Before:
import { runCampaign } from "./orchestrator.js";
```

```typescript
// After:
import { runCampaign, runCampaignAcrossConnectors } from "./orchestrator.js";
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/orchestrator.test.ts`
Expected: FAIL — `runCampaignAcrossConnectors is not a function` / not exported

- [ ] **Step 3: Add the function to `orchestrator.ts`**

Append at the end of `packages/harvester/src/orchestrator.ts` (after the closing brace of `runCampaign`):

```typescript
export async function runCampaignAcrossConnectors(
  campaign: CampaignConfig,
  connectors: Connector[],
  db: Db,
  env: Record<string, string | undefined>,
): Promise<RunSummary[]> {
  const supportedConnectors = connectors.filter((connector) =>
    campaign.locations.some((location) => connector.supports(buildHarvestQuery(campaign, location))),
  );

  const summaries: RunSummary[] = [];
  for (const connector of supportedConnectors) {
    summaries.push(await runCampaign(campaign, connector, db, env));
  }
  return summaries;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/orchestrator.test.ts`
Expected: PASS

- [ ] **Step 5: Update the HTTP route to reuse it**

Replace the full contents of `packages/api/src/routes/harvest.ts`:

```typescript
// Before:
import type { Hono } from "hono";
import { runCampaign, buildHarvestQuery, type RunSummary } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const supportedConnectors = connectors.filter((connector) =>
      campaign.locations.some((location) => connector.supports(buildHarvestQuery(campaign, location))),
    );
    // 422, pas 500 : ce n'est pas une panne serveur, la configuration de la campagne ne
    // correspond simplement à aucun connecteur enregistré (JOB-29).
    if (supportedConnectors.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    const summaries: RunSummary[] = [];
    for (const connector of supportedConnectors) {
      summaries.push(await runCampaign(campaign, connector, db, env));
    }
    return c.json({ summaries });
  });
}
```

```typescript
// After:
import type { Hono } from "hono";
import { runCampaignAcrossConnectors } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const summaries = await runCampaignAcrossConnectors(campaign, connectors, db, env);
    // 422, pas 500 : ce n'est pas une panne serveur, la configuration de la campagne ne
    // correspond simplement à aucun connecteur enregistré (JOB-29).
    if (summaries.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    return c.json({ summaries });
  });
}
```

- [ ] **Step 6: Run the full api test suite to verify parity**

Run: `pnpm --filter @job-harvester/api exec vitest run`
Expected: PASS — the three existing `POST /harvest/:campaignId/run — multi-connector` tests in `app.test.ts` (selection, 422, targets pass-through) all still pass unmodified against the extracted function.

- [ ] **Step 7: Run harvester + api typecheck**

Run: `pnpm --filter @job-harvester/harvester run typecheck && pnpm --filter @job-harvester/api run typecheck`
Expected: no errors

- [ ] **Step 8: Commit**

```bash
git add packages/harvester/src/orchestrator.ts packages/harvester/src/orchestrator.test.ts packages/api/src/routes/harvest.ts
git commit -m "refactor(harvester,api): extract runCampaignAcrossConnectors, share it between the HTTP route and the future scheduler"
```

---

### Task 5: Cron scheduler

**Files:**
- Modify: `packages/harvester/package.json`
- Create: `packages/harvester/src/scheduler.ts`
- Test: `packages/harvester/src/scheduler.test.ts`
- Modify: `packages/harvester/src/index.ts`

**Interfaces:**
- Consumes: `runCampaignAcrossConnectors` from Task 4 (`./orchestrator.js`), `CampaignConfig` from `./config/campaign-schema.js` (with `schedule` from Task 3).
- Produces: `startScheduler(campaigns: CampaignConfig[], connectors: Connector[], db: Db, env: Record<string, string | undefined>): { stop(): void }` — consumed by Task 6 in `server.ts`.

- [ ] **Step 1: Add the `croner` dependency**

In `packages/harvester/package.json`, add to `"dependencies"`:

```json
    "croner": "^10.0.1",
```

Run: `pnpm install --filter @job-harvester/harvester`

- [ ] **Step 2: Write the failing tests**

```typescript
// packages/harvester/src/scheduler.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb } from "@job-harvester/db";
import type { Connector } from "@job-harvester/core";
import { startScheduler } from "./scheduler.js";
import type { CampaignConfig } from "./config/campaign-schema.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-scheduler-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function makeConnector(callLog: string[]): Connector {
  return {
    id: "fake",
    tier: 0,
    supports: () => true,
    async *fetch() {
      callLog.push("fetched");
    },
    normalize: (raw) => raw.payload as never,
    async healthCheck() {
      return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
    },
  };
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe("startScheduler", () => {
  it("runs a campaign's harvest on its cron schedule", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "every-second",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *", // every second (6-field croner pattern)
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    await wait(1300);
    scheduler.stop();

    expect(callLog.length).toBeGreaterThanOrEqual(1);
  });

  it("does not schedule anything for a campaign without a schedule field", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "no-schedule",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    await wait(1300);
    scheduler.stop();

    expect(callLog).toEqual([]);
  });

  it("stop() prevents any further scheduled runs", async () => {
    const db = createDb(tmpDbPath());
    const callLog: string[] = [];
    const campaign: CampaignConfig = {
      id: "stopped-immediately",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      schedule: "* * * * * *",
    };

    const scheduler = startScheduler([campaign], [makeConnector(callLog)], db, {});
    scheduler.stop();
    await wait(1300);

    expect(callLog).toEqual([]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/scheduler.test.ts`
Expected: FAIL — `Cannot find module './scheduler.js'`

- [ ] **Step 4: Write the implementation**

```typescript
// packages/harvester/src/scheduler.ts
import { Cron } from "croner";
import type { Connector } from "@job-harvester/core";
import type { Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { runCampaignAcrossConnectors } from "./orchestrator.js";

export interface Scheduler {
  stop(): void;
}

function hasSchedule(campaign: CampaignConfig): campaign is CampaignConfig & { schedule: string } {
  return campaign.schedule !== undefined;
}

export function startScheduler(
  campaigns: CampaignConfig[],
  connectors: Connector[],
  db: Db,
  env: Record<string, string | undefined>,
): Scheduler {
  const jobs = campaigns.filter(hasSchedule).map((campaign) =>
    new Cron(
      campaign.schedule,
      { catch: (err: unknown) => console.error(`[scheduler] campagne ${campaign.id} :`, err) },
      () => {
        void runCampaignAcrossConnectors(campaign, connectors, db, env);
      },
    ),
  );

  return {
    stop() {
      for (const job of jobs) job.stop();
    },
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @job-harvester/harvester exec vitest run src/scheduler.test.ts`
Expected: PASS (3 tests; the first two take ~1.3s real time each, that's expected)

- [ ] **Step 6: Export `startScheduler` from the package**

In `packages/harvester/src/index.ts`, current content:

```typescript
export * from "./config/campaign-schema.js";
export * from "./config/load-campaigns.js";
export * from "./orchestrator.js";
export * from "./build-harvest-query.js";
```

Add:

```typescript
export * from "./config/campaign-schema.js";
export * from "./config/load-campaigns.js";
export * from "./orchestrator.js";
export * from "./build-harvest-query.js";
export * from "./scheduler.js";
```

- [ ] **Step 7: Run the full harvester suite + typecheck**

Run: `pnpm --filter @job-harvester/harvester exec vitest run && pnpm --filter @job-harvester/harvester run typecheck`
Expected: PASS, no errors

- [ ] **Step 8: Commit**

```bash
git add packages/harvester/package.json pnpm-lock.yaml packages/harvester/src/scheduler.ts packages/harvester/src/scheduler.test.ts packages/harvester/src/index.ts
git commit -m "feat(harvester): add cron scheduler reading the campaign schedule field (JOB-5)"
```

---

### Task 6: Wire the scheduler into the API server behind `ENABLE_SCHEDULER`

**Files:**
- Modify: `packages/api/src/server.ts`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- Consumes: `startScheduler` from Task 5 (`@job-harvester/harvester`).
- Produces: nothing consumed by later tasks (this is the last task in the plan).

- [ ] **Step 1: Update `server.ts`**

Current content:

```typescript
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "@job-harvester/db";
import { loadCampaigns } from "@job-harvester/harvester";
import { labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

// Resolve against the repo root rather than process.cwd(): `pnpm --filter @job-harvester/api exec`
// (used by the root `dev:api` script) runs with cwd set to this package's directory, not the repo root.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // .env is optional (e.g. tests, CI) — fall back to whatever is already in process.env.
}

const db = createDb(path.resolve(repoRoot, process.env.DB_PATH ?? "./job-harvester.sqlite"));
const campaigns = loadCampaigns(path.resolve(repoRoot, process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml"));

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

Replace with:

```typescript
import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "@job-harvester/db";
import { loadCampaigns, startScheduler } from "@job-harvester/harvester";
import { labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

// Resolve against the repo root rather than process.cwd(): `pnpm --filter @job-harvester/api exec`
// (used by the root `dev:api` script) runs with cwd set to this package's directory, not the repo root.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // .env is optional (e.g. tests, CI) — fall back to whatever is already in process.env.
}

const db = createDb(path.resolve(repoRoot, process.env.DB_PATH ?? "./job-harvester.sqlite"));
const campaigns = loadCampaigns(path.resolve(repoRoot, process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml"));
const connectors = [labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector];

const app = createApp({ db, connectors, campaigns, env: process.env });

if (process.env.ENABLE_SCHEDULER === "true") {
  startScheduler(campaigns, connectors, db, process.env);
  console.log("job-harvester scheduler enabled (ENABLE_SCHEDULER=true)");
}

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
```

`server.ts` has no dedicated test file today (it's just process wiring — `app.ts`/`app.test.ts` already cover the HTTP behavior); this step is verified manually in Step 4 below, consistent with the existing convention.

- [ ] **Step 2: Document `ENABLE_SCHEDULER` in `.env.example`**

Add at the end of `.env.example`:

```bash
# Active le scheduler cron intégré au serveur API (déclenche automatiquement les collectes
# selon le champ `schedule` de chaque campagne dans config/campaigns.yaml). Laisser vide en
# dev local pour ne pas déclencher de collectes réelles vers des API externes à chaque
# redémarrage du serveur.
ENABLE_SCHEDULER=
```

- [ ] **Step 3: Document scheduling in `README.md`**

Insert a new section right after "## Lancer une campagne de collecte" (before "## Ajouter une source"):

```markdown
## Planifier des collectes automatiques (cron)

Chaque campagne de `config/campaigns.yaml` peut définir un champ `schedule` (expression cron,
ex. `"0 7 * * *"` pour 7h chaque jour). Le serveur API programme alors automatiquement
`POST /harvest/:campaignId/run` pour cette campagne à l'horaire indiqué — mais seulement si la
variable d'environnement `ENABLE_SCHEDULER=true` est définie (désactivé par défaut, pour ne pas
lancer de collectes réelles à chaque redémarrage en développement local).
```

- [ ] **Step 4: Manual verification**

Run: `ENABLE_SCHEDULER=true pnpm dev:api`
Expected: the startup log includes `job-harvester scheduler enabled (ENABLE_SCHEDULER=true)` in addition to the usual `job-harvester api listening on http://localhost:3000`. Stop the server with Ctrl-C afterwards.

- [ ] **Step 5: Run the full monorepo test suite + typecheck**

Run: `pnpm -r run test && pnpm -r run typecheck`
Expected: PASS across all packages, no errors

- [ ] **Step 6: Commit**

```bash
git add packages/api/src/server.ts .env.example README.md
git commit -m "feat(api): start the cron scheduler on boot when ENABLE_SCHEDULER=true (JOB-5)"
```
