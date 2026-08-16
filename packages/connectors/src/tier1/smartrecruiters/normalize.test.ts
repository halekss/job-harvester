import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeSmartRecruitersOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/smartrecruiters");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeSmartRecruitersOffer", () => {
  it("maps fields and strips HTML from the description", () => {
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: loadFixture("posting-detail-alternance.json") });

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
    const fixture = loadFixture("posting-detail-alternance.json") as Record<string, unknown>;
    const { applyUrl: _drop, ...withoutApplyUrl } = fixture;
    const offer = normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: withoutApplyUrl });
    expect(offer.applyUrl).toBe("https://jobs.smartrecruiters.com/Mazars/743000000000001-alternance-data-analyst-h-f");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeSmartRecruitersOffer({ source: "smartrecruiters", payload: { nope: true } })).toThrow();
  });
});
