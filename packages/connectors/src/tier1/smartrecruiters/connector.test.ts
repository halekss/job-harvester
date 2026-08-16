import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { smartrecruitersConnector } from "./connector.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/smartrecruiters");
const postingDetail = JSON.parse(readFileSync(path.join(fixturesDir, "posting-detail-alternance.json"), "utf-8"));

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { smartrecruiters: ["MAZARS"] },
};

describe("smartrecruitersConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when smartrecruiters targets are configured", () => {
    expect(smartrecruitersConnector.tier).toBe(1);
    expect(smartrecruitersConnector.locationScoped).toBe(false);
    expect(smartrecruitersConnector.supports(query)).toBe(true);
    expect(smartrecruitersConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({ content: [{ id: "743000000000001", name: "Alternance Data Analyst H/F" }], totalFound: 1 }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(postingDetail), { status: 200 });
    });

    const raws = [];
    for await (const raw of smartrecruitersConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "smartrecruiters" });
    expect(smartrecruitersConnector.normalize(raws[0]!).title).toBe("Alternance Data Analyst H/F");
  });
});
