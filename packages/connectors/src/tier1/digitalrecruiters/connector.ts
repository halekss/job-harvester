import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchDigitalRecruitersOffers, checkDigitalRecruitersHealth, DIGITALRECRUITERS_CONNECTOR_ID } from "./client.js";
import { normalizeDigitalRecruitersOffer } from "./normalize.js";

export const digitalRecruitersConnector: Connector = {
  id: DIGITALRECRUITERS_CONNECTOR_ID,
  tier: 1,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.digitalRecruiters && query.targets.digitalRecruiters.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchDigitalRecruitersOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: DIGITALRECRUITERS_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeDigitalRecruitersOffer(raw);
  },

  async healthCheck() {
    return checkDigitalRecruitersHealth({});
  },
};
