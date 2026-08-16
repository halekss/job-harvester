import { serve } from "@hono/node-server";
import { createDb } from "@job-harvester/db";
import { loadCampaigns } from "@job-harvester/harvester";
import { labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector } from "@job-harvester/connectors";
import { createApp } from "./app.js";

const db = createDb(process.env.DB_PATH ?? "./job-harvester.sqlite");
const campaigns = loadCampaigns(process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml");

const app = createApp({
  db,
  connectors: [labonnealternanceConnector, francetravailConnector, workdayConnector, smartrecruitersConnector],
  campaigns,
  env: process.env,
});

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
