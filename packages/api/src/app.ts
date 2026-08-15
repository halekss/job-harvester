import { Hono } from "hono";
import type { Connector } from "@job-harvester/core";
import type { Db } from "@job-harvester/db";
import type { CampaignConfig } from "@job-harvester/harvester";
import { registerOfferRoutes } from "./routes/offers.js";
import { registerEventRoutes } from "./routes/events.js";

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
  return app;
}
