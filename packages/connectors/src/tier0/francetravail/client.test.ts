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
  it("fetches a token then yields each alternance item from resultats, sending the Bearer token on search", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [{ id: "1", alternance: true }, { id: "2", alternance: true }] }), {
        status: 200,
        headers: { "content-range": "offres 0-1/2" },
      });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([{ id: "1", alternance: true }, { id: "2", alternance: true }]);
    const searchCall = fetchImpl.mock.calls.find(([input]) => !String(input).includes("access_token"))!;
    const [, init] = searchCall;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer fake-token");
  });

  it("filters out non-alternance offers (alternance: false or missing) before yielding (JOB-28)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          resultats: [
            { id: "cdi-1", alternance: false },
            { id: "no-flag" },
            { id: "alternance-1", alternance: true },
          ],
        }),
        { status: 200, headers: { "content-range": "offres 0-2/3" } },
      );
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([{ id: "alternance-1", alternance: true }]);
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

  it("requests a fresh token when the client secret changes, instead of serving the old cached one (JOB-25)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "old-secret", fetchImpl })) {
      // drain
    }
    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "new-secret-after-rotation", fetchImpl })) {
      // drain
    }

    const tokenCalls = fetchImpl.mock.calls.filter(([input]) => String(input).includes("access_token"));
    expect(tokenCalls).toHaveLength(2);
  });

  it("coalesces concurrent token requests into a single network call (JOB-25)", async () => {
    let tokenRequestCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        tokenRequestCount += 1;
        // Yield to the microtask queue so both concurrent callers reach getAccessToken
        // before this resolves, proving they share the same in-flight request.
        await new Promise((resolve) => setTimeout(resolve, 0));
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    await Promise.all([
      (async () => {
        for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
          // drain
        }
      })(),
      (async () => {
        for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
          // drain
        }
      })(),
    ]);

    expect(tokenRequestCount).toBe(1);
  });

  it("pages through Content-Range until the total is reached (JOB-30)", async () => {
    // 3 pages: 150 items, 150 items, 20 items — total 320, PAGE_SIZE=150.
    const pages = [
      { start: 0, end: 149, total: 320 },
      { start: 150, end: 299, total: 320 },
      { start: 300, end: 319, total: 320 },
    ];
    const requestedRanges: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      const range = new URL(url).searchParams.get("range")!;
      requestedRanges.push(range);
      const page = pages[requestedRanges.length - 1]!;
      const count = page.end - page.start + 1;
      const resultats = Array.from({ length: count }, (_, i) => ({ id: `offer-${page.start + i}`, alternance: true }));
      return new Response(JSON.stringify({ resultats }), {
        status: 200,
        headers: { "content-range": `offres ${page.start}-${page.end}/${page.total}` },
      });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(requestedRanges).toEqual(["0-149", "150-299", "300-449"]);
    expect(results).toHaveLength(320);
  });

  it("stops after MAX_PAGES even if Content-Range never signals completion, as a safety cap (JOB-30)", async () => {
    let pageCount = 0;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      pageCount += 1;
      // Always claims a huge total, and always returns a full page — an API bug this safety
      // cap must survive rather than looping forever.
      return new Response(JSON.stringify({ resultats: [{ id: `offer-${pageCount}`, alternance: true }] }), {
        status: 200,
        headers: { "content-range": "offres 0-0/999999" },
      });
    });

    const results: unknown[] = [];
    for await (const item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      results.push(item);
    }

    expect(pageCount).toBe(20);
    expect(results).toHaveLength(20);
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

  it("throws an explicit error instead of silently falling back to a national search when the location label has no postal code (JOB-64)", async () => {
    const noPostalCodeQuery: HarvestQuery = { ...query, location: { ...query.location, label: "Lille" } };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    const iterator = fetchFranceTravailOffers(noPostalCodeQuery, { clientId: "cid", clientSecret: "csecret", fetchImpl });
    await expect(iterator.next()).rejects.toThrow(/Lille/);
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

  it("makes a real network call even when a valid token is already cached (JOB-26)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("access_token")) {
        return new Response(tokenResponseBody, { status: 200 });
      }
      return new Response(JSON.stringify({ resultats: [] }), { status: 200 });
    });

    // Prime the cache with a valid token via a normal search call.
    for await (const _item of fetchFranceTravailOffers(query, { clientId: "cid", clientSecret: "csecret", fetchImpl })) {
      // drain
    }
    const tokenCallsAfterPriming = fetchImpl.mock.calls.filter(([input]) => String(input).includes("access_token")).length;
    expect(tokenCallsAfterPriming).toBe(1);

    await checkFranceTravailHealth({ clientId: "cid", clientSecret: "csecret", fetchImpl });

    const tokenCallsAfterHealthCheck = fetchImpl.mock.calls.filter(([input]) => String(input).includes("access_token")).length;
    expect(tokenCallsAfterHealthCheck).toBe(2);
  });
});
