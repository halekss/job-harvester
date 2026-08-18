import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchJsonLdGenericOffers, checkJsonLdGenericHealth } from "./client.js";

const jobPostingHtml = `
  <html><body>
    <script type="application/ld+json">
      { "@type": "JobPosting", "title": "Alternance Développeur Data", "description": "<p>desc</p>" }
    </script>
  </body></html>
`;

function baseQuery(targets: string[]): HarvestQuery {
  return {
    campaignId: "test",
    keywords: [],
    romeCodes: [],
    location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
    contractTypes: ["apprentissage"],
    targets: { jsonldGeneric: targets },
  };
}

describe("fetchJsonLdGenericOffers", () => {
  it("fetches each target URL and yields the JobPostings extracted from its HTML", async () => {
    const query = baseQuery(["https://happy-path.example/jobs/data-analyst"]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      return new Response(jobPostingHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchJsonLdGenericOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      pageUrl: "https://happy-path.example/jobs/data-analyst",
      jobPosting: { title: "Alternance Développeur Data" },
    });
  });

  it("skips a target disallowed by robots.txt without throwing and without fetching the page", async () => {
    const query = baseQuery(["https://robots-disallowed.example/jobs/data-analyst"]);
    const robotsTxt = ["User-agent: *", "Disallow: /jobs"].join("\n");
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(robotsTxt, { status: 200 });
      return new Response(jobPostingHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchJsonLdGenericOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
    const pageCalls = fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith("/robots.txt"));
    expect(pageCalls).toHaveLength(0);
  });

  it("skips a target whose page fetch fails without throwing", async () => {
    const query = baseQuery(["https://fetch-fails.example/jobs/data-analyst"]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      return new Response("nope", { status: 500 });
    });

    const results: unknown[] = [];
    for await (const item of fetchJsonLdGenericOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
  });

  it("continues to the next target after one fails", async () => {
    const query = baseQuery(["https://a.example/jobs/1", "https://b.example/jobs/2"]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url.startsWith("https://a.example")) return new Response("nope", { status: 500 });
      return new Response(jobPostingHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchJsonLdGenericOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pageUrl: "https://b.example/jobs/2" });
  });
});

describe("checkJsonLdGenericHealth", () => {
  it("reports ok:true (no single fixed domain to probe)", async () => {
    const health = await checkJsonLdGenericHealth({});
    expect(health).toMatchObject({ connectorId: "jsonld-generic", ok: true });
  });
});
