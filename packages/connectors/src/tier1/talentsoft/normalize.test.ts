import { describe, it, expect } from "vitest";
import { exactDedupKeyFromSource } from "@job-harvester/core";
import { normalizeTalentsoftOffer } from "./normalize.js";

function offerPayload(overrides: Partial<Record<string, unknown>> = {}, domain = "recrutement.mgen.fr") {
  return {
    domain,
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

  // JOB-audit-2026-08-21 : la plupart des clients Talentsoft ne sont pas sur
  // `recrutement.{entreprise}.fr` (cas MGEN) mais directement sur `{entreprise}-recrute.talent-
  // soft.com` / `{entreprise}-career.talent-soft.com` - vérifié en direct sur 7 instances réelles
  // (AGIRC-ARRCO, CNP, ADEME...). Sans ce cas, le nom d'entreprise dérivé incluait le suffixe de
  // plateforme lui-même ("Cnp Recrute", "Ademe Career") au lieu du seul nom de l'entreprise.
  it("strips the platform suffix (-recrute/-career/-cand) from a {company}-suffix.talent-soft.com domain", () => {
    const offer = normalizeTalentsoftOffer({
      source: "talentsoft",
      payload: offerPayload({}, "cnp-recrute.talent-soft.com"),
    });
    expect(offer.company.name).toBe("Cnp");
  });

  it("strips the platform suffix from a multi-word company slug", () => {
    const offer = normalizeTalentsoftOffer({
      source: "talentsoft",
      payload: offerPayload({}, "agirc-arrco-career.talent-soft.com"),
    });
    expect(offer.company.name).toBe("Agirc Arrco");
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

  // JOB-audit-2026-08-21 : vérifié en direct sur Groupe ADP - certains clients Talentsoft
  // formatent l'adresse sans virgule avant le code postal ("21 quai d'Austerlitz 75013 Paris"),
  // contrairement au format MGEN ("6 B avenue ..., 78320 LA VERRIERE"). findAddressCategory
  // exigeait la virgule et ratait donc ce format, laissant la ville vide.
  it("extracts location from an address category with no comma before the postal code", () => {
    const offer = normalizeTalentsoftOffer({
      source: "talentsoft",
      payload: offerPayload({
        categories: ["Contrat à durée déterminée", "21 quai d'Austerlitz 75013 Paris"],
      }),
    });

    expect(offer.location.city).toBe("Paris");
    expect(offer.location.postalCode).toBe("75013");
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
