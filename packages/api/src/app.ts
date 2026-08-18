import { Hono } from "hono";
import type { Connector } from "@job-harvester/core";
import type { Db } from "@job-harvester/db";
import type { CampaignConfig } from "@job-harvester/harvester";
import { registerOfferRoutes } from "./routes/offers.js";
import { registerEventRoutes } from "./routes/events.js";
import { registerHarvestRoutes } from "./routes/harvest.js";
import { registerHealthRoutes } from "./routes/health.js";
import { registerCampaignRoutes } from "./routes/campaigns.js";
import { registerStatsRoutes } from "./routes/stats.js";

export interface AppDeps {
  db: Db;
  connectors: Connector[];
  campaigns: CampaignConfig[];
  env: Record<string, string | undefined>;
}

export function createApp(deps: AppDeps): Hono {
  const app = new Hono();
  registerOfferRoutes(app, deps);
  registerEventRoutes(app, deps);
  registerHarvestRoutes(app, deps);
  registerHealthRoutes(app, deps);
  registerCampaignRoutes(app, deps);
  registerStatsRoutes(app, deps);
  return app;
}
