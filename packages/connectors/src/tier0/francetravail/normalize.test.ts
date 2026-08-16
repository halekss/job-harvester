import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { normalizeFranceTravailOffer } from "./normalize.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/francetravail");

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), "utf-8"));
}

describe("normalizeFranceTravailOffer", () => {
  it("normalizes a direct France Travail offer (origine 1, no partner) with no originSource", () => {
    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: loadFixture("offer-direct.json") });

    expect(offer.source).toBe("francetravail");
    expect(offer.sourceOfferId).toBe("170ABCD");
    expect(offer.originSource).toBeUndefined();
    expect(offer.title).toBe("Data Analyst en alternance");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.company.normalizedName).toBe("acme data");
    expect(offer.location.city).toBe("Lille");
    expect(offer.location.department).toBe("59");
    expect(offer.location.postalCode).toBe("59000");
    expect(offer.romeCodes).toEqual(["M1403"]);
    expect(offer.applyUrl).toBe("https://candidat.francetravail.fr/offres/recherche/detail/170ABCD");
  });

  it("sets originSource to the partner name and applyUrl to the partner link for a relayed offer (origine 2)", () => {
    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: loadFixture("offer-partner.json") });

    expect(offer.originSource).toBe("JOBTEASER");
    expect(offer.contractType).toBe("professionnalisation");
    expect(offer.applyUrl).toBe("https://www.jobteaser.com/fr/job-offers/170wxyz-developpeur-web-alternance");
    expect(offer.location.city).toBe("Amiens");
    expect(offer.location.department).toBe("80");
  });

  it("recognizes 2A/2B as Corsica department codes in lieuTravail.libelle (JOB-27)", () => {
    const directFixture = loadFixture("offer-direct.json") as Record<string, unknown>;
    const corsicaPayload = {
      ...directFixture,
      lieuTravail: { libelle: "2A - Ajaccio", codePostal: "20000" },
    };

    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: corsicaPayload });

    expect(offer.location.department).toBe("2A");
    expect(offer.location.city).toBe("Ajaccio");
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeFranceTravailOffer({ source: "francetravail", payload: { nope: true } })).toThrow();
  });

  it("never leaks a contact field into rawPayload even if the raw API payload contains one", () => {
    const directFixture = loadFixture("offer-direct.json") as Record<string, unknown>;
    const payloadWithContact = {
      ...directFixture,
      contact: { nom: "Jean Recruteur", telephone: "0600000000", courriel: "jean@example.com" },
    };

    const offer = normalizeFranceTravailOffer({ source: "francetravail", payload: payloadWithContact });

    expect(offer.rawPayload).not.toHaveProperty("contact");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("Jean Recruteur");
    expect(JSON.stringify(offer.rawPayload)).not.toContain("telephone");
  });
});
