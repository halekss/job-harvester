import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeLbaOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/labonnealternance");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeLbaOffer", () => {
  it("normalizes a direct LBA offer with no aggregator origin", () => {
    const offer = normalizeLbaOffer({ source: "labonnealternance", payload: loadFixture("offer-direct.json") });

    expect(offer.source).toBe("labonnealternance");
    expect(offer.sourceOfferId).toBe("6a5a004c8bfdaae34d6a2ea4");
    expect(offer.originSource).toBeUndefined();
    expect(offer.title).toBe("Data Analyst en alternance");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.company.normalizedName).toBe("acme data");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.romeCodes).toEqual(["M1403"]);
    expect(offer.remotePolicy).toBe("hybrid");
  });

  it("sets originSource to the partner name for a rebounded France Travail offer", () => {
    const offer = normalizeLbaOffer({ source: "labonnealternance", payload: loadFixture("offer-france-travail.json") });

    expect(offer.originSource).toBe("France Travail");
    expect(offer.contractType).toBe("professionnalisation");
    expect(offer.location.city).toBe("Amiens");
    expect(offer.remotePolicy).toBe("unknown");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeLbaOffer({ source: "labonnealternance", payload: { nope: true } })).toThrow();
  });

  it("strips recruiter PII (e.g. apply.phone) from rawPayload since only Zod-validated fields are stored", () => {
    const rawFixture = loadFixture("offer-direct.json") as Record<string, unknown>;
    const applyWithPhone = {
      ...(rawFixture.apply as Record<string, unknown>),
      phone: "+33612345678",
    };
    const payloadWithPii = { ...rawFixture, apply: applyWithPhone };

    const offer = normalizeLbaOffer({ source: "labonnealternance", payload: payloadWithPii });

    expect(offer.rawPayload).not.toHaveProperty("apply.phone");
    expect((offer.rawPayload as { apply: Record<string, unknown> }).apply).not.toHaveProperty("phone");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("phone");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("+33612345678");
  });
});
