import { describe, it, expect, vi } from "vitest";
import { probeDigitalRecruiters } from "./probe-digitalrecruiters.js";

describe("probeDigitalRecruiters", () => {
  it("returns the joinus domain when the API confirms a real customer (count present)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("domainName=joinus.yzee-services.fr");
      return new Response(JSON.stringify({ count: 3, items: [] }), { status: 200 });
    });

    const result = await probeDigitalRecruiters("yzee-services", fetchImpl);

    expect(result).toBe("joinus.yzee-services.fr");
  });

  it("returns undefined when the API rejects the domain (HTTP 400)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("bad domain", { status: 400 }));

    const result = await probeDigitalRecruiters("not-a-real-company", fetchImpl);

    expect(result).toBeUndefined();
  });

  it("returns undefined when the API returns 200 but the count field is not numeric", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      return new Response(JSON.stringify({ items: [] }), { status: 200 });
    });

    const result = await probeDigitalRecruiters("test-company", fetchImpl);

    expect(result).toBeUndefined();
  });
});
