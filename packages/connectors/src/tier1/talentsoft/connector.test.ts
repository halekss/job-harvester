import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { HarvestQuery } from "@job-harvester/core";
import { talentsoftConnector } from "./connector.js";

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

describe("talentsoftConnector", () => {
  it("declares tier 1, locationScoped false, and supports only when talentsoft targets are configured", () => {
    expect(talentsoftConnector.tier).toBe(1);
    expect(talentsoftConnector.locationScoped).toBe(false);
    expect(talentsoftConnector.supports(query)).toBe(true);
    expect(talentsoftConnector.supports({ ...query, targets: {} })).toBe(false);
  });

  it("fetches raw offers wrapping each item with the connector id", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.endsWith("/robots.txt")) return new Response("Not found", { status: 404 });
      if (url === "https://recrutement.mgen.fr/") {
        return new Response("<html><body>__VIEWSTATE talentsoft</body></html>", { status: 200 });
      }
      return new Response(rssXml, { status: 200 });
    });

    const raws = [];
    for await (const raw of talentsoftConnector.fetch(query, { fetchImpl, env: {} })) {
      raws.push(raw);
    }

    expect(raws).toHaveLength(3);
    expect(raws[0]).toMatchObject({ source: "talentsoft" });
    expect(talentsoftConnector.normalize(raws[0]!).title).toBe("Gestionnaire Prestations Services H/F");
  });
});
