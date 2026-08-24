import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchWorkdayOffers, checkWorkdayHealth } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }] },
};

const searchResponseBody = JSON.stringify({
  total: 1,
  jobPostings: [{ title: "Alternant Data Analyst", externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111" }],
});

const detailResponseBody = JSON.stringify({
  jobPostingInfo: {
    title: "Alternant Data Analyst",
    jobDescription: "<p>Une alternance data.</p>",
    location: "Lille",
    jobReqId: "REQ2026000111",
    externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/Alternant-Data-Analyst_REQ2026000111",
  },
});

describe("fetchWorkdayOffers", () => {
  it("fetches the list for each target, fetches detail per item, and yields a composite raw offer", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(searchResponseBody, { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      target: { tenant: "valeo", site: "valeo_jobs", dc: "wd3" },
      externalPath: "/job/Lille/Alternant-Data-Analyst_REQ2026000111",
      jobPostingInfo: { title: "Alternant Data Analyst" },
    });

    const searchCall = fetchImpl.mock.calls.find(([input]) => String(input).endsWith("/jobs"))!;
    expect(String(searchCall[0])).toBe("https://valeo.wd3.myworkdayjobs.com/wday/cxs/valeo/valeo_jobs/jobs");
  });

  it("pages through the job list until total is reached (JOB-32)", async () => {
    const requestedOffsets: number[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        const body = JSON.parse(init!.body as string) as { offset: number };
        requestedOffsets.push(body.offset);
        // 25 total postings, page size 20: page 1 = 20 items, page 2 = 5 items.
        const count = body.offset === 0 ? 20 : 5;
        const jobPostings = Array.from({ length: count }, (_, i) => ({
          title: `Alternant ${body.offset + i}`,
          externalPath: `/job/Lille/x_REQ${body.offset + i}`,
        }));
        return new Response(JSON.stringify({ total: 25, jobPostings }), { status: 200 });
      }
      return new Response(
        JSON.stringify({ jobPostingInfo: { title: "x", jobDescription: "d", jobReqId: url, externalUrl: `https://x/${url}` } }),
        { status: 200 },
      );
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(requestedOffsets).toEqual([0, 20]);
    expect(results).toHaveLength(25);
  });

  it("filters detail results by campaign keywords when provided (title or description match)", async () => {
    const queryWithKeywords: HarvestQuery = { ...query, keywords: ["data"] };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(
          JSON.stringify({
            total: 2,
            jobPostings: [
              { title: "Alternant Data Analyst", externalPath: "/job/data" },
              { title: "Alternant Logistique", externalPath: "/job/logistique" },
            ],
          }),
          { status: 200 },
        );
      }
      const detail = url.endsWith("/job/data")
        ? { title: "Alternant Data Analyst", jobDescription: "<p>Analyse de donnees.</p>", jobReqId: "R1" }
        : { title: "Alternant Logistique", jobDescription: "<p>Gestion des stocks.</p>", jobReqId: "R2" };
      return new Response(JSON.stringify({ jobPostingInfo: detail }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(queryWithKeywords, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ jobPostingInfo: { title: "Alternant Data Analyst" } });
  });

  it("does not match a short keyword as a substring inside an unrelated word (JOB-audit-2026-08-19)", async () => {
    const queryWithKeywords: HarvestQuery = { ...query, keywords: ["BI"] };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(
          JSON.stringify({ total: 1, jobPostings: [{ title: "Alternance Logistique", externalPath: "/job/log" }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({
          jobPostingInfo: {
            title: "Alternance Logistique",
            jobDescription: "<p>Join us to reinvent the mobility of tomorrow.</p>",
            jobReqId: "R3",
          },
        }),
        { status: 200 },
      );
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(queryWithKeywords, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(0);
  });

  it("keeps every result when the campaign has no keywords (back-compat)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(
          JSON.stringify({
            total: 2,
            jobPostings: [
              { title: "Alternant Data Analyst", externalPath: "/job/data" },
              { title: "Alternant Logistique", externalPath: "/job/logistique" },
            ],
          }),
          { status: 200 },
        );
      }
      const detail = url.endsWith("/job/data")
        ? { title: "Alternant Data Analyst", jobDescription: "<p>Analyse.</p>", jobReqId: "R1" }
        : { title: "Alternant Logistique", jobDescription: "<p>Stocks.</p>", jobReqId: "R2" };
      return new Response(JSON.stringify({ jobPostingInfo: detail }), { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchWorkdayOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(2);
  });

  it("throws when the search request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const iterate = async () => {
      for await (const _item of fetchWorkdayOffers(query, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 500/);
  });

  it("searches for 'stage' instead of 'alternance' when contractTypes is ['stage'] (JOB-74)", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const stageQuery: HarvestQuery = { ...query, contractTypes: ["stage"] };
    for await (const _item of fetchWorkdayOffers(stageQuery, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "stage" });
  });

  it("searches with an empty searchText (no keyword constraint) when contractTypes is ['autre'] — no single reliable term exists", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    const cdiQuery: HarvestQuery = { ...query, contractTypes: ["autre"] };
    for await (const _item of fetchWorkdayOffers(cdiQuery, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "" });
  });

  it("still searches for 'alternance' when contractTypes is apprentissage/professionnalisation (back-compat)", async () => {
    let searchBody: unknown;
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        searchBody = JSON.parse(init!.body as string);
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response(detailResponseBody, { status: 200 });
    });

    // `query` (fixture du fichier) a déjà contractTypes: ["apprentissage"].
    for await (const _item of fetchWorkdayOffers(query, { fetchImpl })) {
      // drain
    }

    expect(searchBody).toMatchObject({ searchText: "alternance" });
  });
});

describe("checkWorkdayHealth", () => {
  it("reports ok:true when the search request against the health-check tenant succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 }));
    const health = await checkWorkdayHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "workday", ok: true });
  });

  it("reports ok:false with a message when the request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkWorkdayHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "workday", ok: false });
  });
});
