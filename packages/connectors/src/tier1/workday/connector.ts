import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchWorkdayOffers, checkWorkdayHealth, WORKDAY_CONNECTOR_ID } from "./client.js";
import { normalizeWorkdayOffer } from "./normalize.js";

export const workdayConnector: Connector = {
  id: WORKDAY_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.workday && query.targets.workday.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchWorkdayOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: WORKDAY_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeWorkdayOffer(raw);
  },

  async healthCheck() {
    return checkWorkdayHealth({});
  },
};
