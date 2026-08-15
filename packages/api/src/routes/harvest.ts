import type { Hono } from "hono";
import { runCampaign } from "@job-harvester/harvester";
import type { AppDeps } from "../app.js";

export function registerHarvestRoutes(app: Hono, { db, connectors, campaigns, env }: AppDeps): void {
  app.post("/harvest/:campaignId/run", async (c) => {
    const campaign = campaigns.find((cmp) => cmp.id === c.req.param("campaignId"));
    if (!campaign) return c.json({ error: "campaign_not_found" }, 404);
    // v1 runs a single campaign against a single connector; connector selection
    // by campaign contents is deferred to the multi-connector orchestrator sub-project.
    const connector = connectors.find((conn) => conn.id === "labonnealternance");
    if (!connector) return c.json({ error: "no_connector_supports_campaign" }, 500);
    const summary = await runCampaign(campaign, connector, db, env);
    return c.json({ summary });
  });
}
