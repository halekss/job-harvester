import type { Hono } from "hono";
import { runCampaign, type RunSummary } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const supportedConnectors = connectors.filter((connector) =>
      campaign.locations.some((location) =>
        connector.supports({
          campaignId: campaign.id,
          keywords: campaign.keywords,
          romeCodes: campaign.romeCodes,
          location,
          contractTypes: campaign.contractTypes,
        }),
      ),
    );
    if (supportedConnectors.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 500);

    const summaries: RunSummary[] = [];
    for (const connector of supportedConnectors) {
      summaries.push(await runCampaign(campaign, connector, db, env));
    }
    return c.json({ summaries });
  });
}
