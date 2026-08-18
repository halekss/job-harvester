import { describe, it, expect } from "vitest";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { normalizeTalentsoftOffer } from "./normalize.js";

function offerPayload(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    domain: "recrutement.mgen.fr",
    item: {
      link: "https://recrutement.mgen.fr/Pages/Offre/detailoffre.aspx?idOffre=5391&idOrigine=502&LCID=1036&offerReference=2026-5391",
      title: "2026-5391 - Gestionnaire Prestations Services H/F",
      description: "<b>Type de contrat : </b>Alternance<br />Vos missions : gérer les dossiers.",
      categories: [
        "Prestations et services/Gestionnaire Presta. Services",
        "Alternance",
        "6 B avenue Joseph Rollo, 78320 LA VERRIERE",
      ],
      ...overrides,
    },
  };
}

describe("normalizeTalentsoftOffer", () => {
  it("maps fields, strips the reference prefix from the title, and extracts location from the address category", () => {
    const offer = normalizeTalentsoftOffer({ source: "talentsoft", payload: offerPayload() });

    expect(offer.source).toBe("talentsoft");
    expect(offer.sourceOfferId).toBe("5391");
    expect(offer.title).toBe("Gestionnaire Prestations Services H/F");
    expect(offer.location.city).toBe("LA VERRIERE");
    expect(offer.location.postalCode).toBe("78320");
    expect(offer.location.department).toBe("78");
    expect(offer.contractType).toBe("apprentissage");
    expect(offer.company.name).toBe("Mgen");
    expect(offer.applyUrl).toContain("idOffre=5391");
    expect(offer.descriptionText).toContain("Vos missions");
    expect(offer.descriptionHtml).toContain("<b>");
  });

  it("handles a 3-comma address (trailing country name) correctly", () => {
    const offer = normalizeTalentsoftOffer({
      source: "talentsoft",
      payload: offerPayload({
        categories: [
          "Filière administrative/Cadre administratif niveau 1",
          "Contrat à durée indéterminée",
          "59 bis boulevard Jean Jaurès, 74500 EVIAN-LES-BAINS, france",
        ],
      }),
    });

    expect(offer.location.city).toBe("EVIAN-LES-BAINS");
    expect(offer.location.postalCode).toBe("74500");
    expect(offer.contractType).toBe("autre");
  });

  it("falls back to an empty location when no category matches the address pattern", () => {
    const offer = normalizeTalentsoftOffer({
      source: "talentsoft",
      payload: offerPayload({ categories: ["Filière administrative"] }),
    });

    expect(offer.location.city).toBe("");
    expect(offer.location.postalCode).toBeUndefined();
    expect(offer.location.department).toBeUndefined();
  });

  it("throws on a payload that fails schema validation", () => {
    expect(() => normalizeTalentsoftOffer({ source: "talentsoft", payload: { nope: true } })).toThrow();
  });

  it("derives a deterministic id from source and sourceOfferId", () => {
    const offer1 = normalizeTalentsoftOffer({ source: "talentsoft", payload: offerPayload() });
    const offer2 = normalizeTalentsoftOffer({ source: "talentsoft", payload: offerPayload() });

    expect(offer1.id).toBe(offer2.id);
    expect(offer1.id).toBe(exactDedupKeyFromSource("talentsoft", "5391"));
  });
});
