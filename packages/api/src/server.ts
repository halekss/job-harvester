import { serve } from "@hono/node-server";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createDb } from "@job-harvester/db";
import { loadCampaigns, startScheduler } from "@job-harvester/harvester";
import {
  labonnealternanceConnector,
  francetravailConnector,
  workdayConnector,
  smartrecruitersConnector,
  jsonldGenericConnector,
  sitemapCrawlerConnector,
  talentsoftConnector,
  digitalRecruitersConnector,
  welcometothejungleConnector,
} from "@job-harvester/connectors";
import { createApp } from "./app.js";

// Resolve against the repo root rather than process.cwd(): `pnpm --filter @job-harvester/api exec`
// (used by the root `dev:api` script) runs with cwd set to this package's directory, not the repo root.
const repoRoot = path.resolve(fileURLToPath(import.meta.url), "../../../..");

try {
  process.loadEnvFile(path.join(repoRoot, ".env"));
} catch {
  // .env is optional (e.g. tests, CI) — fall back to whatever is already in process.env.
}

const db = createDb(path.resolve(repoRoot, process.env.DB_PATH ?? "./job-harvester.sqlite"));
const campaigns = loadCampaigns(path.resolve(repoRoot, process.env.CAMPAIGNS_FILE ?? "./config/campaigns.yaml"));
const connectors = [
  labonnealternanceConnector,
  francetravailConnector,
  workdayConnector,
  smartrecruitersConnector,
  jsonldGenericConnector,
  sitemapCrawlerConnector,
  talentsoftConnector,
  digitalRecruitersConnector,
  welcometothejungleConnector,
];

const app = createApp({ db, connectors, campaigns, env: process.env });

if (process.env.ENABLE_SCHEDULER === "true") {
  startScheduler(campaigns, connectors, db, process.env);
  console.log("job-harvester scheduler enabled (ENABLE_SCHEDULER=true)");
}

serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (info) => {
  console.log(`job-harvester api listening on http://localhost:${info.port}`);
});
