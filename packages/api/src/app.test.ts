import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, offers as offersTable, applicationEvents as applicationEventsTable, offerToRow } from "@job-harvester/db";
import { exactDedupKeyFromUrl, type NormalizedOffer } from "@job-harvester/core";
import type { CampaignConfig } from "@job-harvester/harvester";
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
    const body = (await res.json()) as { offers: { title: string }[] };

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]!.title).toBe("Data Analyst en alternance");
  });

  it("keeps offers with a NULL postedAt reachable in pagination (COALESCE with firstSeenAt)", async () => {
    const db = createDb(tmpDbPath());
    const offerWithPostedAt: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000B0",
      sourceOfferId: "with-posted-at",
      canonicalUrl: "https://example.com/jobs/2",
      postedAt: "2026-08-10T00:00:00.000Z",
      firstSeenAt: "2026-08-10T00:00:00.000Z",
      lastSeenAt: "2026-08-10T00:00:00.000Z",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/2"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "with-posted-at", canonicalUrl: "https://example.com/jobs/2" }],
    };
    const offerWithNullPostedAt: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000C0",
      sourceOfferId: "null-posted-at",
      canonicalUrl: "https://example.com/jobs/3",
      postedAt: undefined,
      firstSeenAt: "2026-08-05T00:00:00.000Z",
      lastSeenAt: "2026-08-05T00:00:00.000Z",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/3"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "null-posted-at", canonicalUrl: "https://example.com/jobs/3" }],
    };
    db.insert(offersTable).values(offerToRow(offerWithPostedAt)).run();
    db.insert(offersTable).values(offerToRow(offerWithNullPostedAt)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { sourceOfferId: string }[]; nextCursor: string | null };

    expect(res.status).toBe(200);
    const sourceOfferIds = body.offers.map((o) => o.sourceOfferId);
    expect(sourceOfferIds).toContain("with-posted-at");
    expect(sourceOfferIds).toContain("null-posted-at");
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
    const body = (await res.json()) as { status: string };

    expect(body.status).toBe("new");
  });
});

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
    const body = (await getRes.json()) as { status: string; events: unknown[] };
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

  it("returns 404 instead of creating an orphaned event when the offer does not exist (JOB-11)", async () => {
    const db = createDb(tmpDbPath());
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request(`/offers/does-not-exist/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied" }),
    });

    expect(res.status).toBe(404);
    expect(db.select().from(applicationEventsTable).all()).toHaveLength(0);
  });
});

describe("POST /harvest/:campaignId/run", () => {
  it("returns 404 for an unknown campaign", async () => {
    const db = createDb(tmpDbPath());
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });
    const res = await app.request("/harvest/does-not-exist/run", { method: "POST" });
    expect(res.status).toBe(404);
  });
});

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
    const body = (await res.json()) as { summaries: unknown[] };

    expect(res.status).toBe(200);
    expect(body.summaries).toHaveLength(1);
  });

  it("returns 422 when no registered connector supports the campaign (JOB-29)", async () => {
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
    expect(res.status).toBe(422);
  });

  it("passes campaign.targets through to connector.supports so targets-scoped connectors are included", async () => {
    const db = createDb(tmpDbPath());
    let receivedQuery: { targets?: { workday?: unknown[] } } | undefined;
    const targetsAwareConnector = {
      id: "targets-aware",
      tier: 1 as const,
      locationScoped: false,
      supports: (query: { targets?: { workday?: { tenant: string; site: string; dc: string }[] } }) => {
        receivedQuery = query;
        return Boolean(query.targets?.workday && query.targets.workday.length > 0);
      },
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "targets-aware", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const campaign: CampaignConfig = {
      id: "targets-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
      targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }] },
    };
    const app = createApp({ db, connectors: [targetsAwareConnector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/targets-test/run", { method: "POST" });
    const body = (await res.json()) as { summaries: unknown[] };

    expect(res.status).toBe(200);
    expect(body.summaries).toHaveLength(1);
    expect(receivedQuery?.targets?.workday).toEqual([{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }]);
  });
});

describe("GET /connectors/health", () => {
  it("returns null lastRun for a connector that has never run, alongside a live healthCheck() result", async () => {
    const db = createDb(tmpDbPath());
    const fakeConnector = {
      id: "fake",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: unknown) => raw as never,
      async healthCheck() {
        return { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: "2026-08-16T00:00:00.000Z" };
      },
    };
    const app = createApp({ db, connectors: [fakeConnector], campaigns: [], env: {} });
    const res = await app.request("/connectors/health");
    const body = (await res.json()) as { connectors: unknown[] };
    expect(body.connectors).toEqual([
      { connectorId: "fake", lastRun: null, live: { connectorId: "fake", ok: true, latencyMs: 0, checkedAt: "2026-08-16T00:00:00.000Z" } },
    ]);
  });

  it("calls connector.healthCheck() for a real live status, not just the stored last run (JOB-16)", async () => {
    const db = createDb(tmpDbPath());
    let healthCheckCalls = 0;
    const flakyConnector = {
      id: "flaky",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: unknown) => raw as never,
      async healthCheck() {
        healthCheckCalls += 1;
        return { connectorId: "flaky", ok: false, latencyMs: 12, checkedAt: new Date().toISOString(), message: "credentials manquants" };
      },
    };
    const app = createApp({ db, connectors: [flakyConnector], campaigns: [], env: {} });

    const res = await app.request("/connectors/health");
    const body = (await res.json()) as { connectors: { live: { ok: boolean; message?: string } }[] };

    expect(healthCheckCalls).toBe(1);
    expect(body.connectors[0]!.live).toMatchObject({ ok: false, message: "credentials manquants" });
  });
});
