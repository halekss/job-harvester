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
  const jobs: Cron[] = [];
  for (const campaign of campaigns.filter(hasSchedule)) {
    try {
      jobs.push(
        new Cron(
          campaign.schedule,
          { catch: (err: unknown) => console.error(`[scheduler] campagne ${campaign.id} :`, err) },
          async () => {
            await runCampaignAcrossConnectors(campaign, connectors, db, env);
          },
        ),
      );
    } catch (err) {
      // JOB-5 : un schedule cron invalide sur une campagne ne doit pas faire planter le
      // démarrage du scheduler (ni, par ricochet, tout le process API) — on l'ignore et on
      // continue avec les autres campagnes.
      console.error(`[scheduler] schedule invalide pour la campagne ${campaign.id}, campagne ignorée :`, err);
    }
  }

  return {
    stop() {
      for (const job of jobs) job.stop();
    },
  };
}
