import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchSmartRecruitersOffers, checkSmartRecruitersHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { smartrecruiters: ["MAZARS"] },
};

describe("fetchSmartRecruitersOffers", () => {
  it("filters out non-alternance postings before fetching their detail", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Alternance Data Analyst H/F" },
              { id: "2", name: "Auditeur confirmé H/F" },
            ],
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Alternance Data Analyst H/F" }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(detailUrls).toHaveLength(1);
    expect(detailUrls[0]).toContain("/postings/1");
  });

  it("throws when the postings list request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _item of fetchSmartRecruitersOffers(query, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });
});

describe("checkSmartRecruitersHealth", () => {
  it("reports ok:true when the health-check request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ content: [] }), { status: 200 }));
    const health = await checkSmartRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "smartrecruiters", ok: true });
  });

  it("reports ok:false with a message when the request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkSmartRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "smartrecruiters", ok: false });
  });
});
