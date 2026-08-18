import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { digitalRecruitersConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { digitalRecruiters: ["joinus.decathlon.fr"] },
};

describe("digitalRecruitersConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when digitalRecruiters targets are configured", () => {
    expect(digitalRecruitersConnector.tier).toBe(1);
    expect(digitalRecruitersConnector.locationScoped).toBe(false);
    expect(digitalRecruitersConnector.supports(query)).toBe(true);
    expect(digitalRecruitersConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(
        JSON.stringify({
          count: 1,
          items: [{ job_ad_id: 1, title: "Alternance Vendeur", contract: "Contrat d'alternance", location: "Lille", job: "Vendeur", url: "1-alternance-vendeur-59000-lille" }],
        }),
        { status: 200 },
      ),
    );

    const raws = [];
    for await (const raw of digitalRecruitersConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "digitalrecruiters" });
    expect(digitalRecruitersConnector.normalize(raws[0]!).title).toBe("Alternance Vendeur");
  });
});
