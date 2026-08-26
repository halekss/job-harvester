import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { francetravailConnector } from "./connector.js";
import { __resetTokenCacheForTests } from "./client.js";
import offerDirect from "../../../../../fixtures/francetravail/offer-direct.json" with { type: "json" };

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

beforeEach(() => {
  __resetTokenCacheForTests();
});

describe("francetravailConnector", () => {
  it("declares tier 0 and supports any contract type (filtering happens downstream)", () => {
    expect(francetravailConnector.tier).toBe(0);
    expect(francetravailConnector.supports(query)).toBe(true);
    expect(francetravailConnector.supports({ ...query, contractTypes: ["stage"] })).toBe(true);
    expect(francetravailConnector.supports({ ...query, contractTypes: ["cdi"] })).toBe(true);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ access_token: "fake-token", expires_in: 1499 }), { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [offerDirect] }), { status: 200, headers: { "content-range": "offres 0-0/1" } });
    });

    const raws = [];
    for await (const raw of francetravailConnector.fetch(query, {
      fetchImpl,
      env: { FRANCE_TRAVAIL_CLIENT_ID: "cid", FRANCE_TRAVAIL_CLIENT_SECRET: "csecret" },
    })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "francetravail" });
    expect(francetravailConnector.normalize(raws[0]!).title).toBe("Data Analyst en alternance");
  });

  it("throws if FRANCE_TRAVAIL_CLIENT_ID or FRANCE_TRAVAIL_CLIENT_SECRET is missing", async () => {
    const iterate = async () => {
      for await (const _raw of francetravailConnector.fetch(query, { fetchImpl: vi.fn(), env: {} })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/FRANCE_TRAVAIL_CLIENT_ID/);
  });
});
