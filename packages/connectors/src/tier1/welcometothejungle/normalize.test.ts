import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { normalizeWttjOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/welcometothejungle");

function loadHits(): Array<Record<string, unknown>> {
  const parsed = JSON.parse(readFileSync(path.join(fixturesDir, "algolia-result.json"), "utf-8"));
  return parsed.hits;
}

describe("normalizeWttjOffer", () => {
  it("maps fields and builds the canonical company/job URL", () => {
    const hits = loadHits();
    const hit = hits[0]!;
    const offer = normalizeWttjOffer({ source: "welcometothejungle", payload: hit });

    expect(offer.source).toBe("welcometothejungle");
    expect(offer.sourceOfferId).toBe("4202854");
    expect(offer.title).toBe("Alternance - Data Analyst Credit Risk (F/H)");
    expect(offer.company.name).toBe("Younited");
    expect(offer.canonicalUrl).toBe("https://www.welcometothejungle.com/fr/companies/younited-credit/jobs/alternance-data-analyst-credit-risk-f-h_paris");
    expect(offer.location.city).toBe("Paris");
    expect(offer.location.lat).toBeCloseTo(48.8759104);
    expect(offer.location.lng).toBeCloseTo(2.3382473);
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.durationMonths).toBe(12);
    expect(offer.remotePolicy).toBe("hybrid");
    expect(offer.postedAt).toBe("2026-08-18T14:00:00.000+02:00");
  });

  it("falls back to an empty description when profile is null", () => {
    const hits = loadHits();
    const thales = hits.find((h) => h.objectID === "4128182")!;
    const offer = normalizeWttjOffer({ source: "welcometothejungle", payload: thales });

    expect(offer.descriptionText).toBe("");
    expect(offer.remotePolicy).toBe("unknown");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeWttjOffer({ source: "welcometothejungle", payload: { nope: true } })).toThrow();
  });

  it("derives a deterministic id from source and sourceOfferId", () => {
    const hits = loadHits();
    const offer1 = normalizeWttjOffer({ source: "welcometothejungle", payload: hits[0] });
    const offer2 = normalizeWttjOffer({ source: "welcometothejungle", payload: hits[0] });

    expect(offer1.id).toBe(offer2.id);
    expect(offer1.id).toBe(exactDedupKeyFromSource("welcometothejungle", "4202854"));
  });
});
