import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchTalentsoftOffers, checkTalentsoftHealth, TALENTSOFT_CONNECTOR_ID } from "./client.js";
import { normalizeTalentsoftOffer } from "./normalize.js";

export const talentsoftConnector: Connector = {
  id: TALENTSOFT_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.talentsoft && query.targets.talentsoft.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchTalentsoftOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: TALENTSOFT_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeTalentsoftOffer(raw);
  },

  async healthCheck() {
    return checkTalentsoftHealth({});
  },
};
