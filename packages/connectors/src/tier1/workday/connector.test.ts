import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { workdayConnector } from "./connector.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { workday: [{ tenant: "valeo", site: "valeo_jobs", dc: "wd3" }] },
};

describe("workdayConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when workday targets are configured", () => {
    expect(workdayConnector.tier).toBe(1);
    expect(workdayConnector.locationScoped).toBe(false);
    expect(workdayConnector.supports(query)).toBe(true);
    expect(workdayConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/jobs")) {
        return new Response(
          JSON.stringify({ total: 1, jobPostings: [{ title: "Alternant Data Analyst", externalPath: "/job/Lille/x_REQ1" }] }),
          { status: 200 },
        );
      }
      return new Response(
        JSON.stringify({ jobPostingInfo: { title: "Alternant Data Analyst", jobDescription: "desc", jobReqId: "REQ1", externalUrl: "https://valeo.wd3.myworkdayjobs.com/valeo_jobs/job/Lille/x_REQ1" } }),
        { status: 200 },
      );
    });

    const raws = [];
    for await (const raw of workdayConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(1);
    expect(raws[0]).toMatchObject({ source: "workday" });
    expect(workdayConnector.normalize(raws[0]!).title).toBe("Alternant Data Analyst");
  });
});
