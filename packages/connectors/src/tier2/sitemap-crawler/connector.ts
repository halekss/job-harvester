import type { Connector, ConnectorContext, HarvestQuery, RawOffer } from "@job-harvester/core";
import { fetchSitemapCrawlerOffers, checkSitemapCrawlerHealth, SITEMAP_CRAWLER_CONNECTOR_ID } from "./client.js";
import { normalizeJsonLdOffer } from "./normalize.js";

export const sitemapCrawlerConnector: Connector = {
  id: SITEMAP_CRAWLER_CONNECTOR_ID,
  tier: 2,
  locationScoped: false,

  supports(query: HarvestQuery): boolean {
    return Boolean(query.targets?.sitemapCrawler && query.targets.sitemapCrawler.length > 0);
  },

  async *fetch(query: HarvestQuery, ctx: ConnectorContext): AsyncIterable<RawOffer> {
    for await (const item of fetchSitemapCrawlerOffers(query, { fetchImpl: ctx.fetchImpl })) {
      yield { source: SITEMAP_CRAWLER_CONNECTOR_ID, payload: item };
    }
  },

  normalize(raw: RawOffer) {
    return normalizeJsonLdOffer(raw);
  },

  async healthCheck() {
    return checkSitemapCrawlerHealth({});
  },
};
