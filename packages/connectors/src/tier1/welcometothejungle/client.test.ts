import { describe, it, expect, vi } from "vitest";
import type { HarvestQuery } from "@job-harvester/core";
import { fetchWttjOffers, checkWttjHealth, getWttjCredentials } from "./client.js";

const query: HarvestQuery = {
  campaignId: "test",
  keywords: ["data"],
  romeCodes: [],
  location: { label: "Lille", lat: 50.63, lng: 3.05, radiusKm: 30 },
  contractTypes: ["apprentissage"],
};

const credentials = { appId: "CSEKHVMS53", apiKey: "test-key" };

function hit(overrides: Partial<{ objectID: string; slug: string; name: string; profile: string }> = {}) {
  return {
    objectID: overrides.objectID ?? "1",
    slug: overrides.slug ?? "offer-1",
    name: overrides.name ?? "Alternance Data Analyst",
    profile: overrides.profile,
    organization: { name: "Acme", slug: "acme" },
  };
}

function algoliaResponse(hits: unknown[], page: number, nbPages: number) {
  return new Response(JSON.stringify({ hits, nbHits: hits.length, page, nbPages }), { status: 200 });
}

describe("getWttjCredentials", () => {
  it("returns undefined when either env var is missing", () => {
    expect(getWttjCredentials({})).toBeUndefined();
    expect(getWttjCredentials({ WTTJ_ALGOLIA_APP_ID: "x" })).toBeUndefined();
    expect(getWttjCredentials({ WTTJ_ALGOLIA_APP_ID: "x", WTTJ_ALGOLIA_API_KEY: "y" })).toEqual({ appId: "x", apiKey: "y" });
  });
});

describe("fetchWttjOffers", () => {
  it("queries the csekhvms53-dsn.algolia.net jobs index with the expected headers", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input, init) => {
      const url = String(input);
      expect(url).toBe("https://csekhvms53-dsn.algolia.net/1/indexes/wk_cms_jobs_production/query");
      const headers = init?.headers as Record<string, string>;
      expect(headers["x-algolia-application-id"]).toBe("CSEKHVMS53");
      expect(headers["x-algolia-api-key"]).toBe("test-key");
      // Vérifié en direct le 2026-08-20 : la clé Algolia capturée est restreinte par referer côté
      // Algolia (secured API key) - sans ce header, l'appel échoue en HTTP 403 "Method not allowed
      // with this referer", clé pourtant valide.
      expect(headers["referer"]).toBe("https://www.welcometothejungle.com/");
      return algoliaResponse([hit()], 0, 1);
    });

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(query, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(results).toEqual([hit()]);
  });

  // JOB-audit-2026-08-20 : joindre tous les mots-clés de la campagne en une seule requête
  // Algolia ("data analyst data quality statistiques BI") donnait 0 résultat en direct, alors
  // que chaque mot-clé pris séparément en donnait des dizaines - Algolia traite la chaîne comme
  // une seule recherche exigeante, pas comme un OU entre mots-clés.
  it("issues one Algolia query per campaign keyword rather than joining them into one query string", async () => {
    const multiKeywordQuery: HarvestQuery = { ...query, keywords: ["data", "BI"] };
    const seenQueries: string[] = [];
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(init!.body as string) as { params: string };
      const params = new URLSearchParams(body.params);
      seenQueries.push(params.get("query")!);
      return algoliaResponse([], 0, 0);
    });

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(multiKeywordQuery, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(seenQueries).toEqual(["data", "BI"]);
  });

  it("dedupes a hit returned by more than one keyword query", async () => {
    const multiKeywordQuery: HarvestQuery = { ...query, keywords: ["data", "analyst"] };
    const sharedHit = hit({ objectID: "shared", name: "Alternance Data Analyst" });
    const onlyInSecond = hit({ objectID: "second", name: "Alternance Analyst Junior" });
    let call = 0;
    const fetchImpl = vi.fn<typeof fetch>(async () => {
      call += 1;
      if (call === 1) return algoliaResponse([sharedHit], 0, 1);
      return algoliaResponse([sharedHit, onlyInSecond], 0, 1);
    });

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(multiKeywordQuery, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(results).toEqual([sharedHit, onlyInSecond]);
  });

  // JOB-audit-2026-08-20 : Algolia matche "BI" par préfixe de mot y compris sur des offres sans
  // rapport ("Biologiste", "Biochimie") - vérifié en direct. Un filtre par limite de mot côté
  // client, comme déjà fait pour Workday, rejette ces faux positifs avant de les faire remonter.
  it("rejects a hit whose title/profile does not actually contain the keyword as a whole word (Algolia prefix false positive)", async () => {
    const biQuery: HarvestQuery = { ...query, keywords: ["BI"] };
    const falsePositive = hit({ objectID: "fp", name: "Biologiste médical (H/F)" });
    const legitimate = hit({ objectID: "ok", name: "Chargé de reporting BI" });
    const fetchImpl = vi.fn<typeof fetch>(async () => algoliaResponse([falsePositive, legitimate], 0, 1));

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(biQuery, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(results).toEqual([legitimate]);
  });

  it("issues a single unfiltered query when the campaign has no keywords (back-compat)", async () => {
    const noKeywordsQuery: HarvestQuery = { ...query, keywords: [] };
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(init!.body as string) as { params: string };
      const params = new URLSearchParams(body.params);
      expect(params.get("query")).toBe("");
      return algoliaResponse([hit()], 0, 1);
    });

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(noKeywordsQuery, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(fetchImpl.mock.calls.length).toBe(1);
    expect(results).toEqual([hit()]);
  });

  it("paginates a single keyword's query until nbPages is covered", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (_input, init) => {
      const body = JSON.parse(init!.body as string) as { params: string };
      const page = new URLSearchParams(body.params).get("page");
      return algoliaResponse([hit({ objectID: `p${page}` })], Number(page), 2);
    });

    const results: unknown[] = [];
    for await (const h of fetchWttjOffers(query, credentials, { fetchImpl })) {
      results.push(h);
    }

    expect(fetchImpl.mock.calls.length).toBe(2);
    expect(results).toHaveLength(2);
  });

  it("throws when the algolia request is not ok", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 403 }));
    const iterate = async () => {
      for await (const _hit of fetchWttjOffers(query, credentials, { fetchImpl })) {
        // drain
      }
    };
    await expect(iterate()).rejects.toThrow(/HTTP 403/);
  });
});

describe("checkWttjHealth", () => {
  it("reports ok:false without configured credentials", async () => {
    const health = await checkWttjHealth(undefined, {});
    expect(health).toMatchObject({ connectorId: "welcometothejungle", ok: false });
  });

  it("reports ok:true when the health-check request succeeds", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () => algoliaResponse([], 0, 0));
    const health = await checkWttjHealth(credentials, { fetchImpl });
    expect(health).toMatchObject({ connectorId: "welcometothejungle", ok: true });
  });
});
