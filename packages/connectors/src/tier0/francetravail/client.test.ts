import { describe, it, expect, vi, beforeEach } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchFranceTravailOffers, checkFranceTravailHealth, __resetTokenCacheForTests } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

const tokenResponseBody = JSON.stringify({ access_token: "fake-token", token_type: "Bearer", expires_in: 1499 });

beforeEach(() => {
  __resetTokenCacheForTests();
});

describe("fetchFranceTravailOffers", () => {
  it("fetches a token then yields each item from resultats, sending the Bearer token on search", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [{ id: "1" }, { id: "2" }] }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([{ id: "1" }, { id: "2" }]);
    const searchCall = fetchImpl.mock.calls.find(([input]) => !String(input).includes("access_token"))!;
    const [, init] = searchCall;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
  });

  it("reuses a cached token across two calls instead of requesting a new one", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }
    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }

    const tokenCalls = fetchImpl.mock.calls.filter(([input]) => String(input).includes("access_token"));
    expect(tokenCalls).toHaveLength(1);
  });

  it("throws when the search response is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response("nope", { status: 500 });
    });

    const iterate = async () => {
      for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });

  it("yields zero items and does not throw when the search response is 204 No Content", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(null, { status: 204 });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });

  it("throws a validation error when the token response is missing access_token", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(JSON.stringify({ token_type: "Bearer", expires_in: 1499 }), { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    const iterate = async () => {
      for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow();
  });
});

describe("checkFranceTravailHealth", () => {
  it("reports ok:true when a token can be obtained", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(tokenResponseBody, { status: 200 }));
    const health = await checkFranceTravailHealth({ clientId: "cid", clientSecret: "csecret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "francetravail", ok: true });
  });

  it("reports ok:false with a message when the token request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 401 }));
    const health = await checkFranceTravailHealth({ clientId: "cid", clientSecret: "csecret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "francetravail", ok: false });
    expect(health.message).toContain("401");
  });
});
