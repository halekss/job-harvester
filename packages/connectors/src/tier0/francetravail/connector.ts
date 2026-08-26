import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchFranceTravailOffers, checkFranceTravailHealth, FRANCE_TRAVAIL_CONNECTOR_ID } from "./client.js";
import { normalizeFranceTravailOffer } from "./normalize.js";

export const francetravailConnector: Connector = {
  id: FRANCE_TRAVAIL_CONNECTOR_ID,
  tier: 0,

  supports(): boolean {
    // France Travail est un jobboard généraliste (CDI/CDD/stage/alternance) — contrairement à
    // labonnealternance, qui est alternance-only par construction, il n'y a aucune raison de
    // l'écarter pour une campagne visant les stages ou les contrats classiques.
    return true;
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    const clientId = ctx.env.FRANCE_TRAVAIL_CLIENT_ID;
    const clientSecret = ctx.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error("FRANCE_TRAVAIL_CLIENT_ID/FRANCE_TRAVAIL_CLIENT_SECRET is not set");
    }
    for await (const item of fetchFranceTravailOffers(query, { clientId, clientSecret, fetchImpl: ctx.fetchImpl })) {
      yield { source: FRANCE_TRAVAIL_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeFranceTravailOffer(raw);
  },

  async healthCheck() {
    const clientId = process.env.FRANCE_TRAVAIL_CLIENT_ID;
    const clientSecret = process.env.FRANCE_TRAVAIL_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      return {
        connectorId: FRANCE_TRAVAIL_CONNECTOR_ID,
        ok: false,
        latencyMs: 0,
        checkedAt: new Date().toISOString(),
        message: "FRANCE_TRAVAIL_CLIENT_ID/FRANCE_TRAVAIL_CLIENT_SECRET is not set",
      };
    }
    return checkFranceTravailHealth({ clientId, clientSecret });
  },
};
