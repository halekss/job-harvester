import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { normalizeSmartRecruitersOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/smartrecruiters");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

function loadRawOfferPayload(): { company: string; detail: unknown } {
  return { company: "MAZARS", detail: loadFixture("posting-detail-alternance.json") };
}

describe("normalizeSmartRecruitersOffer", () => {
  it("maps fields and strips HTML from the description", () => {
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: loadRawOfferPayload() });

    expect(offer.source).toBe("smartrecruiters");
    expect(offer.sourceOfferId).toBe("743000000000001");
    expect(offer.title).toBe("Alternance Data Analyst H/F");
    expect(offer.descriptionText).toBe("Poste en apprentissage au sein de l'équipe data.");
    expect(offer.applyUrl).toBe("https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.location.department).toBe("59");
    expect(offer.company.normalizedName).toBe("mazars");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.postedAt).toBe("2026-07-15T09:00:00.000Z");
    expect(offer.romeCodes).toEqual([]);
    expect(offer.originSource).toBeUndefined();
  });

  it("falls back to postingUrl when applyUrl is absent", () => {
    const raw = loadRawOfferPayload();
    const { applyUrl: _drop, ...detailWithoutApplyUrl } = raw.detail as Record<string, unknown>;
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: { ...raw, detail: detailWithoutApplyUrl } });
    expect(offer.applyUrl).toBe("https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f");
  });

  it("falls back to a real, working API endpoint (with the company slug) when both applyUrl and postingUrl are absent (JOB-34)", () => {
    const raw = loadRawOfferPayload();
    const { applyUrl: _dropA, postingUrl: _dropB, ...detailWithoutUrls } = raw.detail as Record<string, unknown>;
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: { ...raw, detail: detailWithoutUrls } });
    expect(offer.applyUrl).toBe("https://api.smartrecruiters.com/v1/companies/MAZARS/postings/743000000000001");
  });

  it("computes a 3-digit department for a DOM postal code (JOB-27)", () => {
    const raw = loadRawOfferPayload();
    const detail = raw.detail as Record<string, unknown>;
    const domPayload = { ...raw, detail: { ...detail, location: { city: "Fort-de-France", postalCode: "97200" } } };

    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: domPayload });

    expect(offer.location.department).toBe("972");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: { nope: true } })).toThrow();
  });

  it("derives a deterministic id from source and sourceOfferId (stable across DB reconstruction)", () => {
    const offer1 = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: loadRawOfferPayload() });
    const offer2 = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: loadRawOfferPayload() });

    expect(offer1.id).toBe(offer2.id);
    expect(offer1.id).toBe(exactDedupKeyFromSource("smartrecruiters", "743000000000001"));
  });
});
