import { describe, it, expect } from "vitest";
import { isDuplicate, mergeOffers } from "./merge.js";
import { exactDedupKeyFromUrl } from "./dedup-key.js";
import type { NormalizedOffer } from "../schemas/normalized-offer.js";

function makeOffer(overrides: Partial<NormalizedOffer>): NormalizedOffer {
  const canonicalUrl = overrides.canonicalUrl ?? "https://example.com/jobs/1";
  return {
    id: "01J0000000000000000000A0",
    source: "labonnealternance",
    sourceOfferId: "abc",
    canonicalUrl,
    title: "Data Analyst",
    company: { name: "Acme SAS", normalizedName: "acme" },
    location: { label: "Lille", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: ["M1403"],
    descriptionText: "short",
    firstSeenAt: "2026-08-10T00:00:00.000Z",
    lastSeenAt: "2026-08-10T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc", canonicalUrl }],
    rawPayload: {},
    ...overrides,
  };
}

describe("isDuplicate", () => {
  it("matches two offers with the same canonicalUrl", () => {
    const a = makeOffer({});
    const b = makeOffer({ id: "01J0000000000000000000B0" });
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("fuzzy-matches offers with the same company/title/city via different URLs", () => {
    const a = makeOffer({ canonicalUrl: "https://hellowork.com/jobs/1" });
    const b = makeOffer({
      id: "01J0000000000000000000B0",
      sourceOfferId: "def",
      canonicalUrl: "https://acme.com/careers/1",
      dedupKey: exactDedupKeyFromUrl("https://acme.com/careers/1"),
      company: { name: "ACME", normalizedName: "acme" },
    });
    expect(isDuplicate(a, b)).toBe(true);
  });

  it("does not match unrelated offers", () => {
    const a = makeOffer({});
    const b = makeOffer({
      id: "01J0000000000000000000C0",
      sourceOfferId: "xyz",
      canonicalUrl: "https://other.com/jobs/9",
      dedupKey: exactDedupKeyFromUrl("https://other.com/jobs/9"),
      title: "Développeur web",
      company: { name: "Other Corp", normalizedName: "other corp" },
      location: { label: "Paris", city: "Paris" },
    });
    expect(isDuplicate(a, b)).toBe(false);
  });
});

describe("mergeOffers", () => {
  it("keeps the longer description, the oldest firstSeenAt, and unions sourceRefs", () => {
    const existing = makeOffer({
      descriptionText: "short",
      firstSeenAt: "2026-08-10T00:00:00.000Z",
      lastSeenAt: "2026-08-10T00:00:00.000Z",
    });
    const incoming = makeOffer({
      id: "01J0000000000000000000B0",
      descriptionText: "a much longer and more complete description",
      firstSeenAt: "2026-08-12T00:00:00.000Z",
      lastSeenAt: "2026-08-12T00:00:00.000Z",
      sourceRefs: [{ source: "labonnealternance", sourceOfferId: "def", canonicalUrl: "https://example.com/jobs/1" }],
    });

    const merged = mergeOffers(existing, incoming);

    expect(merged.descriptionText).toBe("a much longer and more complete description");
    expect(merged.firstSeenAt).toBe("2026-08-10T00:00:00.000Z");
    expect(merged.lastSeenAt).toBe("2026-08-12T00:00:00.000Z");
    expect(merged.sourceRefs).toHaveLength(2);
  });
});
