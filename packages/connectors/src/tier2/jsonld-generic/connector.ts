import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchJsonLdGenericOffers, checkJsonLdGenericHealth, JSONLD_GENERIC_CONNECTOR_ID } from "./client.js";
import { normalizeJsonLdOffer } from "./normalize.js";

export const jsonldGenericConnector: Connector = {
  id: JSONLD_GENERIC_CONNECTOR_ID,
  tier: 2,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.jsonldGeneric && query.targets.jsonldGeneric.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchJsonLdGenericOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: JSONLD_GENERIC_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeJsonLdOffer(raw);
  },

  async healthCheck() {
    return checkJsonLdGenericHealth({});
  },
};
