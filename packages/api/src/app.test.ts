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
    const body = (await res.json()) as { offers: { title: string }[] };

    expect(res.status).toBe(200);
    expect(body.offers).toHaveLength(1);
    expect(body.offers[0]!.title).toBe("Data Analyst en alternance");
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
});

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
    const body = (await res.json()) as { connectors: unknown };
    expect(body.connectors).toEqual([{ connectorId: "fake", lastRun: null }]);
  });
});
