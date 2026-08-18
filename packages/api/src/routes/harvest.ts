import type { Hono } from "hono";
import { runCampaignAcrossConnectors } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);

    const summaries = await runCampaignAcrossConnectors(campaign, connectors, db, env);
    // 422, pas 500 : ce n'est pas une panne serveur, la configuration de la campagne ne
    // correspond simplement à aucun connecteur enregistré (JOB-29).
    if (summaries.length === 0) return c.json({ error: "no_connector_supports_campaign" }, 422);

    return c.json({ summaries });
  });
}
