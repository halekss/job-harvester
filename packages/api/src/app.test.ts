import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  it("exposes nextFollowUpAt as the earliest non-null follow-up among an offer's events (JOB-9)", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(applicationEventsTable)
      .values([
        { id: "evt-1", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-01T00:00:00.000Z", nextFollowUpAt: "2026-08-20T00:00:00.000Z" },
        { id: "evt-2", offerId: sampleOffer.id, type: "followup", occurredAt: "2026-08-05T00:00:00.000Z", nextFollowUpAt: "2026-08-15T00:00:00.000Z" },
        { id: "evt-3", offerId: sampleOffer.id, type: "no_reply", occurredAt: "2026-08-06T00:00:00.000Z", nextFollowUpAt: null },
      ])
      .run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { id: string; nextFollowUpAt: string | null }[] };

    expect(res.status).toBe(200);
    expect(body.offers[0]!.nextFollowUpAt).toBe("2026-08-15T00:00:00.000Z");
  });

  it("exposes nextFollowUpAt as null when an offer has no events with a follow-up date", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { nextFollowUpAt: string | null }[] };

    expect(body.offers[0]!.nextFollowUpAt).toBeNull();
  });

  it("exposes activeEvents as the latest event id per type, so several action types can show as active at once", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(applicationEventsTable)
      .values([
        { id: "evt-1", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-01T00:00:00.000Z" },
        { id: "evt-2", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-05T00:00:00.000Z" },
        { id: "evt-3", offerId: sampleOffer.id, type: "interview", occurredAt: "2026-08-06T00:00:00.000Z" },
      ])
      .run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { activeEvents: Record<string, string> }[] };

    expect(body.offers[0]!.activeEvents).toEqual({ applied: "evt-2", interview: "evt-3" });
  });

  it("exposes activeEvents as an empty object when an offer has no events", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { activeEvents: Record<string, string> }[] };

    expect(body.offers[0]!.activeEvents).toEqual({});
  });

  it("exposes status as the type of the most recent event across all types", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(applicationEventsTable)
      .values([
        { id: "evt-1", offerId: sampleOffer.id, type: "applied", occurredAt: "2026-08-01T00:00:00.000Z" },
        { id: "evt-2", offerId: sampleOffer.id, type: "interview", occurredAt: "2026-08-05T00:00:00.000Z" },
      ])
      .run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { status: string }[] };

    expect(body.offers[0]!.status).toBe("interview");
  });

  it("exposes status 'new' when an offer has no events", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/offers");
    const body = (await res.json()) as { offers: { status: string }[] };

    expect(body.offers[0]!.status).toBe("new");
  });
});

// Audit 2026-08-26 : "le but du jobboard est d'afficher les offres correspondant à la
// recherche" — GET /offers?campaignId=... doit réévaluer chaque offre stockée avec les mêmes
// critères (mots-clés/contrat/localisations) que la collecte, pas se contenter de renvoyer tout
// l'historique jamais collecté (ex. une offre "Pentester" restée en base depuis avant JOB-73).
describe("GET /offers — campaign scoping", () => {
  const dataCampaign: CampaignConfig = {
    id: "alternance-data-hdf",
    romeCodes: ["M1403"],
    keywords: ["data"],
    locations: [{ label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 }],
    contractTypes: ["apprentissage", "professionnalisation"],
  };

  it("hides an offer that no longer matches the campaign's criteria (wrong contractType) without deleting it", async () => {
    const db = createDb(tmpDbPath());
    const offTopic: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000P0",
      sourceOfferId: "pentester",
      canonicalUrl: "https://example.com/jobs/pentester",
      title: "Consultant Sécurité Offensive – Pentester (H/F)",
      contractType: "autre",
      location: { label: "Paris", city: "Paris" },
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/pentester"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "pentester", canonicalUrl: "https://example.com/jobs/pentester" }],
    };
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(offersTable).values(offerToRow(offTopic)).run();
    const app = createApp({ db, connectors: [], campaigns: [dataCampaign], env: {} });

    const scoped = await app.request("/offers?campaignId=alternance-data-hdf");
    const scopedBody = (await scoped.json()) as { offers: { title: string }[] };
    expect(scopedBody.offers.map((o) => o.title)).toEqual([sampleOffer.title]);

    const unscoped = await app.request("/offers");
    const unscopedBody = (await unscoped.json()) as { offers: unknown[] };
    expect(unscopedBody.offers).toHaveLength(2);
  });

  it("falls back to no scoping when campaignId doesn't match any configured campaign", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [dataCampaign], env: {} });

    const res = await app.request("/offers?campaignId=does-not-exist");
    const body = (await res.json()) as { offers: unknown[] };
    expect(body.offers).toHaveLength(1);
  });

  it("keeps pagination correct when campaign-matching offers are sparse across more than one internal DB page", async () => {
    const db = createDb(tmpDbPath());
    // 60 offres hors-critères (contractType "autre") + 3 offres qui matchent, sur un total de 63
    // lignes > PAGE_SIZE (50) : force fetchOffersPage à consommer plus d'une page DB.
    for (let i = 0; i < 60; i++) {
      const offer: NormalizedOffer = {
        ...sampleOffer,
        id: `01J000000000000000000N${i.toString().padStart(2, "0")}`,
        sourceOfferId: `noise-${i}`,
        canonicalUrl: `https://example.com/jobs/noise-${i}`,
        title: `Offre bruit ${i}`,
        contractType: "autre",
        postedAt: `2026-08-${String((i % 27) + 1).padStart(2, "0")}T00:00:00.000Z`,
        dedupKey: exactDedupKeyFromUrl(`https://example.com/jobs/noise-${i}`),
        sourceRefs: [{ source: "labonnealternance", sourceOfferId: `noise-${i}`, canonicalUrl: `https://example.com/jobs/noise-${i}` }],
      };
      db.insert(offersTable).values(offerToRow(offer)).run();
    }
    for (let i = 0; i < 3; i++) {
      const offer: NormalizedOffer = {
        ...sampleOffer,
        id: `01J000000000000000000M${i}`,
        sourceOfferId: `match-${i}`,
        canonicalUrl: `https://example.com/jobs/match-${i}`,
        title: `Data Analyst match ${i}`,
        postedAt: "2026-08-15T00:00:00.000Z",
        dedupKey: exactDedupKeyFromUrl(`https://example.com/jobs/match-${i}`),
        sourceRefs: [{ source: "labonnealternance", sourceOfferId: `match-${i}`, canonicalUrl: `https://example.com/jobs/match-${i}` }],
      };
      db.insert(offersTable).values(offerToRow(offer)).run();
    }
    const app = createApp({ db, connectors: [], campaigns: [dataCampaign], env: {} });

    const res = await app.request("/offers?campaignId=alternance-data-hdf");
    const body = (await res.json()) as { offers: { sourceOfferId: string }[]; nextCursor: string | null };

    expect(body.offers.map((o) => o.sourceOfferId).sort()).toEqual(["match-0", "match-1", "match-2"]);
    expect(body.nextCursor).toBeNull();
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

describe("DELETE /offers/:id/events/:eventId", () => {
  it("deletes an existing event", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const postRes = await app.request(`/offers/${sampleOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied", channel: "email" }),
    });
    const { event } = (await postRes.json()) as { event: { id: string } };

    const deleteRes = await app.request(`/offers/${sampleOffer.id}/events/${event.id}`, { method: "DELETE" });
    const body = (await deleteRes.json()) as { ok: boolean };

    expect(deleteRes.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(db.select().from(applicationEventsTable).all()).toHaveLength(0);
  });

  it("returns 404 for an unknown event", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request(`/offers/${sampleOffer.id}/events/does-not-exist`, { method: "DELETE" });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the event belongs to a different offer", async () => {
    const db = createDb(tmpDbPath());
    const otherOffer: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000D0",
      sourceOfferId: "other-offer",
      canonicalUrl: "https://example.com/jobs/4",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/4"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "other-offer", canonicalUrl: "https://example.com/jobs/4" }],
    };
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    db.insert(offersTable).values(offerToRow(otherOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const postRes = await app.request(`/offers/${sampleOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied" }),
    });
    const { event } = (await postRes.json()) as { event: { id: string } };

    const res = await app.request(`/offers/${otherOffer.id}/events/${event.id}`, { method: "DELETE" });

    expect(res.status).toBe(404);
    expect(db.select().from(applicationEventsTable).all()).toHaveLength(1);
  });
});

describe("GET /stats", () => {
  it("aggregates offers by source, by derived status, and computes the response rate", async () => {
    const db = createDb(tmpDbPath());

    // 2 offres labonnealternance : une "applied" restée sans réponse, une "applied" -> "interview".
    const appliedNoReplyOffer: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000E0",
      sourceOfferId: "applied-no-reply",
      canonicalUrl: "https://example.com/jobs/5",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/5"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "applied-no-reply", canonicalUrl: "https://example.com/jobs/5" }],
    };
    const appliedInterviewOffer: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000F0",
      sourceOfferId: "applied-interview",
      canonicalUrl: "https://example.com/jobs/6",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/6"),
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "applied-interview", canonicalUrl: "https://example.com/jobs/6" }],
    };
    // 1 offre d'une autre source, jamais postulée -> statut "new".
    const otherSourceOffer: NormalizedOffer = {
      ...sampleOffer,
      id: "01J0000000000000000000G0",
      source: "francetravail",
      sourceOfferId: "other-source",
      canonicalUrl: "https://example.com/jobs/7",
      dedupKey: exactDedupKeyFromUrl("https://example.com/jobs/7"),
      sourceRefs: [{ source: "francetravail", sourceOfferId: "other-source", canonicalUrl: "https://example.com/jobs/7" }],
    };

    db.insert(offersTable).values(offerToRow(appliedNoReplyOffer)).run();
    db.insert(offersTable).values(offerToRow(appliedInterviewOffer)).run();
    db.insert(offersTable).values(offerToRow(otherSourceOffer)).run();

    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    await app.request(`/offers/${appliedNoReplyOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied", occurredAt: "2026-08-01T00:00:00.000Z" }),
    });
    await app.request(`/offers/${appliedInterviewOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "applied", occurredAt: "2026-08-01T00:00:00.000Z" }),
    });
    await app.request(`/offers/${appliedInterviewOffer.id}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "interview", occurredAt: "2026-08-05T00:00:00.000Z" }),
    });

    const res = await app.request("/stats");
    const body = (await res.json()) as {
      bySource: Record<string, number>;
      byStatus: Record<string, number>;
      responseRate: { applied: number; responded: number; rate: number | null };
    };

    expect(res.status).toBe(200);
    expect(body.bySource).toEqual({ labonnealternance: 2, francetravail: 1 });
    expect(body.byStatus).toEqual({ applied: 1, interview: 1, new: 1 });
    expect(body.responseRate).toEqual({ applied: 2, responded: 1, rate: 0.5 });
  });

  it("returns a null rate when no offer has been applied to", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });

    const res = await app.request("/stats");
    const body = (await res.json()) as { responseRate: { applied: number; responded: number; rate: number | null } };

    expect(res.status).toBe(200);
    expect(body.responseRate).toEqual({ applied: 0, responded: 0, rate: null });
  });
});

describe("GET /campaigns", () => {
  it("lists the configured campaign ids (JOB-20)", async () => {
    const db = createDb(tmpDbPath());
    const campaigns: CampaignConfig[] = [
      { id: "alternance-data-hdf", romeCodes: ["M1403"], keywords: [], locations: [], contractTypes: ["apprentissage"] },
      { id: "alternance-devweb-hdf", romeCodes: ["M1805"], keywords: [], locations: [], contractTypes: ["apprentissage"] },
    ];
    const app = createApp({ db, connectors: [], campaigns, env: {} });

    const res = await app.request("/campaigns");
    const body = (await res.json()) as { campaigns: { id: string }[] };

    expect(res.status).toBe(200);
    expect(body.campaigns).toEqual([{ id: "alternance-data-hdf" }, { id: "alternance-devweb-hdf" }]);
  });
});

describe("POST /harvest/:campaignId/run", () => {
  it("returns 404 for an unknown campaign", async () => {
    const db = createDb(tmpDbPath());
    const app = createApp({ db, connectors: [], campaigns: [], env: {} });
    const res = await app.request("/harvest/does-not-exist/run", { method: "POST" });
    expect(res.status).toBe(404);
  });

  // Un seul jeu de critères par campagne (audit 2026-08-26) : plus de filtres ad-hoc côté
  // requête, le run utilise toujours keywords/contractTypes/locations tels que définis dans
  // campaigns.yaml pour cette campagne.
  it("always uses the campaign's own keywords/contractTypes/locations, ignoring any request body", async () => {
    const db = createDb(tmpDbPath());
    let receivedQuery: { keywords: string[]; contractTypes: string[]; location: { label: string } } | undefined;
    const observingConnector = {
      id: "observing",
      tier: 0 as const,
      supports: () => true,
      async *fetch(query: unknown) {
        receivedQuery = query as typeof receivedQuery;
      },
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const campaign: CampaignConfig = {
      id: "single-criteria-test",
      romeCodes: ["M1403"],
      keywords: ["data"],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [observingConnector], campaigns: [campaign], env: {} });

    // Un éventuel corps de requête est ignoré : il n'y a plus de schéma de filtres ad-hoc.
    const res = await app.request("/harvest/single-criteria-test/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keywords: ["marketing"], contractTypes: ["autre"] }),
    });

    expect(res.status).toBe(200);
    expect(receivedQuery?.keywords).toEqual(["data"]);
    expect(receivedQuery?.contractTypes).toEqual(["apprentissage"]);
    expect(receivedQuery?.location).toEqual({ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 });
  });

  it("runs with no request body (the normal case)", async () => {
    const db = createDb(tmpDbPath());
    let fetchCallCount = 0;
    const observingConnector = {
      id: "observing-no-body",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {
        fetchCallCount += 1;
      },
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-no-body", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const campaign: CampaignConfig = {
      id: "no-body-test",
      romeCodes: ["M1403"],
      keywords: ["data"],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [observingConnector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/no-body-test/run", { method: "POST" });

    expect(res.status).toBe(200);
    expect(fetchCallCount).toBe(1);
  });

  it("runs target discovery after a successful harvest when campaignsFilePath is provided, and reports it in the response", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-route-"));
    tmpDirs.push(dir);
    const campaignsFilePath = path.join(dir, "campaigns.yaml");
    writeFileSync(
      campaignsFilePath,
      `campaigns:
  - id: discovery-route-test
    romeCodes: [M1403]
    keywords: []
    locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }]
    contractTypes: [apprentissage]
`,
      "utf-8",
    );
    const connector = {
      id: "observing",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const discoveryFetchImpl = async () => new Response(JSON.stringify({ count: 1 }), { status: 200 });
    const app = createApp({ db, connectors: [connector], campaigns: [{ id: "discovery-route-test", romeCodes: ["M1403"], keywords: [], locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }], contractTypes: ["apprentissage"] }], env: {}, campaignsFilePath, discoveryFetchImpl });

    const res = await app.request("/harvest/discovery-route-test/run", { method: "POST" });
    const body = (await res.json()) as { discoveries: { probed: number; found: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.discoveries.probed).toBe(1);
    expect(body.discoveries.found.length).toBeGreaterThan(0);
  });

  it("never lets a discovery failure block the harvest response — the harvest already succeeded and is already persisted", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(sampleOffer)).run();
    const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-failure-"));
    tmpDirs.push(dir);
    // Deliberately never written: makes discoverTargets throw synchronously (via
    // addTargetToCampaigns's readFileSync) once it confirms a target, well past the point
    // where any per-probe try/catch could help — this is exactly the kind of discovery-path
    // failure that must never take the harvest response down with it.
    const campaignsFilePath = path.join(dir, "campaigns-never-written.yaml");
    const connector = {
      id: "observing-discovery-failure",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-discovery-failure", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const discoveryFetchImpl = async () => new Response(JSON.stringify({ count: 1 }), { status: 200 });
    const app = createApp({
      db,
      connectors: [connector],
      campaigns: [{ id: "discovery-failure-test", romeCodes: ["M1403"], keywords: [], locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }], contractTypes: ["apprentissage"] }],
      env: {},
      campaignsFilePath,
      discoveryFetchImpl,
    });

    const res = await app.request("/harvest/discovery-failure-test/run", { method: "POST" });
    const body = (await res.json()) as { summaries: unknown[]; discoveries: { probed: number; found: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.summaries.length).toBeGreaterThan(0);
    expect(body.discoveries).toEqual({ probed: 0, found: [] });
  });

  it("omits real discovery work when campaignsFilePath is not provided (back-compat)", async () => {
    const db = createDb(tmpDbPath());
    const connector = {
      id: "observing-no-discovery",
      tier: 0 as const,
      supports: () => true,
      async *fetch() {},
      normalize: (raw: { payload: unknown }) => raw.payload as never,
      async healthCheck() {
        return { connectorId: "observing-no-discovery", ok: true, latencyMs: 0, checkedAt: new Date().toISOString() };
      },
    };
    const campaign: CampaignConfig = {
      id: "no-discovery-test",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };
    const app = createApp({ db, connectors: [connector], campaigns: [campaign], env: {} });

    const res = await app.request("/harvest/no-discovery-test/run", { method: "POST" });
    const body = (await res.json()) as { discoveries: { probed: number; found: unknown[] } };

    expect(res.status).toBe(200);
    expect(body.discoveries).toEqual({ probed: 0, found: [] });
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
