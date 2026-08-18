import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { jsonldGenericConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { jsonldGeneric: ["https://careers.acme.example/jobs/data-analyst"] },
};

describe("jsonldGenericConnector", () => {
  it("declares tier 2, locationScoped false, and supports only when jsonldGeneric targets are configured", () => {
    expect(jsonldGenericConnector.tier).toBe(2);
    expect(jsonldGenericConnector.locationScoped).toBe(false);
    expect(jsonldGenericConnector.supports(query)).toBe(true);
    expect(jsonldGenericConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id and normalizes them", async () => {
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
      return new Response(html, { status: 200 });
    });

    const raws = [];
    for await (const raw of jsonldGenericConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "jsonld-generic" });
    expect(jsonldGenericConnector.normalize(raws[0]!).title).toBe("Alternance Data Analyst");
  });
});
