import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { labonnealternanceConnector } from "./connector.js";
import offerDirect from "../../../../../fixtures/labonnealternance/offer-direct.json" with { type: "json" };

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

describe("labonnealternanceConnector", () => {
  it("declares tier 0 and supports apprentissage/professionnalisation queries", () => {
    expect(labonnealternanceConnector.tier).toBe(0);
    expect(labonnealternanceConnector.supports(query)).toBe(true);
    expect(labonnealternanceConnector.supports({ ...query, contractTypes: ["stage"] })).toBe(false);
  });

  it("fetches raw offers wrapping each job with the connector id", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [offerDirect], recruiters: [], warnings: [] }), { status: 200 }),
    );

    const raws = [];
    for await (const raw of labonnealternanceConnector.fetch(query, { fetchImpl, env: { LBA_API_KEY: "secret" } })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "labonnealternance" });
    expect(labonnealternanceConnector.normalize(raws[0]!).title).toBe("Data Analyst en alternance");
  });
});
