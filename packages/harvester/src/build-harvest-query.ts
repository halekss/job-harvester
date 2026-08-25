import type { HarvestQuery } from "@job-harvester/core";
import type { CampaignConfig, LocationConfig } from "./config/campaign-schema.js";

// Seule source de vérité pour construire un HarvestQuery à partir d'une campagne et d'une
// localisation — évite la dérive entre orchestrator.ts et la route HTTP /harvest (JOB-24 :
// cette duplication a déjà causé un vrai bug, le champ `targets` oublié dans l'une des deux
// constructions).
export function buildHarvestQuery(campaign: CampaignConfig, location: LocationConfig): HarvestQuery {
  return {
    campaignId: campaign.id,
    keywords: campaign.keywords,
    romeCodes: campaign.romeCodes,
    location,
    contractTypes: campaign.contractTypes,
    targets: campaign.targets,
  };
}
