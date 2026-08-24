import { readFileSync, writeFileSync } from "node:fs";
import { parse, stringify } from "yaml";

export type DiscoveryPlatform = "workday" | "smartrecruiters" | "talentsoft" | "digitalRecruiters";
export type DiscoveryTarget = string | { tenant: string; site: string; dc: string };

interface CampaignsFileShape {
  campaigns: Array<{ targets?: Record<string, unknown[]> }>;
}

export function addTargetToCampaigns(filePath: string, platform: DiscoveryPlatform, target: DiscoveryTarget): void {
  const raw = readFileSync(filePath, "utf-8");
  const parsed = parse(raw) as CampaignsFileShape;

  for (const campaign of parsed.campaigns) {
    campaign.targets ??= {};
    const list = (campaign.targets[platform] ??= []);
    const alreadyPresent = list.some((existing) => JSON.stringify(existing) === JSON.stringify(target));
    if (!alreadyPresent) list.push(target);
  }

  writeFileSync(filePath, stringify(parsed));
}
