import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchLbaOffers, checkLbaHealth, LBA_CONNECTOR_ID } from "./client.js";
import { normalizeLbaOffer } from "./normalize.js";

export const labonnealternanceConnector: Connector = {
  id: LBA_CONNECTOR_ID,
  tier: 0,

  supports(query: HarvestQuery): boolean {
    return query.contractTypes.some((type) => type === "apprentissage" || type === "professionnalisation");
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    const apiKey = ctx.env.LBA_API_KEY;
    if (!apiKey) {
      throw new Error("LBA_API_KEY is not set");
    }
    for await (const job of fetchLbaOffers(query, { apiKey, fetchImpl: ctx.fetchImpl })) {
      yield { source: LBA_CONNECTOR_ID, payload: job };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeLbaOffer(raw);
  },

  async healthCheck() {
    const apiKey = process.env.LBA_API_KEY;
    if (!apiKey) {
      return { connectorId: LBA_CONNECTOR_ID, ok: false, latencyMs: 0, checkedAt: new Date().toISOString(), message: "LBA_API_KEY is not set" };
    }
    return checkLbaHealth({ apiKey });
  },
};
