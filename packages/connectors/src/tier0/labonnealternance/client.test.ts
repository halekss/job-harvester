import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchLbaOffers, checkLbaHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: ["M1403"],
  location: { label: "Lille", lat: 50.630951, lng: 3.045391, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

describe("fetchLbaOffers", () => {
  it("yields each job from the search response and sends the Authorization header", async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ jobs: [{ id: 1 }, { id: 2 }], recruiters: [], warnings: [] }), { status: 200 }),
    );

    const results: unknown[] = [];
    for await (const job of fetchLbaOffers(query, { apiKey: "secret", fetchImpl })) {
      results.push(job);
    }

    expect(results).toEqual([{ id: 1 }, { id: 2 }]);
    const [, init] = fetchImpl.mock.calls[0]!;
    expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer secret");
  });

  it("throws when the HTTP response is not ok", async () => {
    const fetchImpl = vi.fn(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _job of fetchLbaOffers(query, { apiKey: "secret", fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkLbaHealth", () => {
  it("reports ok:true on a 200 response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ jobs: [], recruiters: [], warnings: [] }), { status: 200 }));
    const health = await checkLbaHealth({ apiKey: "secret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "labonnealternance", ok: true });
  });

  it("reports ok:false and a message when the request throws", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("network down");
    });
    const health = await checkLbaHealth({ apiKey: "secret", fetchImpl });
    expect(health).toMatchObject({ connectorId: "labonnealternance", ok: false, message: "network down" });
  });
});
