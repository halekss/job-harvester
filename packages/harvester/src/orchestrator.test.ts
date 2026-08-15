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
    expect(db.select().from(offersTable).all()).toHaveLength(0);

    const runs = db.select().from(connectorRuns).all();
    expect(runs).toHaveLength(1);
    const [run] = runs;
    expect(run).toBeDefined();
    expect(run).toMatchObject({ ok: false });
    expect(run?.errorMessage).toContain("network down");
  });
});
