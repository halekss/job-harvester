// packages/harvester/src/scheduler.ts
import { Cron } from "croner";
import type { Connector } from "@job-harvester/core";
import type { Db } from "@job-harvester/db";
import type { CampaignConfig } from "./config/campaign-schema.js";
import { runCampaignAcrossConnectors } from "./orchestrator.js";

export interface Scheduler {
  stop(): void;
}

function hasSchedule(campaign: CampaignConfig): campaign is CampaignConfig & { schedule: string } {
  return campaign.schedule !== undefined;
}

export function startScheduler(
  campaigns: CampaignConfig[],
  connectors: Connector[],
  db: Db,
  env: Record<string, string | undefined>,
): Scheduler {
  const jobs = campaigns.filter(hasSchedule).map((campaign) =>
    new Cron(
      campaign.schedule,
      { catch: (err: unknown) => console.error(`[scheduler] campagne ${campaign.id} :`, err) },
      async () => {
        await runCampaignAcrossConnectors(campaign, connectors, db, env);
      },
    ),
  );

  return {
    stop() {
      for (const job of jobs) job.stop();
    },
  };
}
