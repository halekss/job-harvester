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
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Alternance Data Analyst H/F" },
              { id: "2", name: "Auditeur confirmé H/F" },
            ],
            totalFound: 2,
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
    // JOB-34 : le slug d'entreprise doit être présent dans le payload composite yield,
    // pas seulement utilisé pour construire l'URL de la requête.
    expect(results[0]).toMatchObject({ company: "MAZARS", detail: { id: "1", name: "Alternance Data Analyst H/F" } });
  });

  it("filters out postings whose title/description don't match campaign keywords (JOB-audit-2026-08-20)", async () => {
    const keywordQuery: HarvestQuery = { ...query, keywords: ["data"] };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Alternance Data Analyst H/F" },
              { id: "2", name: "Alternance Auditeur H/F" },
            ],
            totalFound: 2,
          }),
          { status: 200 },
        );
      }
      if (url.includes("/postings/1")) {
        return new Response(
          JSON.stringify({
            id: "1",
            name: "Alternance Data Analyst H/F",
            jobAd: { sections: { jobDescription: { text: "Analyse de donnees." } } },
          }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          id: "2",
          name: "Alternance Auditeur H/F",
          jobAd: { sections: { jobDescription: { text: "Audit financier." } } },
        }),
        { status: 200 },
      );
    });

    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(keywordQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ detail: { id: "1" } });
  });

  it("pages through the postings list until totalFound is reached (JOB-32)", async () => {
    const requestedOffsets: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        const offset = Number(new URL(url).searchParams.get("offset"));
        requestedOffsets.push(offset);
        // 70 total postings, page size 50: page 1 = 50 items, page 2 = 20 items.
        const count = offset === 0 ? 50 : 20;
        const content = Array.from({ length: count }, (_, i) => ({ id: `${offset + i}`, name: "Auditeur confirmé H/F" }));
        return new Response(JSON.stringify({ content, totalFound: 70 }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: "x", name: "Auditeur confirmé H/F" }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const _item of fetchSmartRecruitersOffers(query, { fetchImpl })) {
      results.push(_item);
    }

    expect(requestedOffsets).toEqual([0, 50]);
    // Aucune de ces offres n'est en alternance (filtrées avant le fetch de détail) — la
    // pagination de la liste, elle, doit avoir couvert les 2 pages malgré tout.
    expect(results).toHaveLength(0);
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

  it("keeps postings whose name mentions 'stage' when contractTypes is ['stage'], drops alternance-only ones (JOB-74)", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Stage Data Analyst H/F" },
              { id: "2", name: "Alternance Data Analyst H/F" },
            ],
            totalFound: 2,
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Stage Data Analyst H/F" }), { status: 200 });
    });

    const stageQuery: HarvestQuery = { ...query, contractTypes: ["stage"] };
    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(stageQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(detailUrls[0]).toContain("/postings/1");
  });

  it("keeps every posting (no client-side contract pre-filter) when contractTypes is ['autre'] — no single reliable term exists", async () => {
    const detailUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("/postings?limit=50")) {
        return new Response(
          JSON.stringify({
            content: [
              { id: "1", name: "Comptable H/F" },
              { id: "2", name: "Alternance Data Analyst H/F" },
            ],
            totalFound: 2,
          }),
          { status: 200 },
        );
      }
      detailUrls.push(url);
      return new Response(JSON.stringify({ id: "1", name: "Comptable H/F" }), { status: 200 });
    });

    const cdiQuery: HarvestQuery = { ...query, contractTypes: ["autre"] };
    const results: unknown[] = [];
    for await (const item of fetchSmartRecruitersOffers(cdiQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
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
