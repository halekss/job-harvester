import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchSitemapCrawlerOffers, checkSitemapCrawlerHealth } from "./client.js";

const jobPostingHtml = `
  <html><body>
    <script type="application/ld+json">
      { "@type": "JobPosting", "title": "Alternance Data Analyst", "description": "<p>desc</p>" }
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
    targets: { sitemapCrawler: targets },
  };
}

describe("fetchSitemapCrawlerOffers", () => {
  it("only fetches URLs matching a job-relevant path pattern, ignoring the rest", async () => {
    const domain = "https://filter.example";
    const sitemapXml = `<?xml version="1.0"?><urlset>
      <url><loc>${domain}/about</loc></url>
      <url><loc>${domain}/jobs/123</loc></url>
      <url><loc>${domain}/legal</loc></url>
    </urlset>`;

    const query = baseQuery([domain]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === `${domain}/sitemap.xml`) return new Response(sitemapXml, { status: 200 });
      return new Response(jobPostingHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ pageUrl: `${domain}/jobs/123`, jobPosting: { title: "Alternance Data Analyst" } });

    const fetchedUrls = fetchImpl.mock.calls.map(([input]) => String(input));
    expect(fetchedUrls).not.toContain(`${domain}/about`);
    expect(fetchedUrls).not.toContain(`${domain}/legal`);
  });

  it("resolves a bare domain target to {target}/sitemap.xml", async () => {
    const domain = "https://resolve.example";
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>${domain}/careers/data-analyst</loc></url></urlset>`;

    const query = baseQuery([domain]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === `${domain}/sitemap.xml`) return new Response(sitemapXml, { status: 200 });
      return new Response(jobPostingHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(fetchImpl.mock.calls.map(([input]) => String(input))).toContain(`${domain}/sitemap.xml`);
    expect(results).toHaveLength(1);
  });

  it("skips the whole target when robots.txt disallows the sitemap itself", async () => {
    const domain = "https://blocked-sitemap.example";
    const robotsTxt = ["User-agent: *", "Disallow: /sitemap.xml"].join("\n");

    const query = baseQuery([`${domain}/sitemap.xml`]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(robotsTxt, { status: 200 });
      return new Response("should not be fetched", { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).not.toContain(`${domain}/sitemap.xml`);
  });

  it("skips a candidate page disallowed by robots.txt without fetching it", async () => {
    const domain = "https://blocked-page.example";
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>${domain}/jobs/1</loc></url></urlset>`;
    const robotsTxt = ["User-agent: *", "Disallow: /jobs"].join("\n");

    const query = baseQuery([`${domain}/sitemap.xml`]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(robotsTxt, { status: 200 });
      if (url === `${domain}/sitemap.xml`) return new Response(sitemapXml, { status: 200 });
      return new Response("should not be fetched", { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
    expect(fetchImpl.mock.calls.map(([input]) => String(input))).not.toContain(`${domain}/jobs/1`);
  });

  it("skips a candidate page whose fetch fails, without throwing", async () => {
    const domain = "https://failing-page.example";
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>${domain}/jobs/1</loc></url></urlset>`;

    const query = baseQuery([`${domain}/sitemap.xml`]);
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === `${domain}/sitemap.xml`) return new Response(sitemapXml, { status: 200 });
      return new Response("nope", { status: 500 });
    });

    const results: unknown[] = [];
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
  });
});

describe("checkSitemapCrawlerHealth", () => {
  it("reports ok:true (no single fixed domain to probe)", async () => {
    const health = await checkSitemapCrawlerHealth({});
    expect(health).toMatchObject({ connectorId: "sitemap-crawler", ok: true });
  });
});
