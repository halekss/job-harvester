import { describe, it, expect, vi } from "vitest";
import { probeWorkday } from "./probe-workday.js";

describe("probeWorkday", () => {
  it("returns {tenant, site, dc} for the first dc that responds ok", async () => {
    const requestedUrls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      requestedUrls.push(url);
      if (url.startsWith("https://acme.wd3.myworkdayjobs.com/")) {
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await probeWorkday("acme", fetchImpl);

    expect(result).toEqual({ tenant: "acme", site: "acme_jobs", dc: "wd3" });
    // wd1 tenté et échoué avant wd3 (ordre respecté)
    expect(requestedUrls[0]).toContain(".wd1.");
  });

  it("returns undefined when none of wd1/wd3/wd5 respond ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));

    const result = await probeWorkday("not-a-real-tenant", fetchImpl);

    expect(result).toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("strips hyphens from the slug to build the tenant (Workday tenants are compact alphanumeric)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.startsWith("https://creditagricole.wd1.myworkdayjobs.com/")) {
        return new Response(JSON.stringify({ total: 0, jobPostings: [] }), { status: 200 });
      }
      return new Response("not found", { status: 404 });
    });

    const result = await probeWorkday("credit-agricole", fetchImpl);

    expect(result).toEqual({ tenant: "creditagricole", site: "creditagricole_jobs", dc: "wd1" });
  });
});
