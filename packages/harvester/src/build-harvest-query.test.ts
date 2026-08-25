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
