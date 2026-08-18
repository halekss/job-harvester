import { z } from "zod";
import { ContractTypeSchema, HarvestTargetsSchema } from "@job-harvester/core";

export const LocationConfigSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number(),
});
export type LocationConfig = z.infer<typeof LocationConfigSchema>;

export const CampaignConfigSchema = z.object({
  id: z.string(),
  romeCodes: z.array(z.string()),
  keywords: z.array(z.string()),
  locations: z.array(LocationConfigSchema),
  contractTypes: z.array(ContractTypeSchema),
  targets: HarvestTargetsSchema.optional(),
  schedule: z.string().optional(),
});
export type CampaignConfig = z.infer<typeof CampaignConfigSchema>;

export const CampaignsFileSchema = z.object({
  campaigns: z.array(CampaignConfigSchema),
});
