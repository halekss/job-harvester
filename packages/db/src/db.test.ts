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
