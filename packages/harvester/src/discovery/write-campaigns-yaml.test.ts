import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { addTargetToCampaigns } from "./write-campaigns-yaml.js";

const tmpDirs: string[] = [];
afterEach(() => {
  for (const dir of tmpDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function tmpCampaignsFile(yaml: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), "job-harvester-discovery-"));
  tmpDirs.push(dir);
  const filePath = path.join(dir, "campaigns.yaml");
  writeFileSync(filePath, yaml, "utf-8");
  return filePath;
}

const baseYaml = `campaigns:
  - id: campaign-a
    romeCodes: [M1403]
    keywords: ["data"]
    locations: []
    contractTypes: [apprentissage]
    targets:
      smartrecruiters: ["EXISTING"]
  - id: campaign-b
    romeCodes: [M1802]
    keywords: ["dev"]
    locations: []
    contractTypes: [apprentissage]
`;

describe("addTargetToCampaigns", () => {
  it("adds the target to targets.<platform> of every campaign, creating targets/platform lists as needed", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "digitalRecruiters", "joinus.acme.fr");

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
    expect(written.campaigns[0]!.targets!.smartrecruiters).toEqual(["EXISTING"]);
    expect(written.campaigns[1]!.targets!.digitalRecruiters).toEqual(["joinus.acme.fr"]);
  });

  it("does not duplicate a target that is already present", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "smartrecruiters", "EXISTING");

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.smartrecruiters).toEqual(["EXISTING"]);
  });

  it("supports an object target (Workday {tenant, site, dc})", () => {
    const filePath = tmpCampaignsFile(baseYaml);

    addTargetToCampaigns(filePath, "workday", { tenant: "acme", site: "acme_jobs", dc: "wd1" });

    const written = parse(readFileSync(filePath, "utf-8")) as { campaigns: Array<{ targets?: Record<string, unknown[]> }> };
    expect(written.campaigns[0]!.targets!.workday).toEqual([{ tenant: "acme", site: "acme_jobs", dc: "wd1" }]);
  });
});
