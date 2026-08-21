import { describe, it, expect, vi } from "vitest";
import { probeSmartRecruiters } from "./probe-smartrecruiters.js";

describe("probeSmartRecruiters", () => {
  it("returns the uppercased company slug when the postings endpoint responds ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      expect(String(input)).toContain("/companies/MAZARS/postings");
      return new Response(JSON.stringify({ content: [] }), { status: 200 });
    });

    const result = await probeSmartRecruiters("mazars", fetchImpl);

    expect(result).toBe("MAZARS");
  });

  it("returns undefined when the company is unknown (HTTP 404)", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("not found", { status: 404 }));

    const result = await probeSmartRecruiters("not-a-real-company", fetchImpl);

    expect(result).toBeUndefined();
  });
});
