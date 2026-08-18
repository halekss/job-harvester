import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchWttjOffers, checkWttjHealth, getWttjCredentials, WTTJ_CONNECTOR_ID } from "./client.js";
import { normalizeWttjOffer } from "./normalize.js";

// "Large" connector (comme labonnealternance/francetravail) : pas de ciblage par entreprise,
// recherche directe via query.keywords/query.location sur l'index Algolia public de WTTJ.
export const welcometothejungleConnector: Connector = {
  id: WTTJ_CONNECTOR_ID,
  tier: 1,
  locationScoped: true,

  supports(): boolean {
    // Sans clés Algolia configurées (WTTJ_ALGOLIA_APP_ID / WTTJ_ALGOLIA_API_KEY), le connecteur
    // reste inactif plutôt que d'échouer bruyamment à chaque campagne — voir docs/sources.md
    // pour la procédure de récupération manuelle de ces identifiants.
    return Boolean(getWttjCredentials(process.env));
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    const credentials = getWttjCredentials(ctx.env);
    if (!credentials) {
      throw new Error("WTTJ_ALGOLIA_APP_ID / WTTJ_ALGOLIA_API_KEY is not set");
    }
    for await (const hit of fetchWttjOffers(query, credentials, { fetchImpl: ctx.fetchImpl })) {
      yield { source: WTTJ_CONNECTOR_ID, payload: hit };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeWttjOffer(raw);
  },

  async healthCheck() {
    return checkWttjHealth(getWttjCredentials(process.env), {});
  },
};
