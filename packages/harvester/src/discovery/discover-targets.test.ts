import { describe, it, expect, afterEach, vi } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { createDb, offers as offersTable, discoveryProbes, offerToRow } from "@job-harvester/db";
import { exactDedupKeyFromUrl, type NormalizedOffer } from "@job-harvester/core";
import { discoverTargets } from "./discover-targets.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpDbPath(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-db-"));
  tmpDirs.push(dir);
  return path.join(dir, "test.sqlite");
}

function tmpCampaignsFile(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-yaml-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(
    filePath,
    `campaigns:
  - id: campaign-a
    romeCodes: [M1403]
    keywords: ["data"]
    locations: []
    contractTypes: [apprentissage]
`,
    "utf-8",
  );
  return filePath;
}

function makeOffer(companyName: string, canonicalUrl: string): NormalizedOffer {
  return {
    id: canonicalUrl,
    source: "fake",
    sourceOfferId: canonicalUrl,
    canonicalUrl,
    title: "Job",
    company: { name: companyName, normalizedName: companyName.toLowerCase() },
    location: { label: "Lille", city: "Lille" },
    contractType: "apprentissage",
    romeCodes: [],
    descriptionText: "desc",
    firstSeenAt: "2026-08-21T00:00:00.000Z",
    lastSeenAt: "2026-08-21T00:00:00.000Z",
    lifecycle: "active",
    dedupKey: exactDedupKeyFromUrl(canonicalUrl),
    sourceRefs: [{ source: "fake", sourceOfferId: canonicalUrl, canonicalUrl }],
    rawPayload: {},
  };
}

describe("discoverTargets", () => {
  it("probes only companies never seen in discovery_probes, records every result, and writes confirmed targets to campaigns.yaml", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme", "https://example.com/1"))).run();
    const campaignsFilePath = tmpCampaignsFile();

    const fetchImpl = vi.fn<typeof fetch>(async (input) => {
      const url = String(input);
      if (url.includes("digitalrecruiters.com")) return new Response(JSON.stringify({ count: 5 }), { status: 200 });
      return new Response("nope", { status: 404 });
    });

    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl });

    expect(summary.probed).toBe(1);
    expect(summary.found).toEqual([{ companySlug: "acme", platform: "digitalRecruiters", target: "joinus.acme.fr" }]);

    const probes = db.select().from(discoveryProbes).all();
    expect(probes).toHaveLength(4); // une ligne par plateforme, trouvée ou pas

    const written = parse(readFileSync(campaignsFilePath, "utf-8")) as { campaigns: Array<{ targets?: { digitalRecruiters?: string[] } }> };
    expect(written.campaigns[0]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
  });

  it("never re-probes a company already present in discovery_probes", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme", "https://example.com/1"))).run();
    const campaignsFilePath = tmpCampaignsFile();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 404 }));

    await discoverTargets(db, campaignsFilePath, { fetchImpl });
    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl });

    expect(summary.probed).toBe(0);
  });

  it("caps the number of newly-probed companies at the given limit", async () => {
    const db = createDb(tmpDbPath());
    db.insert(offersTable).values(offerToRow(makeOffer("Acme One", "https://example.com/1"))).run();
    db.insert(offersTable).values(offerToRow(makeOffer("Acme Two", "https://example.com/2"))).run();
    db.insert(offersTable).values(offerToRow(makeOffer("Acme Three", "https://example.com/3"))).run();
    const campaignsFilePath = tmpCampaignsFile();
    const fetchImpl = vi.fn<typeof fetch>(async () => new Response("nope", { status: 404 }));

    const summary = await discoverTargets(db, campaignsFilePath, { fetchImpl, limit: 2 });

    expect(summary.probed).toBe(2);
  });
});
