import { describe, it, expect } from "vitest";
import { NormalizedOfferSchema } from "./normalized-offer.js";

const validOffer = {
  id: "01J000000000000000000000",
  source: "labonnealternance",
  sourceOfferId: "abc-123",
  canonicalUrl: "https://example.com/jobs/1",
  title: "Data Analyst en alternance",
  company: { name: "Acme", normalizedName: "acme" },
  location: { label: "10 Rue de la Paix, 59000 Lille", city: "Lille" },
  contractType: "apprentissage",
  romeCodes: ["M1403"],
  descriptionText: "Description",
  firstSeenAt: "2026-08-15T00:00:00.000Z",
  lastSeenAt: "2026-08-15T00:00:00.000Z",
  lifecycle: "active",
  dedupKey: "url:deadbeef",
  sourceRefs: [{ source: "labonnealternance", sourceOfferId: "abc-123", canonicalUrl: "https://example.com/jobs/1" }],
  rawPayload: { any: "thing" },
};

describe("NormalizedOfferSchema", () => {
  it("accepts a minimal valid offer", () => {
    expect(NormalizedOfferSchema.parse(validOffer)).toMatchObject({ title: "Data Analyst en alternance" });
  });

  it("rejects an offer with an invalid contractType", () => {
    expect(() => NormalizedOfferSchema.parse({ ...validOffer, contractType: "cdi" })).toThrow();
  });

  it("rejects an offer missing romeCodes", () => {
    const { romeCodes: _drop, ...withoutRomeCodes } = validOffer;
    expect(() => NormalizedOfferSchema.parse(withoutRomeCodes)).toThrow();
  });
});
