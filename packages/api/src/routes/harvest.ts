import type { Hono } from "hono";
import { runCampaign, buildHarvestQuery, type RunSummary } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const supportedConnectors = connectors.filter((connector) =>
      campaign.locations.some((location) => connector.supports(buildHarvestQuery(campaign, location))),
    );
    // 422, pas 500 : ce n'est pas une panne serveur, la configuration de la campagne ne
    // correspond simplement à aucun connecteur enregistré (JOB-29).
    if (supportedConnectors.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    const summaries: RunSummary[] = [];
    for (const connector of supportedConnectors) {
      summaries.push(await runCampaign(campaign, connector, db, env));
    }
    return c.json({ summaries });
  });
}
