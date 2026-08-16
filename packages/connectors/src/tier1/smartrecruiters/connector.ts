import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchSmartRecruitersOffers, checkSmartRecruitersHealth, SMARTRECRUITERS_CONNECTOR_ID } from "./client.js";
import { normalizeSmartRecruitersOffer } from "./normalize.js";

export const smartrecruitersConnector: Connector = {
  id: SMARTRECRUITERS_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.smartrecruiters && query.targets.smartrecruiters.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchSmartRecruitersOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: SMARTRECRUITERS_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeSmartRecruitersOffer(raw);
  },

  async healthCheck() {
    return checkSmartRecruitersHealth({});
  },
};
