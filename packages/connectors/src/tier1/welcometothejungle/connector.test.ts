import { describe, it, expect, vi, afterEach } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { welcometothejungleConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: ["alternance"],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

const ENV_KEYS = ["WTTJ_ALGOLIA_APP_ID", "WTTJ_ALGOLIA_API_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

describe("welcometothejungleConnector", () => {
  it("declares tier 1 and locationScoped true", () => {
    expect(welcometothejungleConnector.tier).toBe(1);
    expect(welcometothejungleConnector.locationScoped).toBe(true);
  });

  it("supports() is false without configured Algolia credentials", () => {
    for (const key of ENV_KEYS) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
    expect(welcometothejungleConnector.supports(query)).toBe(false);
  });

  it("supports() is true with configured Algolia credentials", () => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.WTTJ_ALGOLIA_APP_ID = "CSEKHVMS53";
    process.env.WTTJ_ALGOLIA_API_KEY = "test-key";
    expect(welcometothejungleConnector.supports(query)).toBe(true);
  });

  it("fetch() throws a clear error when credentials are missing from ctx.env", async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const iterate = async () => {
      for await (const _raw of welcometothejungleConnector.fetch(query, { fetchImpl, env: {} })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/WTTJ_ALGOLIA/);
  });

  it("fetches raw offers wrapping each hit with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      new Response(JSON.stringify({ hits: [{ objectID: "1", slug: "s", name: "Alternance X", organization: { name: "Acme", slug: "acme" } }], nbHits: 1, page: 0, nbPages: 1 }), { status: 200 }),
    );

    const raws = [];
    for await (const raw of welcometothejungleConnector.fetch(query, { fetchImpl, env: { WTTJ_ALGOLIA_APP_ID: "CSEKHVMS53", WTTJ_ALGOLIA_API_KEY: "test-key" } })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "welcometothejungle" });
    expect(welcometothejungleConnector.normalize(raws[0]!).title).toBe("Alternance X");
  });
});
