import { describe, it, expect } from "vitest";
import type { CampaignConfig, LocationConfig } from "./config/campaign-schema.js";
import { buildHarvestQuery } from "./build-harvest-query.js";

describe("buildHarvestQuery", () => {
  it("carries every campaign field, including targets, into the HarvestQuery (JOB-24)", () => {
    const campaign: CampaignConfig = {
      id: "campaign-1",
      romeCodes: ["M1403", "M1805"],
      keywords: ["data"],
      locations: [{ label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage", "professionnalisation"],
      targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }], smartrecruiters: ["MAZARS"] },
    };
    const location: LocationConfig = campaign.locations[0]!;

    expect(buildHarvestQuery(campaign, location)).toEqual({
      campaignId: "campaign-1",
      keywords: ["data"],
      romeCodes: ["M1403", "M1805"],
      location,
      contractTypes: ["apprentissage", "professionnalisation"],
      targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }], smartrecruiters: ["MAZARS"] },
    });
  });

  // JOB-audit-2026-08-21 : filtres ad-hoc du bouton "Lancer la collecte" (métier/contrat/ville) -
  // ils remplacent les champs correspondants de la campagne pour CETTE collecte uniquement,
  // sans jamais toucher au fichier campaigns.yaml.
  it("overrides keywords and contractTypes when provided, leaving the rest of the campaign untouched", () => {
    const campaign: CampaignConfig = {
      id: "campaign-1",
      romeCodes: ["M1403", "M1805"],
      keywords: ["data"],
      locations: [{ label: "Lille 59000", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage", "professionnalisation"],
      targets: { smartrecruiters: ["MAZARS"] },
    };
    const location: LocationConfig = campaign.locations[0]!;

    const query = buildHarvestQuery(campaign, location, { keywords: ["marketing"], contractTypes: ["autre"] });

    expect(query.keywords).toEqual(["marketing"]);
    expect(query.contractTypes).toEqual(["autre"]);
    expect(query.romeCodes).toEqual(["M1403", "M1805"]);
    expect(query.targets).toEqual({ smartrecruiters: ["MAZARS"] });
  });

  it("falls back to the campaign's own keywords/contractTypes when no override is given", () => {
    const campaign: CampaignConfig = {
      id: "campaign-1",
      romeCodes: ["M1403"],
      keywords: ["data"],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };

    const query = buildHarvestQuery(campaign, campaign.locations[0]!, {});

    expect(query.keywords).toEqual(["data"]);
    expect(query.contractTypes).toEqual(["apprentissage"]);
  });

  it("leaves targets undefined when the campaign has none", () => {
    const campaign: CampaignConfig = {
      id: "campaign-2",
      romeCodes: ["M1403"],
      keywords: [],
      locations: [{ label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 }],
      contractTypes: ["apprentissage"],
    };

    expect(buildHarvestQuery(campaign, campaign.locations[0]!).targets).toBeUndefined();
  });
});
