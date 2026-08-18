import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { sitemapCrawlerConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { sitemapCrawler: ["https://connector-test.example"] },
};

describe("sitemapCrawlerConnector", () => {
  it("declares tier 2, locationScoped false, and supports only when sitemapCrawler targets are configured", () => {
    expect(sitemapCrawlerConnector.tier).toBe(2);
    expect(sitemapCrawlerConnector.locationScoped).toBe(false);
    expect(sitemapCrawlerConnector.supports(query)).toBe(true);
    expect(sitemapCrawlerConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id and normalizes them", async () => {
    const domain = "https://connector-test.example";
    const sitemapXml = `<?xml version="1.0"?><urlset><url><loc>${domain}/jobs/1</loc></url></urlset>`;
    const html = `
      <html><body>
        <script type="application/ld+json">
          { "@type": "JobPosting", "title": "Alternance Data Analyst", "description": "<p>desc</p>" }
        </script>
      </body></html>
    `;
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === `${domain}/sitemap.xml`) return new Response(sitemapXml, { status: 200 });
      return new Response(html, { status: 200 });
    });

    const raws = [];
    for await (const raw of sitemapCrawlerConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "sitemap-crawler" });
    expect(sitemapCrawlerConnector.normalize(raws[0]!).title).toBe("Alternance Data Analyst");
  });
});
