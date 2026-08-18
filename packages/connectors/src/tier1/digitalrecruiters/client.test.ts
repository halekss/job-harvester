import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchDigitalRecruitersOffers, checkDigitalRecruitersHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { digitalRecruiters: ["joinus.decathlon.fr"] },
};

function jobAd(id: number) {
  return { job_ad_id: id, title: `Job ${id}`, contract: "CDI", location: "Bordeaux", job: "Vendeur", url: `${id}-job-33300-bordeaux` };
}

describe("fetchDigitalRecruitersOffers", () => {
  it("posts to the public job-ads endpoint and yields items wrapped with the target domain", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      expect(url).toContain("domainName=joinus.decathlon.fr");
      expect(url).toContain("/public/v1/careers-site/job-ads");
      return new Response(JSON.stringify({ count: 1, items: [jobAd(1)] }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchDigitalRecruitersOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ domain: "joinus.decathlon.fr", item: { job_ad_id: 1 } });
    expect(fetchImpl.mock.calls[0]?.[1]).toMatchObject({ method: "POST" });
  });

  it("pages through job-ads until a short page is returned", async () => {
    const requestedPages: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      const page = Number(new URL(url).searchParams.get("page"));
      requestedPages.push(page);
      const items = page === 1 ? Array.from({ length: 50 }, (_, i) => jobAd(i)) : [jobAd(50)];
      return new Response(JSON.stringify({ count: 51, items }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchDigitalRecruitersOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(requestedPages).toEqual([1, 2]);
    expect(results).toHaveLength(51);
  });

  it("stops that target after a failed request, without throwing", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));

    const results: unknown[] = [];
    for await (const item of fetchDigitalRecruitersOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
  });
});

describe("checkDigitalRecruitersHealth", () => {
  it("reports ok:true when the health-check request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ count: 0, items: [] }), { status: 200 }));
    const health = await checkDigitalRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "digitalrecruiters", ok: true });
  });

  it("reports ok:false when the health-check request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkDigitalRecruitersHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "digitalrecruiters", ok: false });
  });
});
