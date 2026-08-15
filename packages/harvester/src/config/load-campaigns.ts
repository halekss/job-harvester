import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { CampaignsFileSchema, type CampaignConfig } from "./campaign-schema.js";

export function loadCampaigns(filePath: string): CampaignConfig[] {
  const raw = readFileSync(filePath, "utf-8");
  return CampaignsFileSchema.parse(parse(raw)).campaigns;
}

export function findCampaign(campaigns: CampaignConfig[], id: string): CampaignConfig | undefined {
  return campaigns.find((campaign) => campaign.id === id);
}
