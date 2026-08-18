import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchWttjOffers, checkWttjHealth, getWttjCredentials } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: ["alternance", "data"],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

const credentials = { appId: "CSEKHVMS53", apiKey: "test-key" };

function algoliaResponse(hits: unknown[], page: number, nbPages: number) {
  return new Response(JSON.stringify({ hits, nbHits: hits.length, page, nbPages }), { status: 200 });
}

describe("getWttjCredentials", () => {
  it("returns undefined when either env var is missing", () => {
    expect(getWttjCredentials({})).toBeUndefined();
    expect(getWttjCredentials({ WTTJ_ALGOLIA_APP_ID: "x" })).toBeUndefined();
    expect(getWttjCredentials({ WTTJ_ALGOLIA_APP_ID: "x", WTTJ_ALGOLIA_API_KEY: "y" })).toEqual({ appId: "x", apiKey: "y" });
  });
});

describe("fetchWttjOffers", () => {
  it("queries the csekhvms53-dsn.algolia.net jobs index with the expected headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(url).toBe("https://csekhvms53-dsn.algolia.net/1/indexes/wk_cms_jobs_production/query");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-algolia-application-id"]).toBe("CSEKHVMS53");
      expect(headers["x-algolia-api-key"]).toBe("test-key");
      return algoliaResponse([{ objectID: "1" }], 0, 1);
    });

    const results: unknown[] = [];
    for await (const hit of fetchWttjOffers(query, credentials, { fetchImpl })) {
      results.push(hit);
    }

    expect(results).toEqual([{ objectID: "1" }]);
  });

  it("paginates until nbPages is covered", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => algoliaResponse([{ objectID: "x" }], 0, 2));

    const results: unknown[] = [];
    for await (const hit of fetchWttjOffers(query, credentials, { fetchImpl })) {
      results.push(hit);
    }

    expect(fetchImpl.mock.calls.length).toBe(2);
    expect(results).toHaveLength(2);
  });

  it("throws when the algolia request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 403 }));
    const iterate = async () => {
      for await (const _hit of fetchWttjOffers(query, credentials, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 403/);
  });
});

describe("checkWttjHealth", () => {
  it("reports ok:false without configured credentials", async () => {
    const health = await checkWttjHealth(undefined, {});
    expect(health).toMatchObject({ connectorId: "welcometothejungle", ok: false });
  });

  it("reports ok:true when the health-check request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => algoliaResponse([], 0, 0));
    const health = await checkWttjHealth(credentials, { fetchImpl });
    expect(health).toMatchObject({ connectorId: "welcometothejungle", ok: true });
  });
});
