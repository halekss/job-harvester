import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchTalentsoftOffers, checkTalentsoftHealth } from "./client.js";

const fixturesDir = path.resolve(fileURLToPath(import.meta.url), "../../../../../../fixtures/talentsoft");
const rssXml = readFileSync(path.join(fixturesDir, "offer-rss.xml"), "utf-8");

const query: HarvestQuery = {
  campaignId: "test",
  keywords: [],
  romeCodes: [],
  location: { label: "Paris", lat: 48.85, lng: 2.35, radiusKm: 30 },
  contractTypes: ["apprentissage"],
  targets: { talentsoft: ["recrutement.mgen.fr"] },
};

const talentsoftRootHtml = `<html><body>__VIEWSTATE talentsoft <a href="Pages/x.aspx">link</a></body></html>`;

function fetchImplFor(rootHtml: string, rssBody: string | null): ReturnType<typeof vi.fn<typeof fetch>> {
  return vi.fn<typeof fetch>(async (input) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
    if (url === "https://recrutement.mgen.fr/") return new Response(rootHtml, { status: 200 });
    if (url.includes("/handlers/offerRss.ashx")) {
      if (rssBody === null) return new Response("nope", { status: 500 });
      return new Response(rssBody, { status: 200 });
    }
    return new Response("nope", { status: 404 });
  });
}

describe("fetchTalentsoftOffers", () => {
  it("detects a Talentsoft platform and yields items parsed from the RSS feed", async () => {
    const fetchImpl = fetchImplFor(talentsoftRootHtml, rssXml);

    const results: unknown[] = [];
    for await (const item of fetchTalentsoftOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({
      domain: "recrutement.mgen.fr",
      item: { title: "2026-5391 - Gestionnaire Prestations Services H/F" },
    });
  });

  it("filters items whose title/description don't match campaign keywords (JOB-audit-2026-08-20)", async () => {
    const keywordQuery: HarvestQuery = { ...query, keywords: ["data"] };
    const rss = [
      "<rss><channel>",
      "<item><link>https://recrutement.mgen.fr/offre/1</link><title>Alternance Data Analyst</title><description>Analyse de donnees.</description></item>",
      "<item><link>https://recrutement.mgen.fr/offre/2</link><title>Alternance Comptable</title><description>Comptabilite generale.</description></item>",
      "</channel></rss>",
    ].join("");
    const fetchImpl = fetchImplFor(talentsoftRootHtml, rss);

    const results: unknown[] = [];
    for await (const item of fetchTalentsoftOffers(keywordQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({ item: { title: "Alternance Data Analyst" } });
  });

  it("skips a target whose root page has none of the Talentsoft markers (JOB-31 false-positive guard)", async () => {
    const fetchImpl = fetchImplFor("<html><body>WordPress site, nothing here</body></html>", rssXml);

    const results: unknown[] = [];
    for await (const item of fetchTalentsoftOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
    const rssCalls = fetchImpl.mock.calls.filter(([input]) => String(input).includes("offerRss.ashx"));
    expect(rssCalls).toHaveLength(0);
  });

  it("skips a target disallowed by robots.txt without fetching it", async () => {
    // Distinct domain from the other tests in this file: robots.txt results are cached
    // per-origin at module scope (packages/connectors/src/lib/robots.ts), so reusing
    // recrutement.mgen.fr here would silently reuse another test's cached (permissive) result.
    const disallowedQuery: HarvestQuery = { ...query, targets: { talentsoft: ["robots-disallowed.example"] } };
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response(["User-agent: *", "Disallow: /"].join("\n"), { status: 200 });
      return new Response(talentsoftRootHtml, { status: 200 });
    });

    const results: unknown[] = [];
    for await (const item of fetchTalentsoftOffers(disallowedQuery, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
    const pageCalls = fetchImpl.mock.calls.filter(([input]) => !String(input).endsWith("/robots.txt"));
    expect(pageCalls).toHaveLength(0);
  });

  it("skips a target whose RSS feed request fails, without throwing", async () => {
    const fetchImpl = fetchImplFor(talentsoftRootHtml, null);

    const results: unknown[] = [];
    for await (const item of fetchTalentsoftOffers(query, { fetchImpl })) {
      results.push(item);
    }

    expect(results).toEqual([]);
  });
});

describe("checkTalentsoftHealth", () => {
  it("reports ok:true when the health-check RSS request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response(rssXml, { status: 200 }));
    const health = await checkTalentsoftHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "talentsoft", ok: true });
  });

  it("reports ok:false when the health-check request fails", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 500 }));
    const health = await checkTalentsoftHealth({ fetchImpl });
    expect(health).toMatchObject({ connectorId: "talentsoft", ok: false });
  });
});
