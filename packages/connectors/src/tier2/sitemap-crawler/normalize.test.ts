import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeJsonLdOffer as normalizeJsonLdOfferFromJsonLdGeneric } from "../jsonld-generic/normalize.js";
import { normalizeJsonLdOffer } from "./normalize.js";

// sitemap-crawler re-exports jsonld-generic's normalize function verbatim (see normalize.ts) —
// this fixture lives under fixtures/jsonld-generic since it's the same JobPosting shape either
// connector finds, whether reached via a configured URL or discovered by crawling a sitemap.
const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/jsonld-generic");

function loadRawOfferPayload(): { pageUrl: string; jobPosting: unknown } {
  const jobPosting = JSON.parse(readFileSync(path.join(fixturesDir, "job-posting.json"), "utf-8"));
  return { pageUrl: "https://careers.acmedata.example/jobs/alternance-developpeur-data-042", jobPosting };
}

describe("sitemap-crawler normalize.ts", () => {
  it("re-exports jsonld-generic's normalizeJsonLdOffer without altering its behavior", () => {
    expect(normalizeJsonLdOffer).toBe(normalizeJsonLdOfferFromJsonLdGeneric);
  });

  it("maps a JobPosting found via a sitemap crawl the same way jsonld-generic would", () => {
    const offer = normalizeJsonLdOffer({ source: "sitemap-crawler", payload: loadRawOfferPayload() });

    expect(offer.title).toBe("Alternance Développeur Data (H/F)");
    expect(offer.company.name).toBe("AcmeData");
    expect(offer.contractType).toBe("apprentissage");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeJsonLdOffer({ source: "sitemap-crawler", payload: { nope: true } })).toThrow();
  });
});
