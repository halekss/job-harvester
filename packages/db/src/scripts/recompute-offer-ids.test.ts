import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { sql } from "drizzle-orm";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { createDb } from "../client.js";
import { offers, applicationEvents } from "../schema.js";
import { offerToRow } from "../mapper.js";
import { recomputeOfferIds } from "./recompute-offer-ids.js";
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

const staleOffer: NormalizedOffer = {
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

describe("recomputeOfferIds", () => {
  it("rewrites an offer's stale random id to the deterministic id and keeps its events linked", () => {
    const dbPath = tmpDbPath();
    const db = createDb(dbPath);
    db.insert(offers).values(offerToRow(staleOffer)).run();
    db.insert(applicationEvents)
      .values({ id: "01J0000000000000000000E0", offerId: staleOffer.id, type: "applied", occurredAt: "2026-08-15T10:00:00.000Z" })
      .run();

    const result = recomputeOfferIds(dbPath);

    const expectedId = exactDedupKeyFromSource("labonnealternance", "abc");
    const offerRows = db.select().from(offers).all();
    const eventRows = db.select().from(applicationEvents).all();

    expect(result).toEqual({ totalOffers: 1, updatedOffers: 1 });
    expect(offerRows).toHaveLength(1);
    expect(offerRows[0]!.id).toBe(expectedId);
    expect(eventRows[0]!.offerId).toBe(expectedId);
  });

  it("is idempotent: a second run makes no further changes", () => {
    const dbPath = tmpDbPath();
    const db = createDb(dbPath);
    db.insert(offers).values(offerToRow(staleOffer)).run();

    recomputeOfferIds(dbPath);
    const secondResult = recomputeOfferIds(dbPath);

    expect(secondResult).toEqual({ totalOffers: 1, updatedOffers: 0 });
  });

  it("refuses to proceed with a clear error when two offers already share (source, sourceOfferId)", () => {
    const dbPath = tmpDbPath();
    const db = createDb(dbPath);
    const duplicate: NormalizedOffer = { ...staleOffer, id: "01J0000000000000000000B0", dedupKey: "url:def", canonicalUrl: "https://example.com/jobs/2" };
    db.insert(offers).values(offerToRow(staleOffer)).run();
    db.insert(offers).values(offerToRow(duplicate)).run();

    expect(() => recomputeOfferIds(dbPath)).toThrow(/duplicate/i);

    const offerRows = db.select().from(offers).all();
    expect(offerRows.map((row) => row.id).sort()).toEqual([staleOffer.id, duplicate.id].sort());
  });

  it("surfaces a pre-existing orphaned event (from before FK enforcement was turned on) via the foreign_key_check safety net", () => {
    const dbPath = tmpDbPath();
    const db = createDb(dbPath);
    db.insert(offers).values(offerToRow(staleOffer)).run();
    db.run(sql`PRAGMA foreign_keys = OFF`);
    db.insert(applicationEvents)
      .values({ id: "01J0000000000000000000E1", offerId: "does-not-exist", type: "applied", occurredAt: "2026-08-15T10:00:00.000Z" })
      .run();
    db.run(sql`PRAGMA foreign_keys = ON`);

    expect(() => recomputeOfferIds(dbPath)).toThrow(/orphan/i);
  });
});
