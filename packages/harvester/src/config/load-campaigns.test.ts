import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadCampaigns, findCampaign } from "./load-campaigns.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function writeCampaignsFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-campaigns-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(filePath, yaml);
  return filePath;
}

describe("loadCampaigns", () => {
  it("parses a valid campaigns file", () => {
    const filePath = writeCampaignsFile(`
campaigns:
  - id: alternance-data-hdf
    romeCodes: [M1403, M1805]
    keywords: ["data analyst"]
    locations:
      - { label: "Lille 59000", lat: 50.630951, lng: 3.045391, radiusKm: 30 }
    contractTypes: [apprentissage, professionnalisation]
    schedule: "0 7 * * *"
`);
    const campaigns = loadCampaigns(filePath);
    expect(campaigns).toHaveLength(1);
    expect(findCampaign(campaigns, "alternance-data-hdf")?.romeCodes).toEqual(["M1403", "M1805"]);
  });

  it("rejects a file with an invalid contract type", () => {
    const filePath = writeCampaignsFile(`
campaigns:
  - id: bad
    romeCodes: [M1403]
    keywords: []
    locations: []
    contractTypes: [cdi]
`);
    expect(() => loadCampaigns(filePath)).toThrow();
  });
});
