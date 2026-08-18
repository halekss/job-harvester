import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDb, offers as offersTable, connectorRuns } from "@job-harvester/db";
import type { Connector, NormalizedOffer, RawOffer } from "@job-harvester/core";
import { exactDedupKeyFromUrl } from "@job-harvester/core";
import { runCampaign, runCampaignAcrossConnectors } from "./orchestrator.js";
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

    expect(summary).toMatchObject({ rawCount: 3, normalizedCount: 2, rejectedCount: 1, ok: true });
    expect(summary.errorMessage).toBeUndefined();
    expect(db.select().from(offersTable).all()).toHaveLength(1);
    expect(db.select().from(connectorRuns).all()).toHaveLength(1);
  });

  it("records a failed run when connector.fetch throws, without rethrowing", async () => {
    const brokenConnector: Connector = {
      id: "broken",
      tier: 0,
      supports: () => true,
      async *fetch() {
        throw new Error("network down");
      },
      normalize(raw) {
        return makeOffer("unused", (raw.payload as { url: string }).url);
      },
      async healthCheck() {
        return { connectorId: "broken", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    const db = createDb(tmpDbPath());
    const summary = await runCampaign(campaign, brokenConnector, db, {});

    expect(summary).toMatchObject({ rawCount: 0, normalizedCount: 0, rejectedCount: 0 });
    // JOB-22 : un run échoué doit être distinguable d'un run réussi-mais-vide directement
    // sur le RunSummary retourné, pas seulement sur la ligne connector_runs en base.
    expect(summary.ok).toBe(false);
    expect(summary.errorMessage).toContain("network down");
    expect(db.select().from(offersTable).all()).toHaveLength(0);

    const runs = db.select().from(connectorRuns).all();
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect(run).toBeDefined();
    expect(run).toMatchObject({ ok: false });
    expect(run?.errorMessage).toContain("network down");
  });

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

  it("shares the same guarded fetchImpl (and its rate-limiter state) across separate runCampaign calls (JOB-12)", async () => {
    const db = createDb(tmpDbPath());

    function makeObservingConnector(id: string, capture: { fetchImpl: typeof fetch | undefined }): Connector {
      return {
        id,
        tier: 0,
        supports: () => true,
        async *fetch(_query, ctx) {
          capture.fetchImpl = ctx.fetchImpl;
        },
        normalize: (raw) => raw.payload as never,
        async healthCheck() {
          return { connectorId: id, ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
        },
      };
    }

    const firstCapture: { fetchImpl: typeof fetch | undefined } = { fetchImpl: undefined };
    const secondCapture: { fetchImpl: typeof fetch | undefined } = { fetchImpl: undefined };

    await runCampaign(campaign, makeObservingConnector("observing-1", firstCapture), db, {});
    await runCampaign(campaign, makeObservingConnector("observing-2", secondCapture), db, {});

    expect(firstCapture.fetchImpl).toBeDefined();
    expect(secondCapture.fetchImpl).toBeDefined();
    expect(secondCapture.fetchImpl).toBe(firstCapture.fetchImpl);
  });
});

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
