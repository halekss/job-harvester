import { describe, it, expect, vi, beforeEach } from "vitest";
import { probeTalentsoft } from "./probe-talentsoft.js";
import { clearRobotsCache } from "@job-harvester/connectors";

const talentsoftHtml = `<html><body>__VIEWSTATE talentsoft <a href="Pages/x.aspx">link</a></body></html>`;

describe("probeTalentsoft", () => {
  beforeEach(() => {
    clearRobotsCache();
  });
  it("returns the first candidate domain that responds ok and carries Talentsoft markers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === "https://recrutement.acme.fr/") return new Response("not available", { status: 200 });
      if (url === "https://acme-recrute.talent-soft.com/") return new Response(talentsoftHtml, { status: 200 });
      return new Response("nope", { status: 404 });
    });

    const result = await probeTalentsoft("acme", fetchImpl);

    expect(result).toBe("acme-recrute.talent-soft.com");
  });

  it("returns undefined when none of the candidate domains carry Talentsoft markers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      return new Response("nothing here", { status: 200 });
    });

    const result = await probeTalentsoft("not-a-talentsoft-company", fetchImpl);

    expect(result).toBeUndefined();
  });

  it("skips a candidate domain disallowed by robots.txt without fetching its root page", async () => {
    const rootCalls: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(["User-agent: *", "Disallow: /"].join("\n"), { status: 200 });
      rootCalls.push(url);
      return new Response(talentsoftHtml, { status: 200 });
    });

    const result = await probeTalentsoft("acme", fetchImpl);

    expect(result).toBeUndefined();
    expect(rootCalls).toEqual([]);
  });
});
