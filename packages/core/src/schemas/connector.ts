import { z } from "zod";
import { ContractTypeSchema, type NormalizedOffer } from "./normalized-offer.js";

export const HarvestLocationSchema = z.object({
  label: z.string(),
  lat: z.number(),
  lng: z.number(),
  radiusKm: z.number(),
});
export type HarvestLocation = z.infer<typeof HarvestLocationSchema>;

export const HarvestQuerySchema = z.object({
  campaignId: z.string(),
  keywords: z.array(z.string()),
  romeCodes: z.array(z.string()),
  location: HarvestLocationSchema,
  contractTypes: z.array(ContractTypeSchema),
});
export type HarvestQuery = z.infer<typeof HarvestQuerySchema>;

export interface RawOffer {
  source: string;
  payload: unknown;
}

export interface ConnectorContext {
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
}

export interface ConnectorHealth {
  connectorId: string;
  ok: boolean;
  latencyMs: number;
  checkedAt: string;
  message?: string;
}

export interface Connector {
  id: string;
  tier: 0 | 1 | 2;
  supports(query: HarvestQuery): boolean;
  fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer>;
  normalize(raw: RawOffer): NormalizedOffer;
  healthCheck(): Promise<ConnectorHealth>;
}
