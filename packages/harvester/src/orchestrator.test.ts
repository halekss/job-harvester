import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { ulid } from "ulid";
import { createDb, offers as offersTable, connectorRuns, type Db } from "@job-harvester/db";
import type { Connector, NormalizedOffer, RawOffer } from "@job-harvester/core";
import { exactDedupKeyFromUrl } from "@job-harvester/core";
import { runCampaign, runCampaignAcrossConnectors } from "./orchestrator.js";
import type { CampaignConfig } from "./config/campaign-schema.js";

vi.mock("./linear/client.js", () => ({
  searchIssueByTitle: vi.fn(async () => []),
  createIssue: vi.fn(async () => ({ id: "linear-issue-1", identifier: "ENG-1", title: "mock", state: { name: "Backlog" } })),
  commentOnIssue: vi.fn(async () => undefined),
  transitionIssueState: vi.fn(async () => undefined),
}));

import { searchIssueByTitle, createIssue, commentOnIssue, transitionIssueState } from "./linear/client.js";

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

describe("runCampaign — ad-hoc filter overrides (JOB-audit-2026-08-21)", () => {
  it("passes overridden keywords/contractTypes through to connector.fetch's query", async () => {
    const db = createDb(tmpDbPath());
    let receivedQuery: { keywords: string[]; contractTypes: string[] } | undefined;
    const observingConnector: Connector = {
      id: "observing-overrides",
      tier: 0,
      supports: () => true,
      async *fetch(query) {
        receivedQuery = query as { keywords: string[]; contractTypes: string[] };
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-overrides", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    await runCampaign(campaign, observingConnector, db, {}, { keywords: ["marketing"], contractTypes: ["autre"] });

    expect(receivedQuery?.keywords).toEqual(["marketing"]);
    expect(receivedQuery?.contractTypes).toEqual(["autre"]);
  });

  it("restricts the run to a single overridden location instead of looping over every campaign location", async () => {
    const db = createDb(tmpDbPath());
    const multiLocationCampaign: CampaignConfig = {
      id: "multi-location-override-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [
        { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
        { label: "Amiens", lat: 49.9, lng: 2.29, radiusKm: 30 },
      ],
      contractTypes: ["apprentissage"],
    };
    const seenLocations: string[] = [];
    const observingConnector: Connector = {
      id: "observing-location",
      tier: 0,
      supports: () => true,
      async *fetch(query) {
        seenLocations.push((query as { location: { label: string } }).location.label);
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-location", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const amiens = multiLocationCampaign.locations[1]!;

    await runCampaign(multiLocationCampaign, observingConnector, db, {}, { location: amiens });

    expect(seenLocations).toEqual(["Amiens"]);
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

// JOB-8 : alerte de seuil (moyenne mobile) + remontée Linear déduplifiée.
describe("runCampaign — connector observability (JOB-8)", () => {
  function insertRun(
    db: Db,
    connectorId: string,
    normalizedCount: number,
    startedAt: string,
    ok = true,
  ): void {
    db.insert(connectorRuns)
      .values({
        id: ulid(),
        connectorId,
        campaignId: campaign.id,
        startedAt,
        finishedAt: startedAt,
        rawCount: normalizedCount,
        normalizedCount,
        rejectedCount: 0,
        httpStatusesSeen: [],
        ok,
        errorMessage: ok ? undefined : "simulated failure",
      })
      .run();
  }

  function insertBaseline(db: Db, connectorId: string, count: number, normalizedCount: number): void {
    for (let i = 0; i < count; i += 1) {
      insertRun(db, connectorId, normalizedCount, `2020-01-01T00:0${i}:00.000Z`);
    }
  }

  function connectorYielding(id: string, tier: 0 | 1 | 2, urls: string[]): Connector {
    return {
      id,
      tier,
      supports: () => true,
      async *fetch() {
        for (const url of urls) yield { source: id, payload: { id: url, url } };
      },
      normalize(raw) {
        const payload = raw.payload as { id: string; url: string };
        return makeOffer(payload.id, payload.url);
      },
      async healthCheck() {
        return { connectorId: id, ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
  }

  beforeEach(() => {
    vi.mocked(searchIssueByTitle).mockReset().mockResolvedValue([]);
    vi.mocked(createIssue)
      .mockReset()
      .mockResolvedValue({ id: "linear-issue-1", identifier: "ENG-1", title: "mock", state: { name: "Backlog" } });
    vi.mocked(commentOnIssue).mockReset().mockResolvedValue(undefined);
    vi.mocked(transitionIssueState).mockReset().mockResolvedValue(undefined);
  });

  it("reports a volume-drop incident when normalizedCount falls under 50% of the moving average", async () => {
    const db = createDb(tmpDbPath());
    insertBaseline(db, "drop-connector", 5, 10);
    const connector = connectorYielding("drop-connector", 1, ["https://example.com/a", "https://example.com/b"]);

    await runCampaign(campaign, connector, db, {});

    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[connector:drop-connector] volume-drop",
        labelIds: ["tier-1", "volume-drop"],
      }),
    );
    expect(commentOnIssue).not.toHaveBeenCalled();
  });

  it("does not create a second issue when an incident is already open for the connector", async () => {
    const db = createDb(tmpDbPath());
    insertBaseline(db, "repeat-connector", 5, 10);
    vi.mocked(searchIssueByTitle).mockResolvedValue([
      { id: "existing-issue", identifier: "ENG-9", title: "[connector:repeat-connector] volume-drop", state: { name: "Backlog" } },
    ]);
    const connector = connectorYielding("repeat-connector", 0, ["https://example.com/a"]);

    await runCampaign(campaign, connector, db, {});

    expect(createIssue).not.toHaveBeenCalled();
    expect(commentOnIssue).toHaveBeenCalledWith("existing-issue", expect.any(String));
  });

  it("resolves the open incident and transitions it to Done when the connector is healthy again", async () => {
    const db = createDb(tmpDbPath());
    vi.mocked(searchIssueByTitle).mockResolvedValue([
      { id: "existing-issue", identifier: "ENG-9", title: "[connector:recovered-connector] volume-drop", state: { name: "Backlog" } },
    ]);
    const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/offer-${i}`);
    const connector = connectorYielding("recovered-connector", 2, urls);

    await runCampaign(campaign, connector, db, {});

    expect(createIssue).not.toHaveBeenCalled();
    expect(commentOnIssue).toHaveBeenCalledWith("existing-issue", expect.any(String));
    expect(transitionIssueState).toHaveBeenCalledWith("existing-issue", "Done");
  });

  it("reports a health-check-failed incident when the run itself failed", async () => {
    const db = createDb(tmpDbPath());
    const brokenConnector: Connector = {
      id: "broken-observability",
      tier: 2,
      supports: () => true,
      async *fetch() {
        throw new Error("connector exploded");
      },
      normalize: (raw) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "broken-observability", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };

    await runCampaign(campaign, brokenConnector, db, {});

    expect(createIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "[connector:broken-observability] health-check-failed",
        labelIds: ["tier-2", "health-check-failed"],
      }),
    );
  });

  it("never lets a Linear API failure make runCampaign fail — the run is still recorded", async () => {
    const db = createDb(tmpDbPath());
    vi.mocked(searchIssueByTitle).mockRejectedValue(new Error("Linear is down"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const connector = connectorYielding("linear-outage-connector", 0, ["https://example.com/only"]);

    const summary = await runCampaign(campaign, connector, db, {});

    expect(summary.ok).toBe(true);
    const runs = db.select().from(connectorRuns).where(eq(connectorRuns.connectorId, "linear-outage-connector")).all();
    expect(runs).toHaveLength(1);
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining("linear-outage-connector"),
      expect.any(Error),
    );

    consoleErrorSpy.mockRestore();
  });
});
